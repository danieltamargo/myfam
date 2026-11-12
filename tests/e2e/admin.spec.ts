import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createClient, type Session } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { expect, test } from '@playwright/test';
import type { Database } from '../../src/lib/types/database';

function totp(secret: string): string {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
	const bits = [...secret.replaceAll('=', '')]
		.map((character) => alphabet.indexOf(character).toString(2).padStart(5, '0'))
		.join('');
	const bytes = Buffer.from(bits.match(/.{8}/g)!.map((value) => Number.parseInt(value, 2)));
	const counter = Buffer.alloc(8);
	counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
	const digest = createHmac('sha1', bytes).update(counter).digest();
	return String(
		(digest.readUInt32BE(digest[digest.length - 1] & 15) & 0x7fffffff) % 1_000_000
	).padStart(6, '0');
}

test('administra cuentas con AAL2 y deniega el acceso normal sin exponer datos privados', async ({
	page,
	context
}) => {
	test.setTimeout(180_000);
	const status = JSON.parse(
		execFileSync('supabase', ['status', '-o', 'json'], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		})
	) as { API_URL: string; ANON_KEY: string; SECRET_KEY?: string; SERVICE_ROLE_KEY: string };
	if (!['127.0.0.1', 'localhost'].includes(new URL(status.API_URL).hostname))
		throw new Error('Admin E2E requires local Supabase');
	const origin = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4319';
	if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname))
		throw new Error('Admin E2E requires a local application');
	const options = { auth: { persistSession: false, autoRefreshToken: false } };
	const service = createClient<Database>(
		status.API_URL,
		status.SECRET_KEY ?? status.SERVICE_ROLE_KEY,
		options
	);
	const account = createClient<Database>(status.API_URL, status.ANON_KEY, options);
	const normal = createClient<Database>(status.API_URL, status.ANON_KEY, options);
	const adminEmail = `admin-e2e-${randomUUID()}@example.test`;
	const normalEmail = `normal-e2e-${randomUUID()}@example.test`;
	const invitedEmail = `invited-e2e-${randomUUID()}@example.test`;
	const password = `Admin-e2e-${randomUUID()}aA1!`;
	const userIds: string[] = [];
	let familyId: string | undefined;
	let server: ChildProcess | undefined;
	async function seedBrowser(session: Session) {
		const cookies: { name: string; value: string; domain: string; path: string }[] = [];
		const ssr = createServerClient<Database>(status.API_URL, status.ANON_KEY, {
			cookies: {
				getAll: () => [],
				setAll: (values) => {
					for (const value of values)
						cookies.push({
							name: value.name,
							value: value.value,
							domain: new URL(origin).hostname,
							path: '/'
						});
				}
			}
		});
		expect((await ssr.auth.setSession(session)).error).toBeNull();
		await context.clearCookies();
		await context.addCookies(cookies);
	}
	try {
		for (const email of [adminEmail, normalEmail]) {
			const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
			expect(created.error).toBeNull();
			userIds.push(created.data.user!.id);
		}
		expect(
			(await account.auth.signInWithPassword({ email: adminEmail, password })).error
		).toBeNull();
		const normalLogin = await normal.auth.signInWithPassword({ email: normalEmail, password });
		expect(normalLogin.error).toBeNull();
		const family = await normal.rpc('create_family', { p_name: 'Prueba local de administración' });
		expect(family.error).toBeNull();
		familyId = family.data ?? undefined;
		const factor = await account.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Admin E2E' });
		expect(factor.error).toBeNull();
		const enrollmentCode = totp(factor.data!.totp.secret);
		expect(
			(
				await account.auth.mfa.challengeAndVerify({
					factorId: factor.data!.id,
					code: enrollmentCode
				})
			).error
		).toBeNull();
		server = spawn(
			process.execPath,
			[
				'node_modules/vite/bin/vite.js',
				'--host',
				new URL(origin).hostname,
				'--port',
				new URL(origin).port,
				'--strictPort'
			],
			{
				cwd: process.cwd(),
				windowsHide: true,
				stdio: 'ignore',
				env: {
					...process.env,
					SUPER_ADMIN_USER_IDS: userIds[0],
					ORIGIN: origin,
					VITE_SUPABASE_URL: status.API_URL,
					VITE_SUPABASE_ANON_KEY: status.ANON_KEY,
					SUPABASE_PROJECT_URL: status.API_URL,
					SUPABASE_SECRET_KEY: status.SECRET_KEY ?? status.SERVICE_ROLE_KEY
				}
			}
		);
		await expect
			.poll(
				async () => {
					if (server!.exitCode !== null) throw new Error('Dedicated admin test server exited');
					try {
						return (await fetch(`${origin}/login`)).status;
					} catch {
						return 0;
					}
				},
				{ timeout: 60_000, intervals: [500] }
			)
			.toBe(200);
		await page.goto(`${origin}/login`);
		await page.getByLabel('Correo electrónico', { exact: true }).fill(adminEmail);
		await page.getByLabel('Contraseña', { exact: true }).fill(password);
		await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
		await expect(page).toHaveURL(/\/verify-2fa/);
		await expect
			.poll(() => totp(factor.data!.totp.secret) !== enrollmentCode, {
				timeout: 35_000,
				intervals: [500]
			})
			.toBe(true);
		await page.locator('#verification-code').fill(totp(factor.data!.totp.secret));
		await page.waitForURL('**/dashboard');
		const menuButton = page.getByRole('button', { name: 'Abrir menú de usuario' });
		for (let index = 0; index < 40; index++) {
			if (await menuButton.evaluate((element) => element === document.activeElement)) break;
			await page.keyboard.press('Tab');
		}
		await expect(menuButton).toBeFocused();
		await page.keyboard.press('Enter');
		const adminLink = page.getByRole('link', { name: 'Administración', exact: true });
		await expect(adminLink).toBeVisible();
		for (let index = 0; index < 20; index++) {
			if (await adminLink.evaluate((element) => element === document.activeElement)) break;
			await page.keyboard.press('Tab');
		}
		await expect(adminLink).toBeFocused();
		await page.keyboard.press('Enter');
		await expect(page).toHaveURL(/\/admin$/);
		await expect(page.getByRole('heading', { name: 'Administración', exact: true })).toBeVisible();
		await page.getByLabel('Nombre', { exact: true }).fill('Lucía de prueba');
		await page.getByLabel('Correo electrónico', { exact: true }).fill(invitedEmail);
		await page.getByRole('button', { name: 'Crear y enviar bienvenida' }).click();
		await expect(page.locator('.alert-success')).toContainText('Usuario invitado');
		const invited = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
		expect(invited.error).toBeNull();
		const invitedUser = invited.data.users.find((user) => user.email === invitedEmail);
		expect(invitedUser).toBeTruthy();
		userIds.push(invitedUser!.id);
		const invitedProfile = await service
			.from('profiles')
			.select('display_name')
			.eq('id', invitedUser!.id)
			.single();
		expect(invitedProfile.data?.display_name).toBe('Lucía de prueba');
		expect(
			(await service.from('family_members').select('id').eq('user_id', invitedUser!.id)).data
		).toEqual([]);
		const normalRow = page
			.getByRole('listitem')
			.filter({ has: page.getByText(normalEmail, { exact: true }) });
		await expect(normalRow).toBeVisible();
		await normalRow.getByLabel('Confirmo deshabilitar').check();
		await normalRow.getByRole('button', { name: 'Deshabilitar', exact: true }).click();
		await expect(page.locator('.alert-success')).toContainText('Usuario deshabilitado');
		await expect(normalRow.getByRole('button', { name: 'Habilitar', exact: true })).toBeVisible();
		expect((await normal.rpc('get_my_profile')).error?.code).toBe('42501');
		expect((await normal.from('families').select('id').eq('id', familyId!)).data).toEqual([]);
		await normalRow.getByRole('button', { name: 'Habilitar', exact: true }).click();
		await expect(page.locator('.alert-success')).toContainText('Usuario habilitado');
		expect((await normal.rpc('get_my_profile')).error).toBeNull();
		await normalRow.getByRole('button', { name: 'Reenviar bienvenida', exact: true }).click();
		await expect(page.locator('.alert-success')).toContainText('Se ha solicitado el envío');
		const business = page.getByRole('region', { name: 'Acciones de la aplicación' });
		for (const action of [
			'user_invited_succeeded',
			'user_disabled_succeeded',
			'user_enabled_succeeded',
			'user_welcome_sent_succeeded'
		])
			await expect(business.getByText(action, { exact: true }).first()).toBeVisible();
		await expect(
			page.getByRole('region', { name: 'Autenticación' }).getByRole('listitem').first()
		).toBeVisible();
		const ownRow = page
			.getByRole('listitem')
			.filter({ has: page.getByText(adminEmail, { exact: true }) });
		await expect(ownRow.getByRole('button', { name: 'Deshabilitar', exact: true })).toHaveCount(0);
		await page.screenshot({ path: test.info().outputPath('admin-panel.png'), fullPage: true });
		if (test.info().project.name === 'mobile-chromium')
			expect(
				await page.locator('body').evaluate((element) => element.scrollWidth)
			).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
		await page.goto(`${origin}/admin?page=9999&businessPage=9999&authPage=9999`);
		for (const empty of [
			'No hay usuarios en esta página.',
			'No hay acciones registradas en esta página.',
			'No hay eventos de autenticación en esta página.'
		])
			await expect(page.getByText(empty, { exact: true })).toBeVisible();
		await page
			.getByRole('navigation', { name: 'Páginas de usuarios' })
			.getByRole('link', { name: 'Anterior' })
			.click();
		await expect(page).toHaveURL(/page=9998/);
		await seedBrowser(normalLogin.data.session!);
		const denied = await page.goto(`${origin}/admin`);
		expect(denied?.status()).toBe(403);
		await expect(page.getByRole('heading', { name: 'Administración', exact: true })).toHaveCount(0);
		const deniedMutation = await page.request.post(`${origin}/admin?/disable`, {
			form: { userId: userIds[0], confirm: 'on' },
			headers: { origin }
		});
		expect(deniedMutation.status()).toBe(403);
	} finally {
		if (server && server.exitCode === null) {
			server.kill();
			await Promise.race([
				once(server, 'exit'),
				new Promise((resolve) => setTimeout(resolve, 5000))
			]);
		}
		if (familyId)
			expect((await service.from('families').delete().eq('id', familyId)).error).toBeNull();
		for (const id of userIds.reverse())
			expect((await service.auth.admin.deleteUser(id)).error).toBeNull();
	}
});
