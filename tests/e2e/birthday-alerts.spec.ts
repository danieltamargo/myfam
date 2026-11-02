import { createHmac, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import type { Database } from '../../src/lib/types/database';

interface LocalSupabaseStatus {
	ANON_KEY: string;
	API_URL: string;
	JWT_SECRET: string;
	SECRET_KEY: string;
}

function userClient(status: LocalSupabaseStatus, userId: string, email: string) {
	const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
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
	const signature = createHmac('sha256', status.JWT_SECRET)
		.update(`${header}.${payload}`)
		.digest('base64url');
	return createClient<Database>(status.API_URL, status.ANON_KEY, {
		global: { headers: { Authorization: `Bearer ${header}.${payload}.${signature}` } },
		auth: { autoRefreshToken: false, persistSession: false }
	});
}

test('guarda y elimina cumpleaños, abre la wishlist filtrada y aísla familias', async ({
	page
}, testInfo) => {
	test.setTimeout(120_000);
	const status = JSON.parse(
		execFileSync('supabase', ['status', '-o', 'json'], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		})
	) as LocalSupabaseStatus;
	if (!['localhost', '127.0.0.1'].includes(new URL(status.API_URL).hostname))
		throw new Error('Las pruebas de cumpleaños requieren Supabase local.');
	const admin = createClient<Database>(status.API_URL, status.SECRET_KEY, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
	const suffix = randomUUID();
	const password = `Birthday-${randomUUID()}aA1!`;
	const ids: string[] = [];
	const families: string[] = [];
	const names = ['Propietario Cumpleaños', 'Ángela Cumpleaños', 'Persona de otra familia'];
	const emails = names.map((_, index) => `birthday-${index}-${suffix}@example.test`);
	const todayParts = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Europe/Madrid',
		month: 'numeric',
		day: 'numeric'
	}).formatToParts(new Date());
	const month = Number(todayParts.find((part) => part.type === 'month')!.value);
	const day = Number(todayParts.find((part) => part.type === 'day')!.value);
	try {
		for (const [index, email] of emails.entries()) {
			const result = await admin.auth.admin.createUser({
				email,
				password,
				email_confirm: true,
				user_metadata: { name: names[index] }
			});
			expect(result.error).toBeNull();
			expect(result.data.user?.id).toBeTruthy();
			ids.push(result.data.user!.id);
		}
		const [owner, member, outsider] = ids.map((id, index) => userClient(status, id, emails[index]));
		for (const [index, client] of [owner, outsider].entries()) {
			const result = await client.rpc('create_family', {
				p_name: `Birthday E2E ${index} ${suffix}`
			});
			expect(result.error).toBeNull();
			expect(result.data).toBeTruthy();
			families.push(result.data!);
		}
		const [familyId, otherFamilyId] = families;
		const invite = await owner.rpc('invite_family_member', {
			p_family_id: familyId,
			p_email: emails[1]
		});
		expect(invite.error).toBeNull();
		expect(
			(await member.rpc('accept_family_invitation', { p_invitation_id: invite.data! })).error
		).toBeNull();
		expect(
			(
				await outsider
					.from('family_member_birthdays')
					.insert({ family_id: otherFamilyId, user_id: ids[2], month, day })
			).error
		).toBeNull();
		const ownGiftName = `Regalo de Ángela ${suffix}`;
		const otherGiftName = `Regalo del propietario ${suffix}`;
		for (const [client, id, name] of [
			[owner, ids[0], otherGiftName],
			[member, ids[1], ownGiftName]
		] as const)
			expect(
				(await client.from('gift_items').insert({ family_id: familyId, owner_id: id, name })).error
			).toBeNull();

		await page.goto('/login');
		await page.getByLabel('Email', { exact: true }).fill(emails[1]);
		await page.getByLabel('Password', { exact: true }).fill(password);
		await page.getByRole('button', { name: 'Sign In', exact: true }).click();
		await page.waitForURL('**/dashboard');
		await page.goto(`/family/${familyId}/settings/birthdays`);
		await expect(page.getByRole('heading', { name: 'Cumpleaños familiares' })).toBeVisible();
		await expect(page.getByLabel(`Día de cumpleaños de ${names[0]}`, { exact: true })).toHaveCount(
			0
		);
		await expect(page.getByText(names[2], { exact: true })).toHaveCount(0);
		await expect(page.getByRole('complementary', { name: 'Cumpleaños próximos' })).toHaveCount(0);
		await page.getByLabel(`Día de cumpleaños de ${names[1]}`, { exact: true }).fill('30');
		await page.getByLabel(`Mes de cumpleaños de ${names[1]}`, { exact: true }).selectOption('2');
		await page.getByRole('button', { name: 'Guardar', exact: true }).click();
		await expect(page.getByText('Indica un día y un mes válidos.', { exact: true })).toBeVisible();
		await page.getByLabel(`Día de cumpleaños de ${names[1]}`, { exact: true }).fill(String(day));
		await page
			.getByLabel(`Mes de cumpleaños de ${names[1]}`, { exact: true })
			.selectOption(String(month));
		await page.getByRole('button', { name: 'Guardar', exact: true }).click();
		await expect(page.getByText('Cumpleaños guardado.', { exact: true })).toBeVisible();
		const alert = page.getByRole('complementary', { name: 'Cumpleaños próximos' });
		await expect(alert.getByText(names[1], { exact: true })).toBeVisible();
		await expect(alert.getByText(names[2], { exact: true })).toHaveCount(0);
		await expect(alert.getByRole('link', { name: `Ver wishlist de ${names[1]}` })).toHaveAttribute(
			'href',
			`/family/${familyId}/wishlist?member=${ids[1]}`
		);
		await testInfo.attach('birthday-settings', {
			body: await page.screenshot({ fullPage: true }),
			contentType: 'image/png'
		});
		await alert.getByRole('link', { name: `Ver wishlist de ${names[1]}` }).click();
		await expect(page).toHaveURL(new RegExp(`/wishlist\\?member=${ids[1]}$`));
		await expect(page.getByTestId('wishlist-filter-member')).toHaveValue(ids[1]);
		await expect(page.getByText(ownGiftName, { exact: true })).toBeVisible();
		await expect(page.getByText(otherGiftName, { exact: true })).toHaveCount(0);

		await page.getByRole('tab', { name: 'Cumpleaños', exact: true }).click();
		await expect(page.getByRole('heading', { name: 'Cumpleaños familiares' })).toBeVisible();
		for (const theme of ['myfam-light', 'myfam-dark']) {
			await page.evaluate(
				(value) => document.documentElement.setAttribute('data-theme', value),
				theme
			);
			const widths = await page.evaluate(() => ({
				body: document.body.scrollWidth,
				viewport: window.innerWidth
			}));
			expect(widths.body).toBeLessThanOrEqual(widths.viewport + 1);
		}
		await testInfo.attach('birthday-settings-dark', {
			body: await page.screenshot({ fullPage: true }),
			contentType: 'image/png'
		});
		await page.getByRole('button', { name: 'Eliminar fecha', exact: true }).click();
		await expect(page.getByText('Cumpleaños eliminado.', { exact: true })).toBeVisible();
		await expect(page.getByRole('complementary', { name: 'Cumpleaños próximos' })).toHaveCount(0);
		const saved = await member
			.from('family_member_birthdays')
			.select('user_id')
			.eq('family_id', familyId)
			.eq('user_id', ids[1]);
		expect(saved.error).toBeNull();
		expect(saved.data).toEqual([]);
		const foreign = await member
			.from('family_member_birthdays')
			.select('user_id')
			.eq('family_id', otherFamilyId);
		expect(foreign.error).toBeNull();
		expect(foreign.data).toEqual([]);
		const response = await page.goto(`/family/${otherFamilyId}/settings/birthdays`);
		expect(response?.status()).toBe(404);
		await expect(page.getByText(names[2], { exact: true })).toHaveCount(0);
	} finally {
		for (const familyId of families)
			expect((await admin.from('families').delete().eq('id', familyId)).error).toBeNull();
		for (const id of ids) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
	}
});
