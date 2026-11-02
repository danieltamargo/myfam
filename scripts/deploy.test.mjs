import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import {
	parseEnv,
	serializeEnv,
	httpsOrigin,
	validEmail,
	generateSupabaseEnv,
	isolateCompose,
	migrationSql,
	nginxConfig,
	DEPLOY_ROOT,
	composeEnvironment,
	redactGatewayAccessLog,
	assertNginxHostsAvailable
} from './deploy-config.mjs';

const options = {
	app: 'https://familia.example.com',
	api: 'https://api.example.com',
	smtpHost: 'smtp.example.com',
	smtpPort: '587',
	smtpUser: 'mail-user',
	smtpPassword: 'test-only-$literal',
	smtpEmail: 'sender@example.com'
};

test('host exports cannot replace generated credentials or inject Compose files', () => {
	assert.deepEqual(
		composeEnvironment(
			{
				PATH: '/bin',
				POSTGRES_PASSWORD: 'wrong',
				VITE_SUPABASE_URL: 'https://wrong.example.com',
				COMPOSE_FILE: '/foreign/compose.yml',
				COMPOSE_PROFILES: 'foreign'
			},
			{ POSTGRES_PASSWORD: 'generated', VITE_SUPABASE_URL: options.api }
		),
		{ PATH: '/bin' }
	);
});

