import { expect, test } from '@playwright/test';

test('the locale switch persists across access pages', async ({ page }) => {
	await page.goto('/login');
	await expect(
		page.getByRole('heading', { name: 'Te damos la bienvenida a MyFamily' })
	).toBeVisible();
	await page.getByLabel('Idioma', { exact: true }).selectOption('en');
	await expect(page.getByRole('heading', { name: 'Welcome to MyFamily' })).toBeVisible();
	await page.getByRole('link', { name: 'Forgot password?' }).click();
	await expect(page.getByRole('heading', { name: 'Forgot password' })).toBeVisible();
	await page.reload();
	await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	await page.getByLabel('Language', { exact: true }).selectOption('es');
	await expect(page.getByRole('heading', { name: 'Recuperar contraseña' })).toBeVisible();
});

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
	await expect(page.getByRole('button', { name: 'Iniciar sesión', exact: true })).toBeEnabled();
	await page.getByLabel('Correo electrónico', { exact: true }).fill('privacy@example.test');
	await page.getByLabel('Contraseña', { exact: true }).fill('Synthetic-password-2026!');
	await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
	await expect(
		page.getByText('No se pudo iniciar sesión. Revisa tu correo y contraseña e inténtalo de nuevo.')
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
		await expect(page.getByRole('button', { name: 'Enviar enlace' })).toBeEnabled();
		await page.getByLabel('Correo electrónico', { exact: true }).fill('privacy@example.test');
		await page.getByRole('button', { name: 'Enviar enlace' }).click();
		await expect(
			page.getByText(
				'Si hay una cuenta asociada a ese correo, recibirás un enlace para restablecer la contraseña.'
			)
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
