import { execFileSync } from 'node:child_process';
import { createHash, createHmac, randomUUID } from 'node:crypto';
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

test('recupera MFA por el formulario real y exige verificar un nuevo autenticador', async ({
	page,
	context
}) => {
	test.setTimeout(90_000);
	const status = JSON.parse(
		execFileSync('supabase', ['status', '-o', 'json'], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		})
	) as { API_URL: string; ANON_KEY: string; SECRET_KEY?: string; SERVICE_ROLE_KEY: string };
	if (!['127.0.0.1', 'localhost'].includes(new URL(status.API_URL).hostname))
		throw new Error('Recovery E2E requires local Supabase');
	const cookieApiUrl = process.env.PLAYWRIGHT_SUPABASE_URL ?? status.API_URL;
	if (!['127.0.0.1', 'localhost', 'host.docker.internal'].includes(new URL(cookieApiUrl).hostname))
		throw new Error('Recovery cookies require a local Supabase URL');
	const options = { auth: { persistSession: false, autoRefreshToken: false } };
	const admin = createClient<Database>(
		status.API_URL,
		status.SECRET_KEY ?? status.SERVICE_ROLE_KEY,
		options
	);
	const owner = createClient<Database>(status.API_URL, status.ANON_KEY, options);
	const login = createClient<Database>(status.API_URL, status.ANON_KEY, options);
	const email = `recovery-${randomUUID()}@example.test`;
	const password = `Recovery-${randomUUID()}aA1!`;
	const newPassword = `Changed-${randomUUID()}aA1!`;
	let userId: string | undefined;
	let familyId: string | undefined;
	async function seedBrowser(session: Session) {
		const cookies: { name: string; value: string; domain: string; path: string }[] = [];
		const ssr = createServerClient<Database>(cookieApiUrl, status.ANON_KEY, {
			cookies: {
				getAll: () => [],
				setAll: (values) => {
					for (const value of values)
						cookies.push({ name: value.name, value: value.value, domain: '127.0.0.1', path: '/' });
				}
			}
		});
		expect((await ssr.auth.setSession(session)).error === null).toBe(true);
		await context.clearCookies();
		await context.addCookies(cookies);
	}
	try {
		const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
		userId = created.data.user?.id;
		expect(created.error === null).toBe(true);
		expect((await owner.auth.signInWithPassword({ email, password })).error === null).toBe(true);
		const family = await owner.rpc('create_family', { p_name: 'Prueba recuperación MFA' });
		familyId = family.data ?? undefined;
		expect(family.error === null).toBe(true);
		const factor = await owner.auth.mfa.enroll({
			factorType: 'totp',
			friendlyName: 'Old recovery factor'
		});
		expect(factor.error === null).toBe(true);
		expect(
			(
				await owner.auth.mfa.challengeAndVerify({
					factorId: factor.data!.id,
					code: totp(factor.data!.totp.secret)
				})
			).error === null
		).toBe(true);
		const oldSession = (await owner.auth.getSession()).data.session!;
		const oldClient = createClient<Database>(status.API_URL, status.ANON_KEY, {
			...options,
			global: { headers: { Authorization: `Bearer ${oldSession.access_token}` } }
		});
		await seedBrowser(oldSession);
		await page.goto('/profile/recovery');
		await page.getByRole('button', { name: 'Generar ocho códigos nuevos' }).click();
		const codeList = page
			.getByRole('region', { name: 'Códigos recién generados' })
			.getByRole('listitem');
		await expect(codeList).toHaveCount(8);
		const recoveryCode = (await codeList.first().textContent())!;
		await page.reload();
		await expect(page.getByRole('region', { name: 'Códigos recién generados' })).toHaveCount(0);
		const partial = await login.auth.signInWithPassword({ email, password });
		expect(partial.error === null).toBe(true);
		await seedBrowser(partial.data.session!);
		await page.goto('/recover-2fa');
		await page.getByLabel('Contraseña actual', { exact: true }).fill(password);
		await page.getByLabel('Nueva contraseña', { exact: true }).fill(newPassword);
		await page
			.getByLabel('Código de recuperación', { exact: true })
			.fill('00000000-00000000-00000000-00000000');
		await page.getByRole('button', { name: 'Recuperar y cambiar contraseña' }).click();
		await expect(page.getByRole('alert')).toContainText('No se pudo verificar');
		await page.getByLabel('Contraseña actual', { exact: true }).fill(password);
		await page.getByLabel('Nueva contraseña', { exact: true }).fill(newPassword);
		await page.getByLabel('Código de recuperación', { exact: true }).fill(recoveryCode);
		await page.getByRole('button', { name: 'Recuperar y cambiar contraseña' }).click();
		await expect(page).toHaveURL(/\/recover-2fa\/setup$/);
		expect(
			(await oldClient.from('families').select('id').eq('id', familyId!)).data ?? []
		).toHaveLength(0);
		expect((await oldClient.rpc('get_my_profile')).error?.code).toBe('42501');
		await page.goto('/profile');
		await expect(page).toHaveURL(/\/recover-2fa\/setup$/);
		const enrollment = page.waitForResponse(
			(response) =>
				response.url().includes('/auth/v1/factors') && response.request().method() === 'POST'
		);
		await page.getByRole('button', { name: 'Crear nuevo autenticador' }).click();
		const enrolled = await (await enrollment).json();
		expect(typeof enrolled.totp?.secret).toBe('string');
		await page
			.getByLabel('Código del autenticador', { exact: true })
			.fill(totp(enrolled.totp.secret));
		await page.getByRole('button', { name: 'Verificar autenticador' }).click();
		await expect(page.getByRole('button', { name: 'Completar recuperación' })).toBeVisible();
		await page.getByRole('button', { name: 'Completar recuperación' }).click();
		await expect(page).toHaveURL(/\/profile\/recovery$/);
		expect((await oldClient.rpc('get_my_profile')).error?.code).toBe('42501');
		const revokedHeaders = {
			apikey: status.ANON_KEY,
			Authorization: `Bearer ${oldSession.access_token}`,
			'Content-Type': 'application/json'
		};
		const revokedPasswordChange = await fetch(`${status.API_URL}/auth/v1/user`, {
			method: 'PUT',
			headers: revokedHeaders,
			body: JSON.stringify({ password: `Rejected-${randomUUID()}aA1!` })
		});
		expect(revokedPasswordChange.status).toBe(403);
		const revokedEnrollment = await fetch(`${status.API_URL}/auth/v1/factors`, {
			method: 'POST',
			headers: revokedHeaders,
			body: JSON.stringify({ factor_type: 'totp', friendly_name: 'Rejected old session' })
		});
		expect(revokedEnrollment.status).toBe(403);
		const replay = await admin.rpc('begin_mfa_recovery', {
			p_user_id: userId!,
			p_code_hash: createHash('sha256')
				.update(recoveryCode.replaceAll('-', '').toLowerCase())
				.digest('hex'),
			p_job_id: randomUUID()
		});
		expect(replay.error === null).toBe(true);
		expect(replay.data).toBe(false);
		const currentLogin = await login.auth.signInWithPassword({ email, password: newPassword });
		expect(currentLogin.error === null).toBe(true);
		expect((await login.rpc('get_my_profile')).error?.code).toBe('42501');
		await page.getByRole('button', { name: 'Generar ocho códigos nuevos' }).click();
		await expect(codeList).toHaveCount(8);
		const concurrentCode = (await codeList.first().textContent())!;
		const concurrentHash = createHash('sha256')
			.update(concurrentCode.replaceAll('-', '').toLowerCase())
			.digest('hex');
		const competingRecoveries = await Promise.all(
			[0, 1].map(() =>
				admin.rpc('begin_mfa_recovery', {
					p_user_id: userId!,
					p_code_hash: concurrentHash,
					p_job_id: randomUUID()
				})
			)
		);
		expect(competingRecoveries.every((result) => result.error === null)).toBe(true);
		expect(competingRecoveries.map((result) => result.data).sort()).toEqual([false, true]);
		if (test.info().project.name === 'mobile-chromium') {
			expect(
				await page.locator('body').evaluate((element) => element.scrollWidth)
			).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
		}
	} finally {
		if (familyId)
			expect((await admin.from('families').delete().eq('id', familyId)).error === null).toBe(true);
		if (userId) expect((await admin.auth.admin.deleteUser(userId)).error === null).toBe(true);
	}
});
