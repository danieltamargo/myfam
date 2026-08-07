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

test('crea, busca, edita y archiva una nota seleccionada sin ejecutar HTML', async ({
	page
}, testInfo) => {
	test.setTimeout(120_000);
	page.setDefaultTimeout(10_000);
	const status = getLocalSupabaseStatus();
	const admin = createClient<Database>(status.API_URL, status.SECRET_KEY, {
		auth: { autoRefreshToken: false, persistSession: false }
	});
	const suffix = randomUUID();
	const password = 'NotesE2E-2026!';
	const ownerEmail = `notes-owner-${suffix}@example.test`;
	const selectedEmail = `notes-selected-${suffix}@example.test`;
	const memberEmail = `notes-member-${suffix}@example.test`;
	const createdUserIds: string[] = [];
	let familyId: string | undefined;

	try {
		for (const [email, name] of [
			[ownerEmail, 'Owner Notas'],
			[selectedEmail, 'Invitada Notas'],
			[memberEmail, 'Miembro Notas']
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
		const memberId = createdUserIds[2]!;
		const owner = createUserClient(status, ownerId, ownerEmail);
		const selected = createUserClient(status, selectedId, selectedEmail);
		const member = createUserClient(status, memberId, memberEmail);
		const { data: createdFamilyId, error: familyError } = await owner.rpc('create_family', {
			p_name: `Notas E2E ${suffix}`
		});
		expect(familyError).toBeNull();
		familyId = createdFamilyId ?? undefined;
		expect(familyId).toBeTruthy();

		for (const [client, email] of [
			[selected, selectedEmail],
			[member, memberEmail]
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

		await signIn(page, ownerEmail, password);
		await page.goto(`/family/${familyId}/notes`);
		await expect(page.getByRole('heading', { name: 'Notas seguras' })).toBeVisible();
		await page.waitForTimeout(750);
		await page.getByRole('button', { name: '+ Nueva nota' }).click();

		const noteTitle = `Plan de vacaciones ${suffix}`;
		const unsafeContent =
			'Alojamiento y billetes\n<img src=x onerror="window.__notesXss=true">\n**Markdown literal**';
		await page.getByLabel('Título').fill(noteTitle);
		await page.getByLabel('Texto / Markdown').fill(unsafeContent);
		await page.getByLabel('Visibilidad').selectOption('selected_members');
		await page.locator(`input[name="member_ids"][value="${selectedId}"]`).check();
		await page.getByRole('button', { name: 'Crear nota' }).click();

		await expect(page.getByText('Nota creada.')).toBeVisible();
		await expect(page.getByRole('article').getByRole('heading', { name: noteTitle })).toBeVisible();
		await expect(
			page.getByRole('article').getByText('<img src=x onerror=', { exact: false })
		).toBeVisible();
		expect(await page.locator('article img').count()).toBe(0);
		expect(
			await page.evaluate(() => Boolean((window as Window & { __notesXss?: boolean }).__notesXss))
		).toBe(false);

		const { data: storedNote, error: noteError } = await owner
			.from('family_notes')
			.select('id, visibility, version, content')
			.eq('family_id', familyId!)
			.eq('title', noteTitle)
			.single();
		expect(noteError).toBeNull();
		expect(storedNote).toMatchObject({
			visibility: 'selected_members',
			version: 1,
			content: unsafeContent
		});
		expect(
			(await selected.from('family_notes').select('id').eq('id', storedNote!.id)).data
		).toHaveLength(1);
		expect((await member.from('family_notes').select('id').eq('id', storedNote!.id)).data).toEqual(
			[]
		);

		await page.getByLabel('Buscar notas').fill('alojamiento');
		await page.getByRole('button', { name: 'Buscar' }).click();
		await expect(page).toHaveURL(/search=alojamiento/);
		await expect(page.getByRole('article').getByRole('heading', { name: noteTitle })).toBeVisible();

		await page.getByRole('button', { name: 'Editar' }).click();
		await page.getByLabel('Título').fill(`${noteTitle} actualizado`);
		await page.getByRole('button', { name: 'Guardar cambios' }).click();
		await expect(page.getByText('Nota actualizada.')).toBeVisible();
		await expect(
			page.getByRole('article').getByRole('heading', { name: `${noteTitle} actualizado` })
		).toBeVisible();

		await page.getByRole('button', { name: 'Archivar' }).click();
		await expect(page.getByText('Nota archivada.')).toBeVisible();
		await page.getByRole('link', { name: 'Archivadas' }).click();
		await expect(
			page.getByRole('article').getByRole('heading', { name: `${noteTitle} actualizado` })
		).toBeVisible();
		await expect(page.getByText('Archivada', { exact: true })).toBeVisible();

		if (testInfo.project.name === 'mobile-chromium') {
			const bodyWidth = await page.locator('body').evaluate((element) => element.scrollWidth);
			expect(bodyWidth).toBeLessThanOrEqual(testInfo.project.use.viewport!.width + 1);
		}
	} finally {
		if (familyId) await admin.from('families').delete().eq('id', familyId);
		for (const userId of createdUserIds) await admin.auth.admin.deleteUser(userId);
	}
});
