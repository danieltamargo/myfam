import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { loadEnv } from 'vite';
import { createContentSecurityPolicy } from './src/lib/config/csp.js';

const publicEnv = loadEnv(process.env.NODE_ENV ?? 'development', process.cwd(), 'VITE_');

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter(),
		csp: createContentSecurityPolicy(
			publicEnv.VITE_SUPABASE_URL,
			process.env.NODE_ENV !== 'production'
		),
		alias: {
			$paraglide: './src/lib/paraglide',
			$components: './src/components'
		}
	}
};

export default config;
