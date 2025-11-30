import devtoolsJson from 'vite-plugin-devtools-json';
import { svelteInspector } from '@sveltejs/vite-plugin-svelte-inspector';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

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
			// showToggleButton: 'always',
			// toggleButtonPos: 'bottom-right'
		}),
		devtoolsJson()
	]
});
