import { expect, test } from '@playwright/test';

test('access forms keep provider details private and recovery responses uniform', async ({
	page
}) => {
	const privateDetail = 'INTERNAL_ACCOUNT_DETAIL_DO_NOT_RENDER';
	await page.route('**/auth/v1/token?**', (route) =>
		route.fulfill({
			status: 400,
			headers: {
				'x-supabase-api-version': '2024-01-01',
				'access-control-expose-headers': 'x-supabase-api-version'
			},
			contentType: 'application/json',
			body: JSON.stringify({ code: 'invalid_credentials', msg: privateDetail })
		})
	);
	await page.goto('/login');
	await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeEnabled();
	await page.getByLabel('Email', { exact: true }).fill('privacy@example.test');
	await page.getByLabel('Password', { exact: true }).fill('Synthetic-password-2026!');
	await page.getByRole('button', { name: 'Sign In', exact: true }).click();
	await expect(
		page.getByText('Unable to sign in. Check your email and password and try again.')
	).toBeVisible();
	await expect(page.locator('body')).not.toContainText(privateDetail);

	let recoveryCode: string | null = 'user_not_found';
	await page.route('**/auth/v1/recover**', (route) =>
		route.fulfill({
			status: recoveryCode ? 400 : 200,
			headers: {
				'x-supabase-api-version': '2024-01-01',
				'access-control-expose-headers': 'x-supabase-api-version'
			},
			contentType: 'application/json',
			body: JSON.stringify(recoveryCode ? { code: recoveryCode, msg: privateDetail } : {})
		})
	);
	for (const code of ['user_not_found', null]) {
		recoveryCode = code;
		await page.goto('/forgot-password');
		await expect(page.getByRole('button', { name: 'Send Reset Link' })).toBeEnabled();
		await page.getByLabel('Email', { exact: true }).fill('privacy@example.test');
		await page.getByRole('button', { name: 'Send Reset Link' }).click();
		await expect(
			page.getByText('If an account matches that email, you will receive a password reset link.')
		).toBeVisible();
		await expect(page.locator('body')).not.toContainText(privateDetail);
	}

	const registration = await page.goto('/register');
	expect(registration?.status()).toBe(403);
	await expect(
		page.getByText('El registro está cerrado. Solicita el acceso al administrador.')
	).toBeVisible();
	await expect(page.getByRole('button', { name: 'Sign Up', exact: true })).toHaveCount(0);
});
