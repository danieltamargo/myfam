import { expect, test } from '@playwright/test';

test('CSP blocks injected scripts and event handlers while the application hydrates', async ({
	page,
	request
}) => {
	const response = await request.get('/login');
	expect(response.ok()).toBe(true);
	const policy = response.headers()['content-security-policy'];
	expect(policy).toBeTruthy();
	const scripts = policy.split(';').find((directive) => directive.trim().startsWith('script-src '));
	expect(scripts).toContain("'self'");
	expect(scripts).toMatch(/'(nonce|sha256)-[^']+'/);
	expect(scripts).not.toContain('unsafe-inline');
	expect(scripts).not.toContain('unsafe-eval');
	for (const directive of [
		"object-src 'none'",
		"base-uri 'self'",
		"form-action 'self'",
		"frame-ancestors 'none'"
	]) {
		expect(policy).toContain(directive);
	}

	await page.addInitScript(() => {
		localStorage.setItem('theme', 'myfam-dark');
		document.addEventListener('securitypolicyviolation', (event) => {
			if (event.blockedURI === 'inline') {
				const root = document.documentElement;
				root.dataset.blockedInline = `${root.dataset.blockedInline ?? ''} ${event.effectiveDirective}`;
			}
		});
	});
	await page.route('**/login', async (route) => {
		if (route.request().resourceType() !== 'document') return route.continue();
		const original = await route.fetch();
		const html = await original.text();
		const attack = `<script>document.documentElement.dataset.injectedScript = 'executed';</script>
			<img id="csp-injected-image" src="/csp-missing-image" onerror="document.documentElement.dataset.injectedHandler = 'executed'">`;
		await route.fulfill({ response: original, body: html.replace('</body>', `${attack}</body>`) });
	});
	await page.goto('/login');
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'myfam-dark');
	await expect(page.getByRole('button', { name: 'Iniciar sesión', exact: true })).toBeEnabled();
	await expect(page.locator('#csp-injected-image')).toBeAttached();
	await expect(page.locator('html')).toHaveAttribute('data-blocked-inline', /script-src-elem/);
	await expect(page.locator('html')).toHaveAttribute('data-blocked-inline', /script-src-attr/);
	await expect(page.locator('html')).not.toHaveAttribute('data-injected-script');
	await expect(page.locator('html')).not.toHaveAttribute('data-injected-handler');
	await page.getByRole('button', { name: 'Cambiar tema' }).click();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'myfam-light');
});
