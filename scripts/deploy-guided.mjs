import { execFileSync } from 'node:child_process';
import {
	existsSync,
	readFileSync,
	writeFileSync,
	mkdirSync,
	copyFileSync,
	readdirSync,
	lstatSync,
	chmodSync,
	renameSync,
	unlinkSync,
	openSync,
	readSync,
	closeSync
} from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { Readable, Writable } from 'node:stream';
import { encrypt, decrypt } from './backup.mjs';
import { createReadStream } from 'node:fs';
import {
	DEPLOY_PROJECT,
	DEPLOY_ROOT,
	SUPABASE_REVISION,
	parseEnv,
	serializeEnv,
	httpsOrigin,
	validEmail,
	generateSupabaseEnv,
	isolateCompose,
	migrationSql,
	nginxConfig,
	composeEnvironment,
	redactGatewayAccessLog,
	assertNginxHostsAvailable
} from './deploy-config.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const markerPath = join(DEPLOY_ROOT, 'deployment.json');
const composePath = join(DEPLOY_ROOT, 'compose.json');
const supabasePath = join(DEPLOY_ROOT, 'supabase');
const envPath = join(DEPLOY_ROOT, 'supabase.env');
const appEnvPath = join(DEPLOY_ROOT, 'app.env');
const sitePath = '/etc/nginx/conf.d/myfamily-guided.conf';
const managedHeader = '# MyFamily guided deployment\n';
let tty;
for (const signal of ['SIGINT', 'SIGTERM'])
	process.on(signal, () => {
		if (tty !== undefined) {
			try {
				execFileSync('stty', ['echo'], { stdio: [tty, 'ignore', 'ignore'] });
			} catch {
				process.stderr.write('Restore terminal echo with stty echo.\n');
			}
		}
		process.exit(signal === 'SIGINT' ? 130 : 143);
	});

function run(command, args, options = {}) {
	try {
		let environment = process.env;
		if (command === 'docker' && args[0] === 'compose' && args.includes('--env-file')) {
			const configured = parseEnv(readFileSync(args[args.indexOf('--env-file') + 1], 'utf8'));
			environment = composeEnvironment(process.env, configured);
		}
		return execFileSync(command, args, {
			cwd: repository,
			env: environment,
			encoding: 'utf8',
			stdio: ['pipe', 'pipe', 'pipe'],
			maxBuffer: 32 * 1024 * 1024,
			...options
		}).trim();
	} catch {
		throw new Error(
			`Failed: ${command} ${args[0] ?? ''}. Output withheld because it may contain credentials. Check the affected service privately before retrying.`
		);
	}
}

