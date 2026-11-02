import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './tests/e2e',
	fullyParallel: false,
	forbidOnly: Boolean(process.env.CI),
	retries: 0,
	// The local Supabase Auth service rate-limits concurrent login bursts across projects.
	workers: 1,
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
	use: {
		baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4173',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		video: 'retain-on-failure'
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		},
		{
			name: 'mobile-chromium',
			use: { ...devices['Pixel 7'] }
		}
	],
	webServer: process.env.PLAYWRIGHT_BASE_URL
		? undefined
		: {
				command: 'pnpm build && pnpm preview --host 127.0.0.1 --port 4173 --strictPort',
				url: 'http://127.0.0.1:4173',
				reuseExistingServer: false,
				timeout: 120_000
			}
});
