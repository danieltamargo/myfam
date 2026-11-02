import { readFileSync, lstatSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { isIP } from 'node:net';

export function parseEnv(text) {
	const values = Object.create(null);
	for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
		if (!line.trim() || line.trimStart().startsWith('#')) continue;
		const match = /^(?:export\s+)?([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
		if (!match || Object.hasOwn(values, match[1])) throw new Error('ENV_FORMAT');
		let value = match[2].trim();
		if (value.startsWith('"') || value.startsWith("'")) {
			if (value.at(-1) !== value[0]) throw new Error('ENV_FORMAT');
			value = value.slice(1, -1);
		} else value = value.replace(/\s+#.*$/, '').trimEnd();
		if (/[\r\n\0]/.test(value) || value.includes('$')) throw new Error('ENV_FORMAT');
		values[match[1]] = value;
	}
	return values;
}

function publicHost(host) {
	return (
		!isIP(host) &&
		!host.includes(':') &&
		host.includes('.') &&
		!/(^|\.)(localhost|local|internal|test|invalid|example)$/.test(host) &&
		!/(^|\.)example\.(com|net|org)$/.test(host) &&
		/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(host)
	);
}

function httpsUrl(value) {
	try {
		const url = new URL(value);
		return (
			url.protocol === 'https:' &&
			!url.username &&
			!url.password &&
			!url.search &&
			!url.hash &&
			publicHost(url.hostname) &&
			url.pathname === '/' &&
			!url.port
		);
	} catch {
		return false;
	}
}

function validKey(value, role) {
	if (typeof value !== 'string' || /\.\.\.|placeholder|change.?me|your[_-]/i.test(value))
		return false;
	if (
		new RegExp(`^sb_${role === 'anon' ? 'publishable' : 'secret'}_[A-Za-z0-9_-]{20,}$`).test(value)
	)
		return true;
	try {
		const parts = value.split('.');
		return (
			parts.length === 3 &&
			parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part)) &&
			JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role === role
		);
	} catch {
		return false;
	}
}

export function validateConfig(compose, app, options = {}) {
	const errors = [],
		warnings = [];
	const requireValue = (key, values) => {
		if (!values[key] || /\.\.\.|placeholder|change.?me|your[_-]/i.test(values[key]))
			errors.push(`${key}: required production value`);
	};
	for (const key of ['APP_DOMAIN', 'APP_IMAGE', 'APP_ENV_FILE', 'ACME_EMAIL'])
		requireValue(key, compose);
	if (!publicHost(compose.APP_DOMAIN || ''))
		errors.push('APP_DOMAIN: public DNS hostname required');
	if (
		!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(compose.ACME_EMAIL || '') ||
		/example\.(com|org|net|invalid)$/i.test(compose.ACME_EMAIL || '')
	)
		errors.push('ACME_EMAIL: certificate contact required');
	if (!/^\//.test(compose.APP_ENV_FILE || ''))
		errors.push('APP_ENV_FILE: absolute Linux path required');
	if (options.envFile && resolve(compose.APP_ENV_FILE || '') !== resolve(options.envFile))
		errors.push('APP_ENV_FILE: must match --env-file');
	const image = compose.APP_IMAGE || '';
	if (
		!/^[a-zA-Z0-9][a-zA-Z0-9./:_-]*@sha256:[a-f0-9]{64}$/.test(image) &&
		!(
			/^[a-zA-Z0-9][a-zA-Z0-9./:_-]*:[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(image) &&
			!/:latest$/i.test(image) &&
			!/example|placeholder/i.test(image)
		)
	)
		errors.push('APP_IMAGE: version tag or sha256 digest required');
	if (!image.includes('@sha256:'))
		warnings.push('APP_IMAGE: tag immutability and image availability are not verified');
	const origin = `https://${compose.APP_DOMAIN}`;
	if (app.ORIGIN !== origin || !httpsUrl(app.ORIGIN))
		errors.push('ORIGIN: must match HTTPS APP_DOMAIN');
	if (!httpsUrl(app.VITE_SUPABASE_URL))
		errors.push('VITE_SUPABASE_URL: public HTTPS gateway URL required');
	for (const key of ['SUPABASE_PROJECT_URL', 'SUPABASE_URL', 'PUBLIC_SUPABASE_URL']) {
		if (app[key] && app[key].replace(/\/$/, '') !== app.VITE_SUPABASE_URL?.replace(/\/$/, ''))
			errors.push(`${key}: must match VITE_SUPABASE_URL`);
	}
	if (
		options.expectedSupabaseUrl &&
		(!httpsUrl(options.expectedSupabaseUrl) ||
			options.expectedSupabaseUrl.replace(/\/$/, '') !== app.VITE_SUPABASE_URL?.replace(/\/$/, ''))
	)
		errors.push('VITE_SUPABASE_URL: differs from explicit build URL');
	if (!options.expectedSupabaseUrl)
		warnings.push(
			'VITE_SUPABASE_URL: build-time URL match not verified; supply --expected-supabase-url'
		);
	if (!validKey(app.VITE_SUPABASE_ANON_KEY, 'anon'))
		errors.push('VITE_SUPABASE_ANON_KEY: publishable key or anon JWT required');
	let serverKey = app.SUPABASE_SECRET_KEY || app.SUPABASE_SERVICE_ROLE_KEY;
	if (app.SUPABASE_SECRET_KEYS) {
		try {
			serverKey = JSON.parse(app.SUPABASE_SECRET_KEYS)[app.SUPABASE_SECRET_KEY_NAME || 'default'];
		} catch {
			serverKey = undefined;
		}
	}
	if (!validKey(serverKey, 'service_role'))
		errors.push(
			'SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SECRET_KEYS: valid server key required'
		);
	for (const [key, value] of Object.entries(app)) {
		if (value && /\.\.\.|placeholder|change.?me|your[_-]/i.test(value))
			errors.push(`${key}: template placeholder must be removed`);
	}
	for (const provider of ['GOOGLE', 'MICROSOFT']) {
		if (!app[`${provider}_CALENDAR_CLIENT_ID`] && !app[`${provider}_CALENDAR_CLIENT_SECRET`])
			continue;
		for (const suffix of ['CLIENT_ID', 'CLIENT_SECRET'])
			requireValue(`${provider}_CALENDAR_${suffix}`, app);
		if (app[`${provider}_CALENDAR_ORIGIN`] !== origin)
			errors.push(`${provider}_CALENDAR_ORIGIN: must match ORIGIN`);
		if (!validKey(app.SUPABASE_SECRET_KEY, 'service_role') || !httpsUrl(app.SUPABASE_PROJECT_URL))
			errors.push(`${provider}_CALENDAR: SUPABASE_SECRET_KEY and SUPABASE_PROJECT_URL required`);
		if (!app.CALENDAR_TOKEN_KEYS || !app.CALENDAR_TOKEN_ACTIVE_KEY)
			errors.push(`${provider}_CALENDAR: calendar keyring required`);
	}
	if (app.CALENDAR_TOKEN_KEYS || app.CALENDAR_TOKEN_ACTIVE_KEY) {
		try {
			const keys = JSON.parse(app.CALENDAR_TOKEN_KEYS);
			if (
				!keys ||
				typeof keys !== 'object' ||
				Array.isArray(keys) ||
				!Object.keys(keys).every((id) => /^[A-Za-z0-9_-]+$/.test(id)) ||
				!Object.hasOwn(keys, app.CALENDAR_TOKEN_ACTIVE_KEY) ||
				!Object.values(keys).every(
					(key) =>
						typeof key === 'string' &&
						/^[A-Za-z0-9+/]{43}=$/.test(key) &&
						Buffer.from(key, 'base64').length === 32
				)
			)
				throw new Error();
		} catch {
			errors.push(
				'CALENDAR_TOKEN_KEYS/CALENDAR_TOKEN_ACTIVE_KEY: valid 32-byte base64 keyring and active key required'
			);
		}
	}
	if (options.adminUrl) {
		try {
			const url = new URL(options.adminUrl);
			if (
				!['http:', 'https:'].includes(url.protocol) ||
				url.username ||
				url.password ||
				!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
			)
				throw new Error();
		} catch {
			errors.push('ADMIN_URL: use loopback through SSH tunnel; public administration is rejected');
		}
	} else warnings.push('ADMIN_URL: private administration access and listening ports not verified');
	return { errors: [...new Set(errors)], warnings };
}

export function composeVersionSupported(value) {
	const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(value.trim());
	if (!match) return false;
	const [major, minor, patch] = match.slice(1).map(Number);
	return major > 2 || (major === 2 && (minor > 24 || (minor === 24 && patch >= 4)));
}

export function main(args) {
	const flags = new Set([
		'--compose-env-file',
		'--env-file',
		'--expected-supabase-url',
		'--admin-url'
	]);
	const options = {};
	for (let i = 0; i < args.length; i++) {
		if (args[i] === '--check-docker' && !options.checkDocker) {
			options.checkDocker = true;
			continue;
		}
		if (!flags.has(args[i]) || !args[i + 1] || args[i + 1].startsWith('--') || options[args[i]])
			throw new Error(
				'ARGUMENTS: use --compose-env-file ABS --env-file ABS [--expected-supabase-url HTTPS] [--admin-url LOOPBACK] [--check-docker]'
			);
		options[args[i]] = args[++i];
	}
	const warnings = [];
	const load = (flag) => {
		const path = options[flag];
		if (!path || !isAbsolute(path))
			throw new Error(`${flag}: explicit absolute file path required`);
		let stat, content;
		try {
			stat = lstatSync(path);
			if (!stat.isFile() || stat.size > 1024 * 1024) throw new Error();
			if (process.platform !== 'win32' && (stat.mode & 0o777) !== 0o600) throw new Error();
			content = readFileSync(path, 'utf8');
		} catch {
			throw new Error(`${flag}: regular protected file required (Unix mode 0600; maximum 1 MiB)`);
		}
		if (process.platform === 'win32')
			warnings.push(`${flag}: Windows ACL not verified; restrict access to operator`);
		try {
			return parseEnv(content);
		} catch {
			throw new Error(`${flag}: unsupported env syntax, interpolation or duplicate key`);
		}
	};
	const compose = load('--compose-env-file');
	const app = load('--env-file');
	const result = validateConfig(compose, app, {
		envFile: options['--env-file'],
		expectedSupabaseUrl: options['--expected-supabase-url'],
		adminUrl: options['--admin-url']
	});
	result.warnings.push(...warnings);
	if (options.checkDocker) {
		const probe = spawnSync('docker', ['compose', 'version', '--short'], {
			encoding: 'utf8',
			timeout: 15000,
			windowsHide: true
		});
		if (probe.error || probe.status !== 0)
			result.errors.push('DOCKER_COMPOSE: version probe unavailable');
		else if (!composeVersionSupported(probe.stdout))
			result.errors.push('DOCKER_COMPOSE: version 2.24.4 or later required');
	} else result.warnings.push('DOCKER_COMPOSE: version not checked; use --check-docker on target');
	for (const message of result.errors) console.log(`ERROR ${message}`);
	for (const message of result.warnings) console.log(`WARN ${message}`);
	console.log(
		result.errors.length
			? 'Configuration rejected.'
			: 'Configuration checks passed; no services or external credentials verified.'
	);
	return result.errors.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		process.exitCode = main(process.argv.slice(2));
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}