test('environment data preserves UTF-8 and shell syntax as literals', () => {
	const input = parseEnv(
		"# config\nNAME='Mabu y José'\nSECRET=$(touch /tmp/should-never-exist)\nOTHER=`id`\nEMPTY=\n"
	);
	assert.equal(input.NAME, 'Mabu y José');
	assert.equal(input.SECRET, '$(touch /tmp/should-never-exist)');
	assert.equal(input.OTHER, '`id`');
	assert.deepEqual(parseEnv(serializeEnv(input)), input);
	assert.match(serializeEnv({ SECRET: 'literal$#value' }, true), /^SECRET=literal\$#value\n$/);
	for (const source of [
		'KEY=one\nKEY=two',
		'not-an-entry',
		'KEY="unfinished',
		'KEY=before\u001bafter'
	])
		assert.throws(() => parseEnv(source));
	assert.throws(() => serializeEnv({ SECRET: "can't-serialize" }));
});

test('public origins reject credentials, URL suffixes and nginx injection', () => {
	assert.equal(httpsOrigin('https://Familia.example.com/'), options.app);
	for (const value of [
		'http://familia.example.com',
		'https://user:secret@familia.example.com',
		'https://familia.example.com/reset',
		'https://familia.example.com?token=secret',
		'https://familia.example.com#secret',
		'https://familia.example.com:8443',
		'https://127.0.0.1',
		'https://localhost',
		'https://bad_.example.com',
		'https://familia.example.com;include'
	])
		assert.throws(() => httpsOrigin(value));
	assert.equal(validEmail('sender@example.com'), 'sender@example.com');
	assert.throws(() => validEmail('bad\n@example.com'));
});

test('fresh Supabase secrets are unique and JWTs carry the intended roles', () => {
	const first = generateSupabaseEnv('POSTGRES_PASSWORD=example\nJWT_SECRET=example\n', options);
	const second = generateSupabaseEnv('', options);
	assert.notEqual(first.POSTGRES_PASSWORD, second.POSTGRES_PASSWORD);
	assert.equal(first.POSTGRES_PASSWORD.length, 64);
	assert.equal(first.REALTIME_DB_ENC_KEY.length, 16);
	assert.equal(first.VAULT_ENC_KEY.length, 32);
	assert.equal(first.DISABLE_SIGNUP, 'true');
	assert.equal(first.ENABLE_EMAIL_SIGNUP, 'true');
	assert.equal(first.ENABLE_PHONE_SIGNUP, 'false');
	assert.equal(first.ENABLE_ANONYMOUS_USERS, 'false');
	assert.equal(first.API_EXTERNAL_URL, `${options.api}/auth/v1`);
	assert.ok(first.ADDITIONAL_REDIRECT_URLS.split(',').includes(`${options.app}/reset-password`));
	assert.deepEqual(parseEnv(serializeEnv(first)), first);
	for (const [key, role] of [
		['ANON_KEY', 'anon'],
		['SERVICE_ROLE_KEY', 'service_role']
	]) {
		const [head, payload, signature] = first[key].split('.');
		assert.equal(JSON.parse(Buffer.from(payload, 'base64url')).role, role);
		assert.equal(
			signature,
			createHmac('sha256', first.JWT_SECRET).update(`${head}.${payload}`).digest('base64url')
		);
	}
});

function officialFixture() {
	const service = () => ({
		container_name: 'unsafe-global-name',
		networks: { default: null },
		environment: {},
		ports: [{ target: 5432, published: '5432' }]
	});
	const services = Object.fromEntries(
		[
			'api-gw',
			'db',
			'storage',
			'imgproxy',
			'auth',
			'realtime',
			'functions',
			'studio',
			'supavisor'
		].map((name) => [name, service()])
	);
	services.db.volumes = [
		{
			type: 'bind',
			source: '/private/upstream/volumes/db/data',
			target: '/var/lib/postgresql/data'
		},
		{ type: 'volume', source: 'db-config', target: '/etc/postgresql-custom' }
	];
	for (const name of ['storage', 'imgproxy'])
		services[name].volumes = [
			{ type: 'bind', source: '/private/upstream/volumes/storage', target: '/var/lib/storage' }
		];
	return {
		services,
		networks: { default: { name: 'supabase_default' } },
		volumes: { 'db-config': { name: 'supabase_db-config' } }
	};
}

test('Compose isolation removes global names and public database/Studio ports', () => {
	const official = officialFixture();
	const app = {
		services: {
			app: {
				env_file: [{ path: '/bad/${APP_ENV_FILE}' }],
				ports: [{ target: 3000, published: '3000', host_ip: '127.0.0.1' }]
			},
			clamav: {}
		}
	};
	const result = isolateCompose(official, app);
	assert.equal(result.services.db.volumes[0].type, 'volume');
	assert.equal(result.services.db.volumes[1].source, 'db-config');
	assert.equal(
		result.services.storage.volumes[0].source,
		result.services.imgproxy.volumes[0].source
	);
	assert.equal(result.services['api-gw'].ports[0].host_ip, '127.0.0.1');
	assert.deepEqual(
		Object.keys(result.services).filter((name) => result.services[name].ports),
		['api-gw', 'app']
	);
	assert.ok(Object.values(result.services).every((value) => !value.container_name));
	assert.ok(Object.values(result.volumes).every((value) => !value.name));
	assert.equal(result.services.app.env_file[0].path, `${DEPLOY_ROOT}/app.env`);
	assert.deepEqual(result.services.realtime.networks.default.aliases, [
		'realtime-dev.supabase-realtime'
	]);
	assert.equal(result.services.auth.environment.GOTRUE_PASSWORD_MIN_LENGTH, '12');
	assert.equal(official.services.db.volumes[0].type, 'bind');
	assert.throws(() => isolateCompose({ services: {} }, app));
	const external = officialFixture();
	external.volumes.foreign = { external: true };
	assert.throws(() => isolateCompose(external, app));
});

test('nginx exposes only API paths and preserves WebSocket and forwarding headers', () => {
	const http = nginxConfig(options.app, options.api);
	const tls = nginxConfig(options.app, options.api, true);
	assert.match(http, /acme-challenge/);
	assert.doesNotMatch(http, /ssl_certificate/);
	assert.match(tls, /ssl_certificate \/etc\/letsencrypt\/live\/myfamily-guided\/fullchain.pem/);
	assert.match(tls, /\(auth\|rest\|realtime\|storage\|functions\)/);
	assert.match(tls, /location \/ \{ return 404;/);
	assert.match(tls, /proxy_set_header X-Forwarded-For \$remote_addr/);
	assert.match(tls, /proxy_set_header Upgrade \$http_upgrade/);
	assert.throws(() => nginxConfig(options.app, options.app, true));
	const format = tls.split('\n').find((line) => line.startsWith('log_format'));
	assert.equal(
		format,
		"log_format myfamily_guided '$time_iso8601 $request_method $status $body_bytes_sent';"
	);
	assert.equal(
		(tls.match(/access_log \/var\/log\/nginx\/myfamily-guided.access.log myfamily_guided;/g) || [])
			.length,
		4
	);
	assert.equal((tls.match(/error_log \/dev\/null;/g) || []).length, 4);
});

test('gateway access log excludes canary URLs, headers and addresses and rejects format drift', () => {
	const fixture = String.raw`name: envoy.access_loggers.stdout
typed_config:
  '@type': type.googleapis.com/envoy.extensions.access_loggers.stream.v3.StdoutAccessLog
  log_format:
    text_format_source:
      inline_string: "%DOWNSTREAM_REMOTE_ADDRESS_WITHOUT_PORT% - - [%START_TIME(%d/%b/%Y:%H:%M:%S %z)%] \"%REQ(:METHOD)% %REQ(X-ENVOY-ORIGINAL-PATH?:PATH)% %PROTOCOL%\" %RESPONSE_CODE% %BYTES_SENT% \"%REQ(REFERER)%\" \"%REQ(USER-AGENT)%\"\n"
`;
	const sanitized = redactGatewayAccessLog(fixture);
	assert.doesNotMatch(sanitized, /ORIGINAL-PATH|REFERER|USER-AGENT|REMOTE_ADDRESS|AUTHORIZATION/i);
	assert.equal(redactGatewayAccessLog(sanitized), sanitized);
	const render = (format) =>
		format.replace(
			/%REQ\(([^)]+)\)%/g,
			(_match, key) =>
				({
					':METHOD': 'GET',
					'X-ENVOY-ORIGINAL-PATH?:PATH': '/auth/v1/verify?token=canary-token',
					REFERER: 'https://app.example.com?code=canary-code',
					'USER-AGENT': 'canary-agent'
				})[key] || ''
		);
	assert.doesNotMatch(render(sanitized), /canary/);
	assert.match(render(fixture), /canary-token/);
	assert.throws(() => redactGatewayAccessLog(fixture.replace('inline_string:', 'json_format:')));
	assert.throws(() =>
		redactGatewayAccessLog(fixture.replace('%REQ(REFERER)%', '%REQ(AUTHORIZATION)%'))
	);
	assert.throws(() => redactGatewayAccessLog(fixture + fixture));
});

test('duplicate exact nginx domains are rejected outside the managed site', () => {
	const path = '/etc/nginx/conf.d/myfamily-guided.conf';
	const duplicate =
		'# configuration file /etc/nginx/conf.d/other.conf:\nserver { server_name\n FAMILIA.EXAMPLE.COM. api.other.example.com; }\n';
	assert.throws(() => assertNginxHostsAvailable(duplicate, path, [options.app, options.api]));
	assert.throws(() =>
		assertNginxHostsAvailable(
			duplicate.replace('FAMILIA.EXAMPLE.COM.', '"FAMILIA.EXAMPLE.COM."'),
			path,
			[options.app, options.api]
		)
	);
	assert.throws(() =>
		assertNginxHostsAvailable(
			duplicate.replace('FAMILIA.EXAMPLE.COM.', "'FAMILIA.EXAMPLE.COM.'"),
			path,
			[options.app, options.api]
		)
	);
	assert.doesNotThrow(() =>
		assertNginxHostsAvailable(duplicate.replace('/other.conf', '/myfamily-guided.conf'), path, [
			options.app,
			options.api
		])
	);
	assert.doesNotThrow(() =>
		assertNginxHostsAvailable(
			'# configuration file /etc/nginx/nginx.conf:\nserver { server_name elsewhere.example.com; } # server_name familia.example.com;\n',
			path,
			[options.app, options.api]
		)
	);
	assert.throws(() => assertNginxHostsAvailable('', path, [options.app, options.api]));
});

test('all repository migrations compile into ordered atomic tracked migrations', () => {
	const directory = resolve('supabase/migrations');
	const files = readdirSync(directory)
		.filter((name) => name.endsWith('.sql'))
		.map((name) => ({ name, sql: readFileSync(join(directory, name), 'utf8') }));
	const sql = migrationSql(files.reverse());
	assert.match(sql, /^\\set ON_ERROR_STOP on\nSELECT pg_advisory_lock/);
	assert.equal((sql.match(/^BEGIN;$/gm) || []).length, files.length);
	assert.equal((sql.match(/^COMMIT;$/gm) || []).length, files.length);
	assert.equal((sql.match(/^INSERT INTO myfamily_deploy.migrations/gm) || []).length, files.length);
	assert.match(sql, /Applied migration changed/);
	assert.match(sql, /Previously applied migration is missing/);
	assert.match(sql, /REVOKE ALL ON myfamily_deploy.migrations FROM PUBLIC, anon, authenticated/);
	assert.ok(
		sql.indexOf('20260116050346_complete_schema.sql') <
			sql.indexOf('20261101010000_family_storage_quota.sql')
	);
});

test('migration checksums tolerate platform newlines and reject ambiguous transactions', () => {
	const name = '20261101000000_example.sql';
	assert.equal(
		migrationSql([{ name, sql: 'select 1;\n' }]),
		migrationSql([{ name, sql: 'select 1;\r\n' }])
	);
	assert.match(
		migrationSql([{ name, sql: 'begin;\nselect 1;\ncommit;' }]),
		/BEGIN;\nselect 1;\nINSERT/
	);
	for (const sql of ['begin;\nselect 1;', '\\! touch /tmp/no', 'select 1;\ncommit;'])
		assert.throws(() => migrationSql([{ name, sql }]));
	assert.throws(() => migrationSql([{ name: "20261101_'bad.sql", sql: '' }]));
	assert.throws(() =>
		migrationSql([
			{ name, sql: '' },
			{ name: '20261101000000_duplicate.sql', sql: '' }
		])
	);
});

test('noninteractive execution fails before reading or printing environment credentials', () => {
	const directory = mkdtempSync(join(tmpdir(), 'guided-deploy-'));
	try {
		const file = join(directory, '.env');
		writeFileSync(file, 'ORIGIN=https://user:canary-secret@example.com?token=canary-token\n');
		const result = spawnSync(process.execPath, ['scripts/deploy-guided.mjs', file], {
			encoding: 'utf8'
		});
		assert.notEqual(result.status, 0);
		assert.doesNotMatch(result.stdout + result.stderr, /canary-secret|canary-token/);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test(
	'operator cancellation hides malformed URLs and makes no deployment changes',
	{
		skip:
			process.platform !== 'linux' ||
			process.getuid?.() !== 0 ||
			Number(process.versions.node.split('.')[0]) !== 24
	},
	() => {
		const directory = mkdtempSync(join(tmpdir(), 'guided-cancel-'));
		try {
			const file = join(directory, '.env');
			writeFileSync(
				file,
				'ORIGIN=https://user:canary-secret@example.com?token=canary-token\nSUPABASE_SECRET_KEY=canary-private\n'
			);
			const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
			const command = [process.execPath, resolve('scripts/deploy-guided.mjs'), file]
				.map(quote)
				.join(' ');
			const result = spawnSync('script', ['-q', '-e', '-c', command, '/dev/null'], {
				encoding: 'utf8',
				input: 'NO\n',
				timeout: 10000
			});
			assert.notEqual(result.status, 0);
			assert.match(result.stdout, /Cancelled by operator/);
			assert.doesNotMatch(
				result.stdout + result.stderr,
				/canary-secret|canary-token|canary-private/
			);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	}
);
