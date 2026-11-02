import { createHmac, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import type { Database } from '../../src/lib/types/database';

interface LocalSupabaseStatus {
	ANON_KEY: string;
	API_URL: string;
	JWT_SECRET: string;
	SECRET_KEY: string;
}

function getLocalSupabaseStatus(): LocalSupabaseStatus {
	const executable = 'supabase';
	const args = ['status', '-o', 'json'];
	return JSON.parse(
		execFileSync(executable, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
	) as LocalSupabaseStatus;
}

function encode(value: unknown): string {
	return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function createUserToken(secret: string, userId: string, email: string): string {
	const issuedAt = Math.floor(Date.now() / 1000);
	const header = encode({ alg: 'HS256', typ: 'JWT' });
	const payload = encode({
		sub: userId,
		email,
		role: 'authenticated',
		aal: 'aal1',
		session_id: randomUUID(),
		iat: issuedAt,
		exp: issuedAt + 900
	});
	const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
	return `${header}.${payload}.${signature}`;
}

function createUserClient(
	status: LocalSupabaseStatus,
	userId: string,
	email: string
): SupabaseClient<Database> {
	return createClient<Database>(status.API_URL, status.ANON_KEY, {
		global: {
			headers: { Authorization: `Bearer ${createUserToken(status.JWT_SECRET, userId, email)}` }
		},
		auth: { autoRefreshToken: false, persistSession: false }
	});
}

async function signIn(page: Page, email: string, password: string): Promise<void> {
	await page.goto('/login');
	await page.waitForTimeout(750);
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Sign In' }).click();
	await page.waitForURL('**/dashboard', { timeout: 15_000 });
}

test('planifica una receta, copia la compra y mantiene el hábito en su audiencia', async ({
	page
}, testInfo) => {
	test.setTimeout(150_000);
	page.setDefaultTimeout(12_000);
	const status = getLocalSupabaseStatus();
	const admin = createClient<Database>(status.API_URL, status.SECRET_KEY, {
		auth: { autoRefreshToken: false, persistSession: false }
	});
	const suffix = randomUUID();
	const password = 'MealsHabitsE2E-2026!';
	const ownerEmail = `meals-owner-${suffix}@example.test`;
	const selectedEmail = `meals-selected-${suffix}@example.test`;
	const unselectedEmail = `meals-unselected-${suffix}@example.test`;
	const createdUserIds: string[] = [];
	let familyId: string | undefined;

	try {
		for (const [email, name] of [
			[ownerEmail, 'Owner Comidas'],
			[selectedEmail, 'Persona seleccionada'],
			[unselectedEmail, 'Persona no seleccionada']
		] as const) {
			const result = await admin.auth.admin.createUser({
				email,
				password,
				email_confirm: true,
				user_metadata: { name }
			});
			expect(result.error).toBeNull();
			expect(result.data.user?.id).toBeTruthy();
			createdUserIds.push(result.data.user!.id);
		}

		const ownerId = createdUserIds[0]!;
		const selectedId = createdUserIds[1]!;
		const unselectedId = createdUserIds[2]!;
		const owner = createUserClient(status, ownerId, ownerEmail);
		const selected = createUserClient(status, selectedId, selectedEmail);
		const unselected = createUserClient(status, unselectedId, unselectedEmail);
		const { data: createdFamilyId, error: familyError } = await owner.rpc('create_family', {
			p_name: `Cocina E2E ${suffix}`
		});
		expect(familyError).toBeNull();
		familyId = createdFamilyId ?? undefined;
		expect(familyId).toBeTruthy();

		for (const [client, email] of [
			[selected, selectedEmail],
			[unselected, unselectedEmail]
		] as const) {
			const { data: invitationId, error: invitationError } = await owner.rpc(
				'invite_family_member',
				{ p_family_id: familyId!, p_email: email }
			);
			expect(invitationError).toBeNull();
			expect(
				(await client.rpc('accept_family_invitation', { p_invitation_id: invitationId! })).error
			).toBeNull();
		}

		const listName = `Compra cocina ${suffix}`;
		const { data: listId, error: listError } = await owner.rpc('create_family_list', {
			p_family_id: familyId!,
			p_title: listName,
			p_description: 'Ingredientes del menú',
			p_visibility: 'family',
			p_member_ids: []
		});
		expect(listError).toBeNull();
		expect(listId).toBeTruthy();

		await signIn(page, ownerEmail, password);
		await page.goto(`/family/${familyId}/meals`);
		await expect(page.getByRole('heading', { name: 'Plan de comidas' })).toBeVisible();
		await page.waitForTimeout(750);
		await page.getByRole('button', { name: '+ Nueva receta' }).click();
		await expect(page.locator('#new-recipe')).toBeVisible();

		const recipeName = `Tortilla familiar ${suffix}`;
		const recipeSection = page.locator('#new-recipe');
		await recipeSection.locator('input[name="title"]').fill(recipeName);
		await recipeSection.getByLabel('Descripción').fill('Cena sencilla para compartir');
		await recipeSection.getByLabel('Preparación').fill('Mezclar y cocinar a fuego medio.');
		await recipeSection.getByLabel('Raciones').fill('3');
		await recipeSection
			.getByLabel('Ingredientes')
			.fill('4 | unidades | Huevos\n1 | kg | Patatas\nSal');
		await recipeSection.getByRole('button', { name: 'Guardar receta' }).click();
		await expect(page.getByText('Receta guardada.')).toBeVisible();

		const recipeCard = page.locator('article').filter({ hasText: recipeName }).last();
		await expect(recipeCard).toBeVisible();
		await expect(recipeCard.getByText('Huevos', { exact: false })).toBeVisible();
		await recipeCard.getByLabel('Lista de destino').selectOption(listId!);
		await recipeCard.getByRole('button', { name: 'Enviar a lista' }).click();
		await expect(page.getByText('3 ingredientes copiados a la lista.')).toBeVisible();
		expect(
			(await owner.from('family_list_items').select('title').eq('list_id', listId!)).data?.map(
				(item) => item.title
			)
		).toEqual(expect.arrayContaining(['Huevos', 'Patatas', 'Sal']));

		await page.getByRole('button', { name: '+ Planificar' }).click();
		const today = new Date().toISOString().slice(0, 10);
		const scheduleSection = page.locator('#schedule-meal');
		await scheduleSection.getByLabel('Receta').selectOption({ label: recipeName });
		await scheduleSection.getByLabel('Día').fill(today);
		await scheduleSection.getByLabel('Momento').selectOption('dinner');
		await scheduleSection.getByLabel('Nota opcional').fill('Dejar las patatas preparadas');
		await scheduleSection.getByRole('button', { name: 'Guardar en el plan' }).click();
		await expect(page.getByText('Comida añadida al plan.')).toBeVisible();
		await expect(page.locator('p').filter({ hasText: /^Cena$/ })).toBeVisible();
		await expect(page.getByText('Dejar las patatas preparadas')).toBeVisible();

		await page.goto(`/family/${familyId}/habits`);
		await expect(page.getByRole('heading', { name: 'Hábitos', exact: true })).toBeVisible();
		await page.waitForTimeout(750);
		await page.getByRole('button', { name: '+ Nuevo hábito' }).click();
		await expect(page.locator('#new-habit')).toBeVisible();
		const habitName = `Leer en familia ${suffix}`;
		const habitSection = page.locator('#new-habit');
		await habitSection.locator('input[name="title"]').fill(habitName);
		await habitSection.getByLabel('Descripción opcional').fill('Veinte minutos sin pantallas');
		await habitSection.getByLabel('Empieza el').fill(today);
		await habitSection.getByLabel('Privacidad').selectOption('selected_members');
		await habitSection.locator(`input[name="member_ids"][value="${selectedId}"]`).check();
		await habitSection.getByRole('button', { name: 'Crear hábito' }).click();
		await expect(page.getByText('Hábito creado.')).toBeVisible();

		const habitCard = page.locator('article').filter({ hasText: habitName });
		await expect(habitCard.getByText('Compartido', { exact: false })).toBeVisible();
		await habitCard.getByRole('button', { name: `Marcar ${habitName} el ${today}` }).click();
		await expect(page.getByText('Día registrado.')).toBeVisible();

		const { data: habit, error: habitError } = await owner
			.from('family_habits')
			.select('id, visibility')
			.eq('family_id', familyId!)
			.eq('title', habitName)
			.single();
		expect(habitError).toBeNull();
		expect(habit?.visibility).toBe('selected_members');
		expect(
			(await selected.from('family_habits').select('id').eq('id', habit!.id)).data
		).toHaveLength(1);
		expect((await unselected.from('family_habits').select('id').eq('id', habit!.id)).data).toEqual(
			[]
		);
		expect(
			(await selected.from('habit_completions').select('completed_on').eq('habit_id', habit!.id))
				.data
		).toHaveLength(1);

		await page.context().clearCookies();
		await signIn(page, selectedEmail, password);
		await page.goto(`/family/${familyId}/habits`);
		const sharedCard = page.locator('article').filter({ hasText: habitName });
		await expect(sharedCard).toBeVisible();
		await expect(
			sharedCard.getByRole('button', { name: `Desmarcar ${habitName} el ${today}` })
		).toHaveCount(0);
		await expect(sharedCard.getByLabel(`Completado el ${today}`)).toBeVisible();

		if (testInfo.project.name === 'mobile-chromium') {
			const bodyWidth = await page.locator('body').evaluate((element) => element.scrollWidth);
			expect(bodyWidth).toBeLessThanOrEqual(testInfo.project.use.viewport!.width + 1);
			const dayCell = await sharedCard.getByLabel(`Completado el ${today}`).boundingBox();
			expect(dayCell?.height).toBeGreaterThanOrEqual(44);
		}
	} finally {
		if (familyId) await admin.from('families').delete().eq('id', familyId);
		for (const userId of createdUserIds) await admin.auth.admin.deleteUser(userId);
	}
});
