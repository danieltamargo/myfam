import { expect, test } from '@playwright/test';

test('the wishlist preview changes member before marking a gift bought', async ({ page }) => {
	await page.goto('/');
	const carousel = page.getByRole('region', { name: 'Descubre los módulos' });
	await carousel.getByRole('heading', { name: 'Calendario y Planner' }).scrollIntoViewIfNeeded();
	await carousel.getByRole('button', { name: 'Wishlist', exact: true }).click();
	const preview = carousel.locator('[data-module="wishlist"]');
	await preview.scrollIntoViewIfNeeded();
	await expect(preview.locator('[data-demo-click=member]')).toBeVisible();
	await expect(preview.getByText('Cámara', { exact: true })).toHaveCount(0);
	await expect(preview.getByText('Marcar comprado', { exact: true })).toBeVisible();
	await expect(preview.getByText('Comprado', { exact: true })).toBeVisible();
	await expect(preview.getByText('Marcar comprado', { exact: true })).toBeHidden();
});

test('offers one sign-in link and a localized, controllable tour', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto('/');
	const navigation = page.getByRole('navigation', { name: 'MyFamily' });
	await expect(navigation.getByRole('link', { name: 'Iniciar sesión' })).toHaveCount(1);
	await expect(navigation.getByRole('link')).toHaveCount(2);
	await expect(page.getByRole('button', { name: 'Pausar' })).toHaveCount(0);
	const demo = page.getByRole('region', { name: 'Demostración de MyFamily' });
	await demo.getByRole('button', { name: 'Tareas', exact: true }).click();
	await expect(demo.getByText('Hecha', { exact: true })).toBeVisible();
	await page.getByRole('combobox', { name: 'Idioma' }).selectOption('en');
	await expect(navigation.getByRole('link', { name: 'Sign in' })).toHaveCount(1);
	await expect(page.getByRole('heading', { name: 'Explore the modules' })).toBeAttached();
	await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
		await page.evaluate(() => innerWidth)
	);
});

test('loops through the demo and advances the module carousel', async ({ page }) => {
	await page.clock.install();
	await page.goto('/');
	await page.bringToFront();
	const demo = page.getByRole('region', { name: 'Demostración de MyFamily' });
	await expect(demo.getByRole('button', { name: 'Planner' })).toBeEnabled();
	await expect(demo.getByRole('button', { name: 'Planner' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await page.clock.runFor(3600);
	await expect(demo.getByRole('button', { name: 'Calendario' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(demo.getByRole('button', { name: /pausar|reanudar/i })).toHaveCount(0);
	const carousel = page.getByRole('region', { name: 'Descubre los módulos' });
	await carousel.getByRole('heading', { name: 'Calendario y Planner' }).scrollIntoViewIfNeeded();
	await expect(carousel.locator('.presentation-active')).toHaveCount(1);
	const initialHeight = await carousel
		.locator('article')
		.evaluate((element) => element.clientHeight);
	await page.clock.runFor(5200);
	await expect(carousel.getByRole('button', { name: 'Gastos' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(carousel.getByRole('button')).toHaveCount(4);
	await expect(carousel.locator('article')).toHaveCount(1);
	const expenseHeight = await carousel
		.locator('article')
		.evaluate((element) => element.clientHeight);
	expect(expenseHeight).toBe(initialHeight);
	await carousel.getByRole('button', { name: 'Listas' }).click();
	await expect(carousel.getByRole('button', { name: 'Listas' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await page.clock.runFor(5200);
	await expect(carousel.getByRole('button', { name: 'Calendario' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
});