function has(command) {
	try {
		execFileSync('which', [command], { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

function prompt(label, fallback = '', secret = false) {
	process.stdout.write(`${label}${fallback ? ` [${secret ? 'configured' : fallback}]` : ''}: `);
	if (secret) run('stty', ['-echo'], { stdio: [tty, 'ignore', 'ignore'] });
	const bytes = [];
	try {
		const byte = Buffer.alloc(1);
		while (readSync(tty, byte, 0, 1, null)) {
			if (byte[0] === 10) break;
			bytes.push(byte[0]);
			if (bytes.length > 16384) throw new Error('Input is too long');
		}
	} finally {
		if (secret) {
			run('stty', ['echo'], { stdio: [tty, 'ignore', 'ignore'] });
			process.stdout.write('\n');
		}
	}
	return Buffer.from(bytes).toString('utf8').replace(/\r$/, '') || fallback;
}

function confirm(label) {
	if (prompt(`${label} Type YES to continue`) !== 'YES') throw new Error('Cancelled by operator.');
}

function defaultOrigin(value) {
	try {
		return httpsOrigin(value);
	} catch {
		return '';
	}
}

function privateFile(path, data) {
	if (existsSync(path) && (lstatSync(path).isSymbolicLink() || !lstatSync(path).isFile()))
		throw new Error(`Refusing non-regular managed file: ${path}`);
	writeFileSync(path, data, { mode: 0o600 });
	chmodSync(path, 0o600);
}

function compose(args) {
	return run('docker', [
		'compose',
		'--project-name',
		DEPLOY_PROJECT,
		'--env-file',
		envPath,
		'-f',
		composePath,
		...args
	]);
}

function resourcesExist() {
	return ['container', 'volume', 'network'].some(
		(kind) =>
			run('docker', [
				kind,
				'ls',
				'--filter',
				`label=com.docker.compose.project=${DEPLOY_PROJECT}`,
				'--format',
				kind === 'volume' ? '{{.Name}}' : '{{.ID}}'
			]).length > 0
	);
}

function ensureLocalDocker() {
	const endpoint =
		process.env.DOCKER_HOST ||
		run('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']);
	if (!/^unix:\/\/\/(?:var\/)?run\/docker\.sock$/.test(endpoint))
		throw new Error(
			'Only a local rootful Docker socket is supported; remote Docker contexts are refused'
		);
}

function writeSite(content, origins) {
	assertNginxHostsAvailable(run('nginx', ['-T']), sitePath, origins);
	if (existsSync(sitePath) && !readFileSync(sitePath, 'utf8').startsWith(managedHeader))
		throw new Error('The nginx configuration path belongs to another installation');
	const previous = existsSync(sitePath) ? readFileSync(sitePath, 'utf8') : null;
	privateFile(sitePath, managedHeader + content);
	try {
		run('nginx', ['-t']);
		run('systemctl', ['reload', 'nginx']);
	} catch (error) {
		if (previous === null) unlinkSync(sitePath);
		else privateFile(sitePath, previous);
		throw error;
	}
}

async function backup() {
	console.log(
		'Creating and verifying the local backup before changing services or applying migrations.'
	);
	const sources = {
		database: { container: compose(['ps', '-aq', 'db']), path: '/var/lib/postgresql/data' },
		storage: { container: compose(['ps', '-aq', 'storage']), path: '/var/lib/storage' },
		'database-config': { container: compose(['ps', '-aq', 'db']), path: '/etc/postgresql-custom' }
	};
	privateFile(join(DEPLOY_ROOT, 'backup-sources.json'), JSON.stringify(sources));
	const root = join(DEPLOY_ROOT, 'backups');
	if (existsSync(root) && (lstatSync(root).isSymbolicLink() || !lstatSync(root).isDirectory()))
		throw new Error('Backup destination must be a private directory');
	mkdirSync(root, { recursive: true, mode: 0o700 });
	chmodSync(root, 0o700);
	const before = new Set(readdirSync(root));
	run(
		'bash',
		[
			'scripts/backup-cycle.sh',
			DEPLOY_PROJECT,
			composePath,
			envPath,
			join(DEPLOY_ROOT, 'backup-sources.json'),
			join(DEPLOY_ROOT, 'backup.key'),
			root
		],
		{ env: composeEnvironment(process.env, parseEnv(readFileSync(envPath, 'utf8'))) }
	);
	const created = readdirSync(root).filter(
		(name) => !before.has(name) && /^\d{8}T\d{6}Z$/.test(name)
	);
	if (created.length !== 1) throw new Error('Cannot identify the verified backup directory');
	const configuration = {};
	for (const [key, path] of Object.entries({
		app: appEnvPath,
		supabase: envPath,
		compose: composePath,
		deployment: markerPath,
		nginx: sitePath,
		deleteAccountFunction: join(supabasePath, 'volumes/functions/delete-account/index.ts')
	}))
		if (existsSync(path)) configuration[key] = readFileSync(path, 'utf8');
	const destination = join(root, created[0]);
	const metadata = await encrypt(
		Readable.from([JSON.stringify(configuration)]),
		join(destination, 'configuration.json.enc'),
		readFileSync(join(DEPLOY_ROOT, 'backup.key'))
	);
	privateFile(join(destination, 'configuration.crypto.json'), JSON.stringify(metadata));
	const verified = [];
	await decrypt(
		createReadStream(join(destination, 'configuration.json.enc')),
		new Writable({
			write(chunk, _encoding, callback) {
				verified.push(chunk);
				callback();
			}
		}),
		readFileSync(join(DEPLOY_ROOT, 'backup.key')),
		metadata
	);
	if (Buffer.concat(verified).toString('utf8') !== JSON.stringify(configuration))
		throw new Error('Backup configuration verification failed');
}

function installBackupTimer() {
	const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
	const launcher = join(DEPLOY_ROOT, 'backup.sh');
	privateFile(
		launcher,
		`#!/usr/bin/env bash\nset -Eeuo pipefail\numask 077\nexec 9>/run/lock/myfamily-guided-deploy.lock\nflock -n 9 || exit 0\ncd -- ${quote(repository)}\nexec node scripts/deploy-guided.mjs --backup\n`
	);
	privateFile(
		'/etc/systemd/system/myfamily-guided-backup.service',
		`[Unit]\nDescription=MyFamily local encrypted backup\nRequires=docker.service\nAfter=docker.service\n[Service]\nType=oneshot\nExecStart=/bin/bash ${launcher}\nUMask=0077\n`
	);
	privateFile(
		'/etc/systemd/system/myfamily-guided-backup.timer',
		'[Unit]\nDescription=MyFamily daily local backup\n[Timer]\nOnCalendar=*-*-* 03:30:00\nRandomizedDelaySec=15m\nPersistent=true\n[Install]\nWantedBy=timers.target\n'
	);
	run('systemctl', ['daemon-reload']);
	run('systemctl', ['enable', '--now', 'myfamily-guided-backup.timer']);
}

async function main() {
	if (
		process.platform !== 'linux' ||
		process.getuid?.() !== 0 ||
		Number(process.versions.node.split('.')[0]) !== 24
	)
		throw new Error('This command requires Linux, sudo and Node.js 24');
	process.umask(0o077);
	if (process.argv[2] === '--backup') {
		if (!existsSync(markerPath)) throw new Error('Missing deployment ownership marker');
		ensureLocalDocker();
		await backup();
		return;
	}
	if (!process.stdin.isTTY) throw new Error('An interactive terminal is required');
	tty = openSync('/dev/tty', 'r');
	const source = resolve(repository, process.argv[2] ?? '.env');
	const input = existsSync(source) ? parseEnv(readFileSync(source, 'utf8')) : {};
	console.log(`Environment file: ${source}. Contents are parsed as data; credentials are hidden.`);
	const publicKeys = new Set([
		'ORIGIN',
		'PUBLIC_SITE_URL',
		'VITE_SUPABASE_URL',
		'SUPABASE_PROJECT_URL',
		'PUBLIC_SUPABASE_URL',
		'GOOGLE_CALENDAR_ORIGIN',
		'MICROSOFT_CALENDAR_ORIGIN',
		'ACME_EMAIL'
	]);
	for (const [key, value] of Object.entries(input)) {
		let visible = value ? '[configured, hidden]' : '[empty]';
		if (publicKeys.has(key) && value) {
			try {
				if (key === 'ACME_EMAIL') visible = validEmail(value);
				else {
					const url = new URL(value);
					if (
						!url.username &&
						!url.password &&
						!url.search &&
						!url.hash &&
						['https:', 'http:'].includes(url.protocol)
					)
						visible = url.origin;
				}
			} catch {
				visible = '[configured, hidden]';
			}
		}
		console.log(`${key}: ${visible}`);
	}
	confirm('Use this environment file as the application configuration?');
	const app = httpsOrigin(prompt('Application HTTPS URL', defaultOrigin(input.ORIGIN)));
	const api = httpsOrigin(
		prompt('Supabase HTTPS URL (a separate domain)', defaultOrigin(input.VITE_SUPABASE_URL))
	);
	if (app === api) throw new Error('Use different application and Supabase domains');
	const email = validEmail(
		prompt(
			'ACME certificate contact email',
			input.ACME_EMAIL ? validEmail(input.ACME_EMAIL) : 'danieltamargosaiz@gmail.com'
		)
	);
	const ownership = existsSync(markerPath) ? JSON.parse(readFileSync(markerPath, 'utf8')) : null;
	const existing = ownership && existsSync(envPath) ? ownership : null;
	if (
		ownership &&
		(ownership.repository !== repository ||
			ownership.project !== DEPLOY_PROJECT ||
			ownership.revision !== SUPABASE_REVISION ||
			ownership.app !== app ||
			ownership.api !== api)
	)
		throw new Error(
			'Existing installation differs from this checkout/domains/revision. Review the recovery guide before changing it.'
		);
	const previousEnv = existing ? parseEnv(readFileSync(envPath, 'utf8')) : {};
	const smtpHost = prompt('SMTP host', previousEnv.SMTP_HOST || input.SMTP_HOST || '');
	if (!/^[A-Za-z0-9.-]+$/.test(smtpHost)) throw new Error('Invalid SMTP host');
	const smtpPort = prompt(
		'SMTP port (STARTTLS)',
		previousEnv.SMTP_PORT || input.SMTP_PORT || '587'
	);
	if (!/^\d{1,5}$/.test(smtpPort) || Number(smtpPort) < 1 || Number(smtpPort) > 65535)
		throw new Error('Invalid SMTP port');
	const smtpUser = prompt('SMTP username', previousEnv.SMTP_USER || input.SMTP_USER || '', true);
	const smtpPassword = prompt(
		'SMTP password',
		previousEnv.SMTP_PASS || input.SMTP_PASS || '',
		true
	);
	const smtpEmail = validEmail(
		prompt(
			'Verified SMTP sender email',
			previousEnv.SMTP_ADMIN_EMAIL || input.SMTP_ADMIN_EMAIL || email
		)
	);
	if (!smtpUser || !smtpPassword)
		throw new Error('Authenticated SMTP is required for invitations and password recovery');
	const adminEmail = existing?.adminEmail || validEmail(prompt('Initial superadministrator email'));
	console.log(
		`Application: ${app}\nSupabase API: ${api}\nACME contact: ${email}\nMode: ${existing ? 'update/resume, backup required' : 'fresh isolated installation'}\nState and backups: ${DEPLOY_ROOT}`
	);
	confirm(
		'Both domains resolve to this VPS, TCP 80/443 are reachable, and these URLs are correct?'
	);
	confirm(
		"Allow nginx configuration, certificate requests/renewal and a daily local backup timer? You accept the current Let's Encrypt Subscriber Agreement at https://letsencrypt.org/repository/ ?"
	);
	if (!has('docker') || !has('systemctl') || !has('ss'))
		throw new Error('Install Docker Engine with Compose >= 2.30, systemd and iproute2 first');
	for (const port of [80, 443]) {
		const listener = run('ss', ['-H', '-ltnp', `sport = :${port}`]);
		if (listener && listener.split('\n').some((line) => !line.includes('"nginx"')))
			throw new Error(`TCP ${port} is owned by another service. This installer will not stop it.`);
	}
	const missing = ['nginx', 'certbot', 'git', 'curl', 'openssl'].filter((command) => !has(command));
	if (missing.length) {
		if (!has('apt-get')) throw new Error(`Install these packages first: ${missing.join(', ')}`);
		confirm(`Install these host packages with apt-get: ${missing.join(', ')}?`);
		run('apt-get', ['update']);
		run('apt-get', ['install', '-y', ...missing]);
	}
	assertNginxHostsAvailable(run('nginx', ['-T']), sitePath, [app, api]);
	const version = run('docker', ['compose', 'version', '--short'])
		.replace(/^v/, '')
		.split('.')
		.map(Number);
	if (version[0] < 2 || (version[0] === 2 && version[1] < 30))
		throw new Error('Docker Compose >= 2.30 is required');
	ensureLocalDocker();
	run('docker', ['info', '--format', '{{.ServerVersion}}']);
	if (!existing) {
		if (
			!ownership &&
			[
				'/etc/letsencrypt/renewal/myfamily-guided.conf',
				'/etc/systemd/system/myfamily-guided-backup.service',
				'/etc/systemd/system/myfamily-guided-backup.timer',
				'/etc/letsencrypt/renewal-hooks/deploy/myfamily-guided'
			].some(existsSync)
		)
			throw new Error(
				'A managed certificate or timer path is already in use; existing services will not be replaced'
			);
		if ((!ownership && existsSync(DEPLOY_ROOT)) || existsSync(sitePath) || resourcesExist())
			throw new Error(
				'Fresh installation requires unused state/configuration paths and Docker project. Existing resources will not be adopted.'
			);
		const volumes = run('docker', ['volume', 'ls', '--format', '{{.Name}}']).split('\n');
		const networks = run('docker', ['network', 'ls', '--format', '{{.Name}}']).split('\n');
		if ([...volumes, ...networks].some((name) => name.startsWith(`${DEPLOY_PROJECT}_`)))
			throw new Error('Unowned Docker resource name conflicts with this deployment');
		for (const port of [3000, 8000])
			if (run('ss', ['-H', '-ltn', `sport = :${port}`]))
				throw new Error(`TCP ${port} is in use. Resolve this conflict first.`);
	}
	if (!existing) {
		if (!ownership) mkdirSync(DEPLOY_ROOT, { mode: 0o700 });
		privateFile(
			markerPath,
			JSON.stringify({
				repository,
				project: DEPLOY_PROJECT,
				revision: SUPABASE_REVISION,
				app,
				api,
				adminEmail,
				status: 'preparing'
			})
		);
		if (!existsSync(join(DEPLOY_ROOT, 'backup.key')))
			privateFile(join(DEPLOY_ROOT, 'backup.key'), randomBytes(48));
		console.log('Fetching the pinned official Supabase configuration.');
		const checkout = join(DEPLOY_ROOT, 'upstream');
		run('git', ['init', '--quiet', checkout]);
		if (!ownership)
			run('git', [
				'-C',
				checkout,
				'remote',
				'add',
				'origin',
				'https://github.com/supabase/supabase.git'
			]);
		else if (
			run('git', ['-C', checkout, 'remote', 'get-url', 'origin']) !==
			'https://github.com/supabase/supabase.git'
		)
			throw new Error('Unexpected Supabase checkout remote');
		run('git', [
			'-C',
			checkout,
			'fetch',
			'--filter=blob:none',
			'--depth',
			'1',
			'origin',
			SUPABASE_REVISION
		]);
		run('git', ['-C', checkout, 'sparse-checkout', 'init', '--cone']);
		run('git', ['-C', checkout, 'sparse-checkout', 'set', 'docker']);
		run('git', ['-C', checkout, 'checkout', '--detach', '--quiet', 'FETCH_HEAD']);
		if (run('git', ['-C', checkout, 'rev-parse', 'HEAD']) !== SUPABASE_REVISION)
			throw new Error('Supabase revision verification failed');
		mkdirSync(supabasePath, { recursive: true, mode: 0o700 });
		run('cp', ['-a', `${join(checkout, 'docker')}/.`, supabasePath]);
	}
	const options = { app, api, smtpHost, smtpPort, smtpUser, smtpPassword, smtpEmail };
	const supabaseEnv = existing
		? {
				...previousEnv,
				SMTP_HOST: smtpHost,
				SMTP_PORT: smtpPort,
				SMTP_USER: smtpUser,
				SMTP_PASS: smtpPassword,
				SMTP_ADMIN_EMAIL: smtpEmail
			}
		: generateSupabaseEnv(readFileSync(join(supabasePath, '.env.example'), 'utf8'), options);
	const appEnv = {
		...input,
		ORIGIN: app,
		PUBLIC_SITE_URL: app,
		VITE_SUPABASE_URL: api,
		PUBLIC_SUPABASE_URL: api,
		SUPABASE_PROJECT_URL: api,
		VITE_SUPABASE_ANON_KEY: supabaseEnv.ANON_KEY,
		SUPABASE_SECRET_KEY: supabaseEnv.SERVICE_ROLE_KEY
	};
	if (existing)
		appEnv.SUPER_ADMIN_USER_IDS =
			parseEnv(readFileSync(appEnvPath, 'utf8')).SUPER_ADMIN_USER_IDS || '';
	const combinedEnv = {
		...supabaseEnv,
		ORIGIN: app,
		VITE_SUPABASE_URL: api,
		VITE_SUPABASE_ANON_KEY: supabaseEnv.ANON_KEY,
		APP_IMAGE: `myfamily-guided:build-${Date.now()}`,
		APP_ENV_FILE: appEnvPath
	};
	// Check serialization before stopping services or writing live configuration.
	const serializedEnv = serializeEnv(combinedEnv);
	const serializedApp = serializeEnv(appEnv, true);
	const candidateEnv = join(DEPLOY_ROOT, 'candidate.env');
	privateFile(candidateEnv, serializedEnv);
	const normalize = (file) =>
		JSON.parse(
			run('docker', [
				'compose',
				'--project-name',
				DEPLOY_PROJECT,
				'--env-file',
				candidateEnv,
				'-f',
				file,
				'config',
				'--no-interpolate',
				'--no-env-resolution',
				'--format',
				'json'
			])
		);
	if (!existing) privateFile(appEnvPath, serializedApp);
	const config = isolateCompose(
		normalize(join(supabasePath, 'docker-compose.yml')),
		normalize(join(repository, 'compose.guided.yaml'))
	);
	const gatewayTemplatePath = join(supabasePath, 'volumes/api/envoy/lds.template.yaml');
	const gatewayTemplate = redactGatewayAccessLog(readFileSync(gatewayTemplatePath, 'utf8'));
	const nextCompose = join(DEPLOY_ROOT, 'candidate.json');
	privateFile(nextCompose, JSON.stringify(config, null, 2));
	const next = (args) =>
		run('docker', [
			'compose',
			'--project-name',
			DEPLOY_PROJECT,
			'--env-file',
			candidateEnv,
			'-f',
			nextCompose,
			...args
		]);
	next(['config', '--quiet']);
	console.log(
		'Building the application and pulling pinned Supabase images. This may take several minutes.'
	);
	next(['build', 'app']);
	next(['pull', '--ignore-buildable']);
	if (existing) {
		await backup();
		compose(['stop', 'app']);
	}
	renameSync(candidateEnv, envPath);
	renameSync(nextCompose, composePath);
	privateFile(appEnvPath, serializedApp);
	writeFileSync(gatewayTemplatePath, gatewayTemplate, { encoding: 'utf8' });
	// Keep the Edge Function entrypoint supplied by Supabase; add this project's function beside it.
	mkdirSync(join(supabasePath, 'volumes/functions/delete-account'), {
		recursive: true,
		mode: 0o700
	});
	copyFileSync(
		join(repository, 'supabase/functions/delete-account/index.ts'),
		join(supabasePath, 'volumes/functions/delete-account/index.ts')
	);
	console.log('Starting Supabase and applying checked, transactional project migrations.');
	compose([
		'up',
		'-d',
		'--wait',
		'--wait-timeout',
		'600',
		...Object.keys(config.services).filter((name) => !['app', 'clamav'].includes(name))
	]);
	const migrations = readdirSync(join(repository, 'supabase/migrations'))
		.filter((name) => name.endsWith('.sql'))
		.map((name) => ({
			name,
			sql: readFileSync(join(repository, 'supabase/migrations', name), 'utf8')
		}));
	composeWithSql(migrationSql(migrations));
	run('systemctl', ['enable', '--now', 'nginx']);
	if (!existsSync('/etc/letsencrypt/live/myfamily-guided/fullchain.pem')) {
		chmodSync(DEPLOY_ROOT, 0o711);
		for (const path of ['acme', 'acme/.well-known', 'acme/.well-known/acme-challenge']) {
			mkdirSync(join(DEPLOY_ROOT, path), { recursive: true, mode: 0o755 });
			chmodSync(join(DEPLOY_ROOT, path), 0o755);
		}
		writeSite(nginxConfig(app, api), [app, api]);
		run('certbot', [
			'certonly',
			'--webroot',
			'-w',
			join(DEPLOY_ROOT, 'acme'),
			'--cert-name',
			'myfamily-guided',
			'-d',
			new URL(app).hostname,
			'-d',
			new URL(api).hostname,
			'--email',
			email,
			'--agree-tos',
			'--non-interactive'
		]);
	}
	writeSite(nginxConfig(app, api, true), [app, api]);
	const renewalHook = '/etc/letsencrypt/renewal-hooks/deploy/myfamily-guided';
	mkdirSync(dirname(renewalHook), { recursive: true, mode: 0o755 });
	privateFile(
		renewalHook,
		'#!/bin/sh\nset -eu\nif [ "${RENEWED_LINEAGE:-}" = /etc/letsencrypt/live/myfamily-guided ]; then nginx -t && systemctl reload nginx; fi\n'
	);
	chmodSync(renewalHook, 0o700);
	run('systemctl', ['enable', '--now', 'certbot.timer']);
	if (!existing || !appEnv.SUPER_ADMIN_USER_IDS)
		run('docker', [
			'run',
			'--rm',
			'--user',
			'0',
			'--network',
			'host',
			'--read-only',
			'--cap-drop',
			'ALL',
			'--security-opt',
			'no-new-privileges:true',
			'--mount',
			`type=bind,src=${join(repository, 'scripts/bootstrap-admin.mjs')},dst=/app/scripts/bootstrap-admin.mjs,readonly`,
			'--mount',
			`type=bind,src=${appEnvPath},dst=/private/app.env`,
			'--entrypoint',
			'node',
			combinedEnv.APP_IMAGE,
			'/app/scripts/bootstrap-admin.mjs',
			'/private/app.env',
			adminEmail
		]);
	compose(['up', '-d', '--wait', '--wait-timeout', '900', 'app']);
	run('curl', [
		'--fail',
		'--silent',
		'--show-error',
		'--max-time',
		'20',
		'--header',
		`apikey: ${supabaseEnv.ANON_KEY}`,
		`${api}/auth/v1/health`
	]);
	run('curl', ['--fail', '--silent', '--show-error', '--max-time', '20', `${app}/login`]);
	installBackupTimer();
	privateFile(
		markerPath,
		JSON.stringify({
			repository,
			project: DEPLOY_PROJECT,
			revision: SUPABASE_REVISION,
			app,
			api,
			adminEmail,
			status: 'ready'
		})
	);
	console.log(
		`Deployment verified: ${app}. Backups stay on this VPS at ${DEPLOY_ROOT}/backups. Initial administrators must configure two-factor authentication before using administration.`
	);
}

function composeWithSql(sql) {
	run(
		'docker',
		[
			'compose',
			'--project-name',
			DEPLOY_PROJECT,
			'--env-file',
			envPath,
			'-f',
			composePath,
			'exec',
			'-T',
			'db',
			'psql',
			'-X',
			'-q',
			'-v',
			'ON_ERROR_STOP=1',
			'-U',
			'postgres',
			'-d',
			'postgres'
		],
		{ input: sql }
	);
}

main()
	.catch((error) => {
		console.error(error.message);
		process.exitCode = 1;
	})
	.finally(() => {
		if (tty !== undefined) closeSync(tty);
	});
