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

test('crea un evento recurrente privado, lo filtra y protege sus recordatorios', async ({
	page
}, testInfo) => {
	test.setTimeout(120_000);
	const status = getLocalSupabaseStatus();
	const admin = createClient<Database>(status.API_URL, status.SECRET_KEY, {
		auth: { autoRefreshToken: false, persistSession: false }
	});
	const suffix = randomUUID();
	const password = 'CalendarE2E-2026!';
	const ownerEmail = `calendar-owner-${suffix}@example.test`;
	const selectedEmail = `calendar-selected-${suffix}@example.test`;
	const memberEmail = `calendar-member-${suffix}@example.test`;
	const createdUserIds: string[] = [];
	let familyId: string | undefined;

	try {
		for (const [email, name] of [
			[ownerEmail, 'Owner Calendario'],
			[selectedEmail, 'Invitada Calendario'],
			[memberEmail, 'Miembro sin acceso']
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
			p_name: `Calendario E2E ${suffix}`
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

		const { data: category, error: categoryError } = await owner
			.from('gift_event_categories')
			.select('id')
			.eq('family_id', familyId!)
			.eq('name', 'Cumpleaños')
			.single();
		expect(categoryError).toBeNull();

		await signIn(page, ownerEmail, password);
		await page.goto(`/family/${familyId}/calendar?view=month&date=2026-08-10`);
		await expect(page.getByRole('heading', { name: 'Calendario familiar' })).toBeVisible();

		const eventName = `Cumpleaños recurrente ${suffix}`;
		const createForm = page.locator('#nuevo-evento');
		await createForm.getByLabel('Título').fill(eventName);
		await createForm.getByLabel('Inicio').fill('2026-08-10T14:00');
		await createForm.getByLabel('Final').fill('2026-08-10T15:30');
		await createForm.getByLabel('Visibilidad').selectOption('selected_members');
		await createForm.getByLabel('Repetición').selectOption('daily');
		await createForm.getByLabel('Cada').fill('1');
		await createForm.getByLabel('Repetir hasta').fill('2026-08-12T14:00');
		await createForm.getByLabel('Máximo de veces').fill('3');
		await createForm.getByLabel('Recordatorio').selectOption('30');
		await createForm.getByLabel('Categoría Wishlist').selectOption(category!.id);
		await createForm.getByLabel('Invitada Calendario').check({ force: true });
		await createForm.getByRole('button', { name: 'Crear evento' }).press('Enter');

		await expect(page.getByText('Evento creado.')).toBeVisible();
		await expect(page.getByText(eventName).first()).toBeVisible();
		const { data: storedEvent, error: storedEventError } = await owner
			.from('calendar_events')
			.select('id, visibility, timezone, recurrence_frequency, wishlist_category_id')
			.eq('family_id', familyId!)
			.eq('title', eventName)
			.single();
		expect(storedEventError).toBeNull();
		expect(storedEvent).toMatchObject({
			visibility: 'selected_members',
			timezone: 'Europe/Madrid',
			recurrence_frequency: 'daily',
			wishlist_category_id: category!.id
		});

		const { data: occurrences, error: occurrencesError } = await selected.rpc(
			'get_calendar_occurrences',
			{
				p_family_id: familyId!,
				p_from: '2026-08-10T00:00:00Z',
				p_to: '2026-08-13T00:00:00Z'
			}
		);
		expect(occurrencesError).toBeNull();
		expect(
			occurrences?.filter((occurrence) => occurrence.event_id === storedEvent!.id)
		).toHaveLength(3);
		expect(
			(await member.from('calendar_events').select('id').eq('id', storedEvent!.id)).data
		).toEqual([]);

		await page.goto(
			`/family/${familyId}/calendar?view=agenda&date=2026-08-10&participant=${selectedId}&event=${storedEvent!.id}`
		);
		const eventDetail = page.locator('#detalle-evento');
		await expect(eventDetail.locator('#event-detail-title')).toHaveText(eventName);
		await expect(
			eventDetail.getByText('Solo participantes', { exact: true }).first()
		).toBeVisible();
		await expect(eventDetail.getByText('Repetición diaria', { exact: true })).toBeVisible();
		await expect(eventDetail.getByText('🔔 30 min antes', { exact: true })).toBeVisible();

		const { data: processed, error: reminderError } = await admin.rpc(
			'process_calendar_reminders',
			{ p_now: '2026-08-10T11:31:00Z', p_limit: 20 }
		);
		expect(reminderError).toBeNull();
		expect(processed).toBeGreaterThanOrEqual(1);
		const { data: notification, error: notificationError } = await selected
			.from('notifications')
			.select('link, type')
			.eq('reference_id', storedEvent!.id)
			.eq('type', 'calendar_reminder')
			.single();
		expect(notificationError).toBeNull();
		expect(notification?.link).toBe(`/family/${familyId}/calendar?event=${storedEvent!.id}`);

		if (testInfo.project.name === 'mobile-chromium') {
			await expect(page.locator('#nuevo-evento')).toBeVisible();
			const bodyWidth = await page.locator('body').evaluate((element) => element.scrollWidth);
			expect(bodyWidth).toBeLessThanOrEqual(testInfo.project.use.viewport!.width + 1);
		}
	} finally {
		if (familyId) await admin.from('families').delete().eq('id', familyId);
		for (const userId of createdUserIds) await admin.auth.admin.deleteUser(userId);
	}
});
