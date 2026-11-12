import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const node = (relativePath, args, options) =>
	spawn(process.execPath, [fileURLToPath(new URL(relativePath, root)), ...args], {
		cwd: root,
		stdio: 'inherit',
		...options
	});

try {
	const status = JSON.parse(
		execFileSync('supabase', ['status', '-o', 'json'], {
			cwd: root,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		})
	);
	const api = new URL(status.API_URL);
	if (api.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(api.hostname)) {
		throw new Error('Supabase no es local.');
	}
	const app = node(
		'node_modules/vite/bin/vite.js',
		['dev', '--host', '127.0.0.1', '--port', '5173', '--strictPort'],
		{
			env: {
				...process.env,
				ORIGIN: 'http://localhost:5173',
				VITE_SUPABASE_URL: api.origin,
				VITE_SUPABASE_ANON_KEY: status.ANON_KEY,
				PUBLIC_SUPABASE_URL: api.origin,
				SUPABASE_URL: api.origin,
				SUPABASE_PROJECT_URL: api.origin,
				SUPABASE_SECRET_KEY: status.SECRET_KEY ?? status.SERVICE_ROLE_KEY
			}
		}
	);
	const mail = node('scripts/local-mail.mjs', ['--watch']);
	const children = [app, mail];
	for (const signal of ['SIGINT', 'SIGTERM']) {
		process.on(signal, () => children.forEach((child) => child.kill()));
	}
	for (const child of children) {
		child.on('exit', (code) => {
			children.filter((other) => other !== child).forEach((other) => other.kill());
			if (code) process.exitCode = code;
		});
	}
} catch {
	console.error('Inicia Docker y Supabase local antes de arrancar MyFamily.');
	process.exitCode = 1;
}
