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

test('centraliza preferencias, permisos y bloqueo de URLs de módulos', async ({
	page
}, testInfo) => {
	test.setTimeout(120_000);
	page.setDefaultTimeout(12_000);
	await page.addInitScript(() => {
		const addEventListener = window.addEventListener.bind(window);
		window.addEventListener = (
			type: string,
			listener: EventListenerOrEventListenerObject,
			options?: boolean | AddEventListenerOptions
		) => {
			if (type !== 'visibilitychange' || typeof listener !== 'function') {
				return addEventListener(type, listener, options);
			}
			addEventListener(
				type,
				async (event) => {
					await listener.call(window, event);
					window.dispatchEvent(new Event('e2e:visibility-settled'));
				},
				options
			);
		};
	});
	const status = getLocalSupabaseStatus();
	const admin = createClient<Database>(status.API_URL, status.SECRET_KEY, {
		auth: { autoRefreshToken: false, persistSession: false }
	});
	const suffix = randomUUID();
	const password = 'ModulesE2E-2026!';
	const ownerEmail = `modules-owner-${suffix}@example.test`;
	const memberEmail = `modules-member-${suffix}@example.test`;
	const createdUserIds: string[] = [];
	let familyId: string | undefined;

	try {
		for (const [email, name] of [
			[ownerEmail, 'Owner módulos'],
			[memberEmail, 'Miembro módulos']
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

		const owner = createUserClient(status, createdUserIds[0]!, ownerEmail);
		const member = createUserClient(status, createdUserIds[1]!, memberEmail);
		const { data: createdFamilyId, error: familyError } = await owner.rpc('create_family', {
			p_name: `Módulos E2E ${suffix}`
		});
		expect(familyError).toBeNull();
		familyId = createdFamilyId ?? undefined;
		expect(familyId).toBeTruthy();

		const { data: invitationId, error: invitationError } = await owner.rpc('invite_family_member', {
			p_family_id: familyId!,
			p_email: memberEmail
		});
		expect(invitationError).toBeNull();
		expect(
			(await member.rpc('accept_family_invitation', { p_invitation_id: invitationId! })).error
		).toBeNull();

		expect(
			(
				await admin.from('family_modules').insert({
					family_id: familyId!,
					module_name: 'games',
					enabled: true,
					enabled_by: createdUserIds[0]!,
					enabled_at: new Date().toISOString()
				})
			).error
		).toBeNull();

		await signIn(page, ownerEmail, password);
		await page.goto(`/family/${familyId}/settings/modules`);
		await expect(
			page.getByRole('heading', { name: 'Elige qué necesita tu familia' })
		).toBeVisible();
		await expect(page.getByText('Siempre activo')).toHaveCount(2);
		await expect(page.getByRole('heading', { name: 'Juegos', exact: true })).toBeVisible();
		await expect(page.getByRole('tab', { name: 'Calendario' })).toBeVisible();

		await page.getByRole('button', { name: 'Desactivar Calendario' }).click();
		await expect(page.getByRole('status')).toContainText('Calendario está desactivado.');
		await expect(page.getByRole('tab', { name: 'Calendario' })).toHaveCount(0);
		const disabledResponse = await page.goto(`/family/${familyId}/calendar`);
		expect(disabledResponse?.status()).toBe(404);

		const theme = await page.locator('html').getAttribute('data-theme');
		expect(theme).not.toBeNull();
		await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
		await expect(page.locator('html')).toHaveAttribute(
			'data-theme',
			theme === 'myfam-dark' ? 'myfam-light' : 'myfam-dark'
		);
		let calendarRevalidations = 0;
		const countCalendarRevalidation = (request: import('@playwright/test').Request) => {
			if (new URL(request.url()).pathname === `/family/${familyId}/calendar/__data.json`) {
				calendarRevalidations++;
			}
		};
		page.on('request', countCalendarRevalidation);
		await page.evaluate(async () => {
			await new Promise<void>((resolve) => {
				window.addEventListener('e2e:visibility-settled', () => resolve(), { once: true });
				window.dispatchEvent(new Event('visibilitychange'));
			});
			await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
		});
		expect(calendarRevalidations).toBe(0);
		page.off('request', countCalendarRevalidation);

		await page.goto(`/family/${familyId}/settings/modules`);
		await page.getByRole('button', { name: 'Activar Calendario' }).click();
		await expect(page.getByRole('status')).toContainText('Calendario está activo.');
		await page.goto(`/family/${familyId}/calendar`);
		await expect(page.getByRole('heading', { name: 'Calendario familiar' })).toBeVisible();

		const gamesResponse = await page.goto(`/family/${familyId}/games`);
		expect(gamesResponse?.status()).toBe(200);
		await expect(page.getByRole('heading', { name: 'Juegos en familia' })).toBeVisible();
		expect(
			(
				await owner.rpc('set_family_module_preference', {
					p_family_id: familyId!,
					p_module_name: 'games',
					p_enabled: false
				})
			).error
		).toBeNull();
		expect((await page.goto(`/family/${familyId}/games`))?.status()).toBe(404);

		await page.context().clearCookies();
		await signIn(page, memberEmail, password);
		await page.goto(`/family/${familyId}/settings/modules`);
		await expect(page.getByRole('note')).toContainText(
			'miembros con permiso para configurar módulos'
		);
		await expect(page.getByRole('button', { name: 'Desactivar Calendario' })).toBeDisabled();
		expect(
			(
				await member.rpc('set_family_module_preference', {
					p_family_id: familyId!,
					p_module_name: 'calendar',
					p_enabled: false
				})
			).error?.code
		).toBe('42501');

		await page.context().clearCookies();
		await signIn(page, ownerEmail, password);
		await page.goto(`/family/${familyId}/members`);
		await page.getByRole('button', { name: 'Invite Member', exact: true }).click();
		await expect(page.getByRole('heading', { name: 'Invite Family Member' })).toBeVisible();
		await page.getByRole('button', { name: 'Cancel', exact: true }).click();
		const capabilityForm = page.locator('form[action="?/setCapabilities"]').filter({
			has: page.locator(`input[name="userId"][value="${createdUserIds[1]}"]`)
		});
		await capabilityForm.getByLabel('Configurar módulos').check();
		await capabilityForm.getByRole('button', { name: 'Guardar permisos' }).click();
		await expect(page.getByText('Permisos guardados.')).toBeVisible();
		expect(
			(
				await owner
					.from('family_members')
					.select('can_configure_modules')
					.eq('family_id', familyId!)
					.eq('user_id', createdUserIds[1]!)
					.single()
			).data?.can_configure_modules
		).toBe(true);
		await page.context().clearCookies();
		await signIn(page, memberEmail, password);
		await page.goto(`/family/${familyId}/settings/modules`);
		await page.getByRole('button', { name: 'Desactivar Calendario' }).click();
		await expect(page.getByRole('status')).toContainText('Calendario está desactivado.');
		await page.getByRole('button', { name: 'Activar Calendario' }).click();
		await expect(page.getByRole('status')).toContainText('Calendario está activo.');
		await page.goto(`/family/${familyId}/members`);
		await expect(page.getByRole('button', { name: 'Invite Member' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Guardar permisos' })).toHaveCount(0);
		expect(
			(
				await owner.rpc('set_family_member_capabilities', {
					p_family_id: familyId!,
					p_target_user_id: createdUserIds[1]!,
					p_can_manage_members: false,
					p_can_configure_modules: false
				})
			).error
		).toBeNull();
		await page.goto(`/family/${familyId}/settings/modules`);
		await expect(page.getByRole('button', { name: 'Desactivar Calendario' })).toBeDisabled();

		if (testInfo.project.name === 'mobile-chromium') {
			const bodyWidth = await page.locator('body').evaluate((element) => element.scrollWidth);
			expect(bodyWidth).toBeLessThanOrEqual(testInfo.project.use.viewport!.width + 1);
		}
	} finally {
		if (familyId) await admin.from('families').delete().eq('id', familyId);
		for (const userId of createdUserIds) await admin.auth.admin.deleteUser(userId);
	}
});
