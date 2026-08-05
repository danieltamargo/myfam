import devtoolsJson from 'vite-plugin-devtools-json';
import { svelteInspector } from '@sveltejs/vite-plugin-svelte-inspector';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide'
		}),
		svelteInspector({
			toggleKeyCombo: 'control-shift',
			showToggleButton: 'always',
			toggleButtonPos: 'bottom-left'
		}),
		devtoolsJson()
	],
	test: {
		include: ['src/**/*.test.ts'],
		exclude: ['tests/e2e/**', 'node_modules/**'],
		environment: 'node'
	}
});
