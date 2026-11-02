import { createHmac, createHash, randomBytes } from 'node:crypto';

export const SUPABASE_REVISION = 'bc27d2661edd09a5d0b8d76ce33da6d4071a756e';
export const DEPLOY_ROOT = '/var/lib/myfamily-guided';
export const DEPLOY_PROJECT = 'myfamily-guided';

export function composeEnvironment(host, configured) {
	const environment = { ...host };
	for (const key of Object.keys(environment)) {
		if (key.startsWith('COMPOSE_') || Object.hasOwn(configured, key)) delete environment[key];
	}
	return environment;
}

export function parseEnv(source) {
	const values = {};
	for (const [index, original] of source
		.replace(/^\uFEFF/, '')
		.split(/\r?\n/)
		.entries()) {
		const line = original.trim();
		if (!line || line.startsWith('#')) continue;
		const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
		if (!match || Object.hasOwn(values, match[1]))
			throw new Error(`Invalid or duplicate .env entry at line ${index + 1}`);
		let value = match[2];
		if (value.startsWith("'") || value.startsWith('"')) {
			const quote = value[0];
			const end = value.indexOf(quote, 1);
			if (end < 0 || !/^\s*(?:#.*)?$/.test(value.slice(end + 1)))
				throw new Error(`Unsupported quoted .env entry at line ${index + 1}`);
			value = value.slice(1, end);
		} else value = value.replace(/\s+#.*$/, '').trim();
		if (/\p{Cc}/u.test(value)) throw new Error(`Control character at .env line ${index + 1}`);
		values[match[1]] = value;
	}
	return values;
}

export function serializeEnv(values, raw = false) {
	return (
		Object.entries(values)
			.map(([key, value]) => {
				if (
					!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ||
					/\p{Cc}/u.test(value) ||
					(!raw && String(value).includes("'"))
				)
					throw new Error(`Unsupported environment value for ${key}`);
				return raw ? `${key}=${value}` : `${key}='${value}'`;
			})
			.join('\n') + '\n'
	);
}

export function httpsOrigin(value) {
	let url;
	try {
		url = new URL(value);
	} catch {
		throw new Error('Use an HTTPS URL such as https://familia.example.com');
	}
	if (
		url.protocol !== 'https:' ||
		url.username ||
		url.password ||
		url.port ||
		url.pathname !== '/' ||
		url.search ||
		url.hash ||
		!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(url.hostname)
	)
		throw new Error('Use an HTTPS domain URL without path, credentials, query or port');
	return url.origin;
}

export function validEmail(value) {
	if (
		value.length > 254 ||
		!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$/.test(
			value
		)
	)
		throw new Error('Invalid email address');
	return value;
}

export function generateSupabaseEnv(template, options) {
	const env = { ...parseEnv(template) };
	const hex = (bytes = 32) => randomBytes(bytes).toString('hex');
	for (const key of [
		'POSTGRES_PASSWORD',
		'JWT_SECRET',
		'DASHBOARD_PASSWORD',
		'PG_META_CRYPTO_KEY',
		'S3_PROTOCOL_ACCESS_KEY_SECRET',
		'LOGFLARE_PUBLIC_ACCESS_TOKEN',
		'LOGFLARE_PRIVATE_ACCESS_TOKEN'
	])
		env[key] = hex();
	env.SECRET_KEY_BASE = hex(48);
	env.REALTIME_DB_ENC_KEY = hex(8);
	env.VAULT_ENC_KEY = hex(16);
	env.S3_PROTOCOL_ACCESS_KEY_ID = hex(16);
	const issue = (role) => {
		const now = Math.floor(Date.now() / 1000);
		const data = [
			Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
			Buffer.from(
				JSON.stringify({ role, iss: 'supabase', iat: now, exp: now + 10 * 365 * 86400 })
			).toString('base64url')
		].join('.');
		return `${data}.${createHmac('sha256', env.JWT_SECRET).update(data).digest('base64url')}`;
	};
	env.ANON_KEY = issue('anon');
	env.SERVICE_ROLE_KEY = issue('service_role');
	Object.assign(env, {
		SUPABASE_PUBLIC_URL: httpsOrigin(options.api),
		API_EXTERNAL_URL: `${httpsOrigin(options.api)}/auth/v1`,
		SITE_URL: httpsOrigin(options.app),
		ADDITIONAL_REDIRECT_URLS: `${httpsOrigin(options.app)}/auth/callback,${httpsOrigin(options.app)}/reset-password`,
		DISABLE_SIGNUP: 'true',
		ENABLE_EMAIL_SIGNUP: 'true',
		ENABLE_PHONE_SIGNUP: 'false',
		ENABLE_ANONYMOUS_USERS: 'false',
		ENABLE_EMAIL_AUTOCONFIRM: 'false',
		ENABLE_PHONE_AUTOCONFIRM: 'false',
		POSTGRES_HOST: 'db',
		POSTGRES_DB: 'postgres',
		POSTGRES_PORT: '5432',
		POOLER_TENANT_ID: DEPLOY_PROJECT,
		FUNCTIONS_VERIFY_JWT: 'true',
		OPENAI_API_KEY: '',
		SMTP_HOST: options.smtpHost,
		SMTP_PORT: options.smtpPort,
		SMTP_USER: options.smtpUser,
		SMTP_PASS: options.smtpPassword,
		SMTP_ADMIN_EMAIL: validEmail(options.smtpEmail),
		SMTP_SENDER_NAME: 'MyFamily'
	});
	return env;
}

export function isolateCompose(official, app) {
	const config = structuredClone(official);
	if (
		!config.services?.['api-gw'] ||
		!config.services.db ||
		!config.services.storage ||
		!config.services.functions ||
		!config.services.realtime
	)
		throw new Error('Unexpected pinned Supabase Compose structure');
	for (const [name, service] of Object.entries(config.services)) {
		delete service.container_name;
		delete service.ports;
		if (name === 'realtime') {
			service.hostname = 'realtime-dev.supabase-realtime';
			service.networks.default = {
				...service.networks.default,
				aliases: ['realtime-dev.supabase-realtime']
			};
		}
		service.logging = { driver: 'json-file', options: { 'max-size': '10m', 'max-file': '3' } };
	}
	config.services['api-gw'].ports = [
		{ target: 8000, published: '8000', host_ip: '127.0.0.1', protocol: 'tcp' }
	];
	config.services['api-gw'].labels = {
		...config.services['api-gw'].labels,
		'myfamily.http-logs': 'sanitized-v1'
	};
	for (const [serviceName, target, source] of [
		['db', '/var/lib/postgresql/data', 'supabase-database'],
		['storage', '/var/lib/storage', 'supabase-storage'],
		['imgproxy', '/var/lib/storage', 'supabase-storage']
	]) {
		const mounts = config.services[serviceName]?.volumes;
		if (!mounts?.some((mount) => mount.target === target))
			throw new Error('Expected persistent mount missing');
		config.services[serviceName].volumes = mounts.map((mount) =>
			mount.target === target ? { type: 'volume', source, target } : mount
		);
	}
	config.services.auth.environment.GOTRUE_MFA_TOTP_ENROLL_ENABLED = 'true';
	config.services.auth.environment.GOTRUE_MFA_TOTP_VERIFY_ENABLED = 'true';
	config.services.auth.environment.GOTRUE_PASSWORD_MIN_LENGTH = '12';
	config.services.auth.environment.GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED = 'true';
	config.services.auth.environment.GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL = '10';
	config.services.auth.environment.GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_REAUTHENTICATION =
		'true';
	config.services.auth.environment.GOTRUE_MAILER_SECURE_EMAIL_CHANGE_ENABLED = 'true';
	config.services.auth.environment.GOTRUE_EXTERNAL_GOOGLE_ENABLED = 'false';
	config.services.auth.environment.GOTRUE_EXTERNAL_GITHUB_ENABLED = 'false';
	app = structuredClone(app);
	app.services.app.env_file = [{ path: `${DEPLOY_ROOT}/app.env`, format: 'raw', required: true }];
	Object.assign(config.services, app.services);
	config.volumes = {
		...config.volumes,
		...app.volumes,
		'supabase-database': {},
		'supabase-storage': {}
	};
	config.networks = { ...config.networks, ...app.networks };
	for (const resource of [...Object.values(config.volumes), ...Object.values(config.networks)]) {
		if (resource.external) throw new Error('External resources are not supported');
		delete resource.name;
	}
	config.name = DEPLOY_PROJECT;
	return config;
}

export function migrationSql(files) {
	const ordered = [...files]
		.sort((a, b) => a.name.localeCompare(b.name))
		.map((file) => {
			let body = file.sql.replace(/\r\n/g, '\n').trim();
			if (/^begin\s*;/i.test(body) && /commit\s*;$/i.test(body))
				body = body.replace(/^begin\s*;\s*/i, '').replace(/\s*commit\s*;$/i, '');
			return { ...file, body };
		});
	if (!ordered.length || ordered.some(({ name }) => !/^\d{14}_[A-Za-z0-9_-]+\.sql$/.test(name)))
		throw new Error('Invalid migration inventory');
	const names = new Set();
	for (const { name, body } of ordered) {
		if (
			names.has(name.slice(0, 14)) ||
			/^\s*\\/m.test(body) ||
			/^(?:BEGIN|COMMIT|ROLLBACK)\s*;/im.test(body)
		)
			throw new Error(`Unsupported migration: ${name}`);
		names.add(name.slice(0, 14));
	}
	let result = `\\set ON_ERROR_STOP on\nSELECT pg_advisory_lock(180926, 1);\nCREATE SCHEMA IF NOT EXISTS myfamily_deploy;\nREVOKE ALL ON SCHEMA myfamily_deploy FROM PUBLIC, anon, authenticated;\nCREATE TABLE IF NOT EXISTS myfamily_deploy.migrations (name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now());\nREVOKE ALL ON myfamily_deploy.migrations FROM PUBLIC, anon, authenticated;\n`;
	result += `DO $history$ BEGIN IF EXISTS (SELECT 1 FROM myfamily_deploy.migrations WHERE name NOT IN (${ordered.map(({ name }) => `'${name}'`).join(',')})) THEN RAISE EXCEPTION 'Previously applied migration is missing from checkout'; END IF; END; $history$;\n`;
	for (const { name, sql, body } of ordered) {
		const hash = createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
		result += `DO $checksum$ BEGIN IF EXISTS (SELECT 1 FROM myfamily_deploy.migrations WHERE name = '${name}' AND sha256 <> '${hash}') THEN RAISE EXCEPTION 'Applied migration changed: ${name}'; END IF; END; $checksum$;\nSELECT EXISTS (SELECT 1 FROM myfamily_deploy.migrations WHERE name = '${name}') AS applied \\gset\n\\if :applied\n\\else\nBEGIN;\n${body}\nINSERT INTO myfamily_deploy.migrations(name, sha256) VALUES ('${name}', '${hash}');\nCOMMIT;\n\\endif\n`;
	}
	return result + `SELECT pg_advisory_unlock(180926, 1);\n`;
}

export function redactGatewayAccessLog(template) {
	const original = String.raw`inline_string: "%DOWNSTREAM_REMOTE_ADDRESS_WITHOUT_PORT% - - [%START_TIME(%d/%b/%Y:%H:%M:%S %z)%] \"%REQ(:METHOD)% %REQ(X-ENVOY-ORIGINAL-PATH?:PATH)% %PROTOCOL%\" %RESPONSE_CODE% %BYTES_SENT% \"%REQ(REFERER)%\" \"%REQ(USER-AGENT)%\"\n"`;
	const sanitized = String.raw`inline_string: "[%START_TIME(%d/%b/%Y:%H:%M:%S %z)%] %REQ(:METHOD)% %PROTOCOL% %RESPONSE_CODE% %BYTES_SENT%\n"`;
	if (
		(template.match(/name:\s*envoy\.access_loggers\./g) || []).length !== 1 ||
		!template.includes('name: envoy.access_loggers.stdout') ||
		!template.includes(
			'type.googleapis.com/envoy.extensions.access_loggers.stream.v3.StdoutAccessLog'
		) ||
		(template.match(/text_format_source:/g) || []).length !== 1
	)
		throw new Error('Unexpected pinned gateway access logger structure');
	let found = 0;
	const result = template
		.split('\n')
		.map((line) => {
			if (line.trimStart() === original || line.trimStart() === sanitized) {
				found++;
				return line.slice(0, line.length - line.trimStart().length) + sanitized;
			}
			return line;
		})
		.join('\n');
	if (found !== 1) throw new Error('Unexpected pinned gateway access log format');
	return result;
}

export function assertNginxHostsAvailable(configuration, managedPath, origins) {
	const hosts = new Set(origins.map((origin) => new URL(httpsOrigin(origin)).hostname));
	const sections = configuration.split(/^# configuration file /m).slice(1);
	if (!sections.length) throw new Error('Cannot inspect existing nginx virtual hosts safely');
	for (const section of sections) {
		const newline = section.indexOf('\n');
		const path = section.slice(0, newline).replace(/:\r?$/, '');
		if (path === managedPath) continue;
		const body = section.slice(newline + 1).replace(/#[^\n]*/g, '');
		for (const match of body.matchAll(/\bserver_name\s+([^;]+);/g)) {
			for (const name of match[1].trim().split(/\s+/)) {
				if (
					hosts.has(
						name
							.replace(/^(['"])(.*)\1$/, '$2')
							.toLowerCase()
							.replace(/\.$/, '')
					)
				)
					throw new Error(
						'An application or API domain is already configured in another nginx site; resolve the duplicate virtual host before deploying'
					);
			}
		}
	}
}

export function nginxConfig(app, api, tls = false) {
	const appHost = new URL(httpsOrigin(app)).hostname;
	const apiHost = new URL(httpsOrigin(api)).hostname;
	if (appHost === apiHost) throw new Error('Application and Supabase require separate domains');
	const challenge =
		'location ^~ /.well-known/acme-challenge/ { root /var/lib/myfamily-guided/acme; }';
	const proxy = (port) =>
		`proxy_pass http://127.0.0.1:${port};\nproxy_http_version 1.1;\nproxy_set_header Host $host;\nproxy_set_header X-Real-IP $remote_addr;\nproxy_set_header X-Forwarded-For $remote_addr;\nproxy_set_header X-Forwarded-Proto $scheme;\nproxy_set_header Upgrade $http_upgrade;\nproxy_set_header Connection $myfamily_connection;\nproxy_read_timeout 3600s;`;
	const logs =
		'access_log /var/log/nginx/myfamily-guided.access.log myfamily_guided;\nerror_log /dev/null;\n';
	let result =
		'map $http_upgrade $myfamily_connection { default upgrade; "" close; }\nlog_format myfamily_guided \'$time_iso8601 $request_method $status $body_bytes_sent\';\n';
	for (const host of [appHost, apiHost]) {
		result += `server {\nlisten 80;\nlisten [::]:80;\nserver_name ${host};\n${logs}${challenge}\nlocation / { ${tls ? 'return 301 https://$host$request_uri;' : 'return 503;'} }\n}\n`;
		if (tls)
			result += `server {\nlisten 443 ssl;\nlisten [::]:443 ssl;\nserver_name ${host};\n${logs}ssl_certificate /etc/letsencrypt/live/myfamily-guided/fullchain.pem;\nssl_certificate_key /etc/letsencrypt/live/myfamily-guided/privkey.pem;\nssl_protocols TLSv1.2 TLSv1.3;\nclient_max_body_size 16m;\n${host === appHost ? `location / { ${proxy(3000)} }` : `location ~ ^/(auth|rest|realtime|storage|functions)/v1(?:/|$) { ${proxy(8000)} }\nlocation / { return 404; }`}\n}\n`;
	}
	return result;
}
