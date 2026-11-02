import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseEnv, validateConfig, composeVersionSupported } from './check-vps-config.mjs';

const compose = {
	APP_DOMAIN: 'family.production.dev',
	APP_IMAGE: 'registry.production.dev/family:20261101',
	APP_ENV_FILE: '/srv/private/app.env',
	ACME_EMAIL: 'operations@production.dev'
};
const app = {
	ORIGIN: 'https://family.production.dev',
	VITE_SUPABASE_URL: 'https://data.production.dev',
	SUPABASE_PROJECT_URL: 'https://data.production.dev',
	VITE_SUPABASE_ANON_KEY: `sb_publishable_${'a'.repeat(30)}`,
	SUPABASE_SECRET_KEY: `sb_secret_${'b'.repeat(30)}`
};
const check = (c = {}, a = {}, options = {}) =>
	validateConfig({ ...compose, ...c }, { ...app, ...a }, options);

test('production configuration passes without optional OAuth and supports server key fallback', () => {
	assert.deepEqual(check().errors, []);
	assert.deepEqual(
		check({}, { SUPABASE_SECRET_KEY: '', SUPABASE_SERVICE_ROLE_KEY: app.SUPABASE_SECRET_KEY })
			.errors,
		[]
	);
	assert.deepEqual(
		check(
			{},
			{
				SUPABASE_SECRET_KEYS: JSON.stringify({ upload: app.SUPABASE_SECRET_KEY }),
				SUPABASE_SECRET_KEY_NAME: 'upload'
			}
		).errors,
		[]
	);
	assert.ok(check({}, { SUPABASE_SECRET_KEYS: '{}' }).errors.length);
});

test('rejects local URLs, mismatched origins, mutable default images and placeholder credentials', () => {
	for (const values of [
		{ APP_DOMAIN: 'localhost' },
		{ APP_IMAGE: 'family:latest' },
		{ APP_IMAGE: 'family' },
		{ APP_IMAGE: 'example/family:v1' },
		{ APP_ENV_FILE: './app.env' }
	])
		assert.ok(check(values).errors.length);
	for (const values of [
		{ ORIGIN: 'http://localhost:3000' },
		{ VITE_SUPABASE_URL: 'https://127.0.0.1' },
		{ PUBLIC_SUPABASE_URL: 'https://other.production.dev' },
		{ SUPABASE_SECRET_KEY: 'sb_secret_...' },
		{ VITE_SUPABASE_ANON_KEY: app.SUPABASE_SECRET_KEY }
	])
		assert.ok(check({}, values).errors.length);
	assert.ok(check({}, {}, { expectedSupabaseUrl: 'https://other.production.dev' }).errors.length);
	assert.ok(check({}, {}, { envFile: '/srv/other.env' }).errors.length);
	assert.deepEqual(
		check({ APP_IMAGE: `registry.production.dev/family@sha256:${'a'.repeat(64)}` }).errors,
		[]
	);
});

test('legacy JWT roles must match public and server use', () => {
	const jwt = (role) =>
		`e30.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
	assert.deepEqual(
		check({}, { VITE_SUPABASE_ANON_KEY: jwt('anon'), SUPABASE_SECRET_KEY: jwt('service_role') })
			.errors,
		[]
	);
	assert.ok(check({}, { VITE_SUPABASE_ANON_KEY: jwt('service_role') }).errors.length);
});

test('calendar opt-in requires credentials, matching origin and valid keyring', () => {
	const calendar = {
		GOOGLE_CALENDAR_CLIENT_ID: 'client',
		GOOGLE_CALENDAR_CLIENT_SECRET: 'secret',
		GOOGLE_CALENDAR_ORIGIN: app.ORIGIN,
		CALENDAR_TOKEN_KEYS: JSON.stringify({ current: Buffer.alloc(32, 7).toString('base64') }),
		CALENDAR_TOKEN_ACTIVE_KEY: 'current'
	};
	assert.deepEqual(check({}, calendar).errors, []);
	for (const values of [
		{ GOOGLE_CALENDAR_CLIENT_SECRET: '' },
		{ GOOGLE_CALENDAR_ORIGIN: 'https://other.production.dev' },
		{ CALENDAR_TOKEN_ACTIVE_KEY: 'missing' },
		{ CALENDAR_TOKEN_KEYS: '{}' },
		{ CALENDAR_TOKEN_KEYS: 'not-json' },
		{ SUPABASE_SECRET_KEY: '' }
	])
		assert.ok(check({}, { ...calendar, ...values }).errors.length);
});

test('administration requires a loopback tunnel URL when explicitly provided', () => {
	assert.deepEqual(check({}, {}, { adminUrl: 'http://127.0.0.1:54323' }).errors, []);
	for (const adminUrl of [
		'https://studio.production.dev',
		'http://127.0.0.1.evil.dev',
		'file:///tmp/socket',
		'http://user:secret@localhost'
	])
		assert.ok(check({}, {}, { adminUrl }).errors.length);
});

test('env parser handles quoted JSON and rejects interpolation, duplicates and malformed lines', () => {
	assert.equal(
		parseEnv('CALENDAR_TOKEN_KEYS=\'{"key":"value"}\'\nORIGIN=https://production.dev # comment\n')
			.CALENDAR_TOKEN_KEYS,
		'{"key":"value"}'
	);
	for (const text of ['A=one\nA=two', 'A=${SECRET}', 'bad syntax', 'A="unclosed'])
		assert.throws(() => parseEnv(text));
});

test('Compose compatibility boundary is explicit', () => {
	for (const version of ['2.24.4', 'v2.25.0', '2.40.1', '5.0.0'])
		assert.equal(composeVersionSupported(version), true);
	for (const version of ['2.24.3', '2.23.9', '1.29.2', 'unknown'])
		assert.equal(composeVersionSupported(version), false);
});

test('CLI requires explicit files, reads synthetic files only and never prints their contents', () => {
	const directory = mkdtempSync(join(tmpdir(), 'myfamily-preflight-'));
	try {
		const composeFile = join(directory, 'compose.env'),
			appFile = join(directory, 'app.env');
		writeFileSync(
			composeFile,
			Object.entries(compose)
				.map(([k, v]) => `${k}=${v}`)
				.join('\n'),
			{ mode: 0o600 }
		);
		writeFileSync(
			appFile,
			Object.entries(app)
				.map(([k, v]) => `${k}=${v}`)
				.join('\n'),
			{ mode: 0o600 }
		);
		const run = (...args) =>
			spawnSync(process.execPath, ['scripts/check-vps-config.mjs', ...args], { encoding: 'utf8' });
		assert.equal(run().status, 1);
		const result = run('--compose-env-file', composeFile, '--env-file', appFile);
		assert.equal(result.status, 1);
		const output = result.stdout + result.stderr;
		for (const value of [...Object.values(compose), ...Object.values(app), composeFile, appFile])
			assert.ok(!output.includes(value));
		assert.match(output, /APP_ENV_FILE/);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});
