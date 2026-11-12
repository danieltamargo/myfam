import { defineConfig, devices } from '@playwright/test';
import { randomBytes } from 'node:crypto';

const localApi = process.env.VITE_SUPABASE_URL;
const localSecret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const mockCalendarEnv: Record<string, string> =
	localApi && /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/?$/.test(localApi) && localSecret
		? {
				SUPABASE_PROJECT_URL: localApi,
				SUPABASE_SECRET_KEY: localSecret,
				GOOGLE_CALENDAR_CLIENT_ID: 'local-e2e',
				GOOGLE_CALENDAR_CLIENT_SECRET: 'local-e2e',
				GOOGLE_CALENDAR_ORIGIN: 'http://127.0.0.1:4173',
				CALENDAR_TOKEN_ACTIVE_KEY: 'local-e2e',
				CALENDAR_TOKEN_KEYS: JSON.stringify({
					'local-e2e': randomBytes(32).toString('base64')
				})
			}
		: {};

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
				env: mockCalendarEnv,
				reuseExistingServer: false,
				timeout: 120_000
			}
});
