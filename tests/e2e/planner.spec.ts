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
	const executable = process.platform === 'win32' ? 'powershell.exe' : 'npx';
	const args =
		process.platform === 'win32'
			? ['-NoProfile', '-Command', 'npx supabase status -o json']
			: ['supabase', 'status', '-o', 'json'];
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

function addDays(date: Date, days: number): Date {
	const result = new Date(date);
	result.setUTCDate(result.getUTCDate() + days);
	return result;
}

test('agrega la familia activa sin revelar colecciones privadas ni datos de otra familia', async ({
	page
}, testInfo) => {
	test.setTimeout(120_000);
	page.setDefaultTimeout(12_000);
	const status = getLocalSupabaseStatus();
	const admin = createClient<Database>(status.API_URL, status.SECRET_KEY, {
		auth: { autoRefreshToken: false, persistSession: false }
	});
	const suffix = randomUUID();
	const password = 'PlannerE2E-2026!';
	const ownerEmail = `planner-owner-${suffix}@example.test`;
	const memberEmail = `planner-member-${suffix}@example.test`;
	const createdUserIds: string[] = [];
	const familyIds: string[] = [];

	try {
		for (const [email, name] of [
			[ownerEmail, 'Owner Planner'],
			[memberEmail, 'Miembro Planner']
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
		const memberId = createdUserIds[1]!;
		const owner = createUserClient(status, ownerId, ownerEmail);
		const member = createUserClient(status, memberId, memberEmail);
		for (const familyName of [`Casa principal ${suffix}`, `Casa secundaria ${suffix}`]) {
			const { data: familyId, error: familyError } = await owner.rpc('create_family', {
				p_name: familyName
			});
			expect(familyError).toBeNull();
			expect(familyId).toBeTruthy();
			familyIds.push(familyId!);
			const { data: invitationId, error: invitationError } = await owner.rpc(
				'invite_family_member',
				{ p_family_id: familyId!, p_email: memberEmail }
			);
			expect(invitationError).toBeNull();
			expect(
				(await member.rpc('accept_family_invitation', { p_invitation_id: invitationId! })).error
			).toBeNull();
		}

		const primaryFamilyId = familyIds[0]!;
		const secondaryFamilyId = familyIds[1]!;
		expect(
			(
				await member
					.from('profiles')
					.update({ active_family_id: primaryFamilyId })
					.eq('id', memberId)
			).error
		).toBeNull();
		expect(
			(
				await owner.from('family_modules').insert(
					['expenses', 'events', 'tasks', 'lists', 'planner'].map((moduleName) => ({
						family_id: primaryFamilyId,
						module_name: moduleName,
						enabled: true,
						enabled_at: new Date().toISOString(),
						enabled_by: ownerId
					}))
				)
			).error
		).toBeNull();

		const now = new Date();
		const eventStart = addDays(now, 1);
		const eventEnd = new Date(eventStart.getTime() + 60 * 60 * 1000);
		const taskDueOn = addDays(now, 2).toISOString().slice(0, 10);
		const currentDate = now.toISOString().slice(0, 10);
		const eventName = `Cita compartida ${suffix}`;
		const taskName = `Preparar excursión ${suffix}`;
		const listName = `Compra de la semana ${suffix}`;
		const foreignTaskName = `Secreto de otra familia ${suffix}`;

		const { error: planningSeedError } = await admin.from('calendar_events').insert({
			family_id: primaryFamilyId,
			created_by: ownerId,
			title: eventName,
			description: 'Visible para la familia',
			starts_at: eventStart.toISOString(),
			ends_at: eventEnd.toISOString(),
			timezone: 'Europe/Madrid',
			all_day: false,
			visibility: 'family'
		});
		expect(planningSeedError).toBeNull();
		expect(
			(
				await admin.from('family_tasks').insert([
					{
						family_id: primaryFamilyId,
						created_by: ownerId,
						title: taskName,
						due_on: taskDueOn,
						priority: 'high'
					},
					{
						family_id: secondaryFamilyId,
						created_by: ownerId,
						title: foreignTaskName,
						due_on: taskDueOn,
						priority: 'urgent'
					}
				])
			).error
		).toBeNull();
		const { data: list, error: listError } = await admin
			.from('family_lists')
			.insert({
				family_id: primaryFamilyId,
				created_by: ownerId,
				title: listName,
				visibility: 'family'
			})
			.select('id')
			.single();
		expect(listError).toBeNull();
		expect(
			(
				await admin.from('family_list_items').insert({
					list_id: list!.id,
					created_by: ownerId,
					title: 'Pan',
					quantity: 1,
					sort_order: 1000
				})
			).error
		).toBeNull();

		const { data: accessibleCollectionId, error: accessibleCollectionError } = await owner.rpc(
			'create_expense_collection',
			{ p_family_id: primaryFamilyId, p_name: `Compartida ${suffix}`, p_currency: 'EUR' }
		);
		expect(accessibleCollectionError).toBeNull();
		const { data: privateCollectionId, error: privateCollectionError } = await owner.rpc(
			'create_expense_collection',
			{ p_family_id: primaryFamilyId, p_name: `Privada ${suffix}`, p_currency: 'EUR' }
		);
		expect(privateCollectionError).toBeNull();
		expect(
			(
				await owner.rpc('invite_expense_collection_member', {
					p_collection_id: accessibleCollectionId!,
					p_user_id: memberId,
					p_role: 'viewer'
				})
			).error
		).toBeNull();
		expect(
			(
				await member.rpc('accept_expense_collection_invitation', {
					p_collection_id: accessibleCollectionId!
				})
			).error
		).toBeNull();
		expect(
			(
				await owner.from('expenses').insert([
					{
						collection_id: accessibleCollectionId!,
						created_by: ownerId,
						paid_by: ownerId,
						description: `Visible ${suffix}`,
						amount: 42.5,
						occurred_on: currentDate
					},
					{
						collection_id: privateCollectionId!,
						created_by: ownerId,
						paid_by: ownerId,
						description: `Oculto ${suffix}`,
						amount: 999,
						occurred_on: currentDate
					}
				])
			).error
		).toBeNull();

		await signIn(page, memberEmail, password);
		await expect(page.getByRole('heading', { name: 'Hola de nuevo' })).toBeVisible();
		await expect(page.getByRole('heading', { name: `Casa principal ${suffix}` })).toBeVisible();
		await expect(page.getByText(eventName, { exact: true })).toBeVisible();
		await expect(page.getByText(taskName, { exact: true })).toBeVisible();
		await expect(page.getByText(listName, { exact: true })).toBeVisible();
		await expect(page.getByText('42,50', { exact: false })).toBeVisible();
		await expect(page.getByText('999', { exact: false })).toHaveCount(0);
		await expect(page.getByText(foreignTaskName, { exact: true })).toHaveCount(0);
		for (const label of [
			'Nuevo regalo',
			'Añadir gasto',
			'Nueva tarea',
			'Nuevo evento',
			'Nueva lista'
		]) {
			await expect(page.getByRole('link', { name: label })).toBeVisible();
		}

		await page.goto(`/family/${primaryFamilyId}/planner`);
		await expect(
			page.getByRole('heading', { name: `Planner de Casa principal ${suffix}` })
		).toBeVisible();
		await expect(page.getByText(eventName, { exact: true })).toBeVisible();
		await expect(page.getByText(taskName, { exact: true })).toBeVisible();
		await expect(page.getByText('42,50', { exact: false })).toBeVisible();

		if (testInfo.project.name === 'mobile-chromium') {
			const bodyWidth = await page.locator('body').evaluate((element) => element.scrollWidth);
			expect(bodyWidth).toBeLessThanOrEqual(testInfo.project.use.viewport!.width + 1);
			await expect(page.getByRole('navigation', { name: 'Acciones rápidas' })).toBeVisible();
		}
	} finally {
		for (const familyId of familyIds) await admin.from('families').delete().eq('id', familyId);
		for (const userId of createdUserIds) await admin.auth.admin.deleteUser(userId);
	}
});
