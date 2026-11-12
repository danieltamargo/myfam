import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

test('mantiene el registro cerrado y valida el acceso de una cuenta creada por el administrador', async ({
	page,
	context
}) => {
	const status = JSON.parse(
		execFileSync('supabase', ['status', '-o', 'json'], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		})
	);
	if (!['127.0.0.1', 'localhost'].includes(new URL(status.API_URL).hostname)) {
		throw new Error('La prueba de registro requiere Supabase local.');
	}
	const admin = createClient(status.API_URL, status.SECRET_KEY ?? status.SERVICE_ROLE_KEY, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
	const publicAuth = createClient(status.API_URL, status.ANON_KEY, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
	const email = `auth-${randomUUID()}@example.test`;
	const password = `Auth-${randomUUID()}aA1!`;
	let userId: string | undefined;
	try {
		const registration = await page.goto('/register');
		expect(registration?.status()).toBe(403);
		await expect(page.getByRole('button', { name: 'Sign Up', exact: true })).toHaveCount(0);
		const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
		expect(created.error).toBeNull();
		userId = created.data.user?.id;
		expect(userId).toBeTruthy();
		await context.clearCookies();
		await page.evaluate(() => localStorage.clear());
		await page.goto('/login');
		await page.getByLabel('Correo electrónico', { exact: true }).fill(email);
		await page.getByLabel('Contraseña', { exact: true }).fill('Contraseña incorrecta');
		await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
		await expect(page.locator('.alert-error')).toBeVisible();
		await expect(page).toHaveURL(/\/login$/);
		await page.getByLabel('Contraseña', { exact: true }).fill(password);
		await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
		await expect(page).toHaveURL(/\/dashboard$/);
		const recovery = await publicAuth.auth.resetPasswordForEmail(email);
		expect(recovery.error).toBeNull();
		const repeatedRecovery = await publicAuth.auth.resetPasswordForEmail(email);
		expect(repeatedRecovery.error?.status).toBe(429);
		const updatedEmail = `updated-${randomUUID()}@example.test`;
		const updated = await admin.auth.admin.updateUserById(userId!, {
			email: updatedEmail,
			email_confirm: true
		});
		expect(updated.error).toBeNull();
		const profile = await admin.from('profiles').select('email').eq('id', userId!).single();
		expect(profile.error).toBeNull();
		expect(profile.data?.email).toBe(updatedEmail);
	} finally {
		if (userId) {
			const deleted = await admin.auth.admin.deleteUser(userId);
			expect(deleted.error).toBeNull();
		}
	}
});

test('establece la contraseña de una invitación y rechaza enlaces incompletos', async ({
	page
}) => {
	const status = JSON.parse(
		execFileSync('supabase', ['status', '-o', 'json'], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		})
	);
	if (!['127.0.0.1', 'localhost'].includes(new URL(status.API_URL).hostname))
		throw new Error('La prueba de bienvenida requiere Supabase local.');
	const admin = createClient(status.API_URL, status.SECRET_KEY ?? status.SERVICE_ROLE_KEY, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
	const client = createClient(status.API_URL, status.ANON_KEY, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
	const email = `invitation-${randomUUID()}@example.test`;
	let userId: string | undefined;
	try {
		const link = await admin.auth.admin.generateLink({ type: 'invite', email });
		expect(link.error).toBeNull();
		userId = link.data.user?.id;
		expect(userId).toBeTruthy();
		const verified = await client.auth.verifyOtp({
			type: 'invite',
			token_hash: link.data.properties!.hashed_token
		});
		expect(verified.error).toBeNull();
		const session = verified.data.session!;
		expect(session).toBeTruthy();
		const fragment = new URLSearchParams({
			type: 'invite',
			access_token: session.access_token,
			refresh_token: session.refresh_token
		});
		await page.goto(`/reset-password#${fragment}`);
		await expect(page.getByLabel('Nueva contraseña', { exact: true })).toBeVisible();
		await expect(page).toHaveURL(/\/reset-password$/);
		const password = `Invitation-${randomUUID()}aA1!`;
		await page.getByLabel('Nueva contraseña', { exact: true }).fill(password);
		await page.getByLabel('Repite la nueva contraseña', { exact: true }).fill(password);
		await page.getByRole('button', { name: 'Guardar contraseña', exact: true }).click();
		await expect(page.getByText('Contraseña actualizada', { exact: true })).toBeVisible();
		await page.waitForURL('**/login');
		await page.getByLabel('Correo electrónico', { exact: true }).fill(email);
		await page.getByLabel('Contraseña', { exact: true }).fill(password);
		await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
		await page.waitForURL('**/dashboard');
		await page.goto('/reset-password#type=invite&access_token=incomplete');
		await expect(
			page.getByText(
				'El enlace de bienvenida ha caducado o no es válido. Solicita uno nuevo al administrador.'
			)
		).toBeVisible();
		await expect(page.getByLabel('Nueva contraseña', { exact: true })).toHaveCount(0);
		await expect(page).toHaveURL(/\/reset-password$/);
	} finally {
		if (userId) {
			const deleted = await admin.auth.admin.deleteUser(userId);
			expect(deleted.error).toBeNull();
		}
	}
});
