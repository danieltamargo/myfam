import { execFileSync } from 'node:child_process';
import { randomBytes, createHmac, createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const images = {
	db: 'public.ecr.aws/supabase/postgres:17.6.1.071',
	auth: 'public.ecr.aws/supabase/gotrue:v2.185.0',
	rest: 'public.ecr.aws/supabase/postgrest:v14.3',
	storage: 'supabase/storage-api:v1.84.32',
	realtime: 'public.ecr.aws/supabase/realtime:v2.69.2',
	kong: 'public.ecr.aws/supabase/kong:2.8.1'
};
const command = process.argv[2];
if (!['setup', 'restore', 'verify'].includes(command) || !process.argv[3]) {
	console.error(
		'Usage: node scripts/test-supabase-recovery.mjs setup|restore|verify OUTPUT_DIRECTORY'
	);
	process.exit(1);
}
const directory = resolve(process.argv[3]);
mkdirSync(directory, { recursive: true });
const statePath = join(directory, 'fixture-secrets.json');
let state;
const docker = (args, input) => {
	try {
		return execFileSync('docker', args, {
			encoding: 'utf8',
			input,
			maxBuffer: 8 * 1024 * 1024,
			stdio: ['pipe', 'pipe', 'pipe']
		}).trim();
	} catch (error) {
		writeFileSync(
			join(directory, 'last-error.log'),
			`Docker operation ${args[0]} failed with exit ${error.status}\n`,
			{ mode: 0o600 }
		);
		throw new Error(`Docker ${args[0]} failed; diagnostic saved privately`);
	}
};
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2), { mode: 0o600 });
function validateState() {
	assert.match(state.prefix, /^myfamily-ops-20261101-restore-[a-f0-9]{8}$/);
	const suffix = state.prefix.slice(-8);
	assert.equal(state.network, `${state.prefix}-net`);
	assert(
		new RegExp(`^myfamily-recovery-ops20261101${suffix}(?:-r[1-9][0-9]?)?$`).test(
			state.recoveryPrefix
		)
	);
	if (state.backupPath) assert(new RegExp(`^backup-[0-9]+$`).test(state.backupPath));
	assert.equal(state.url, 'http://127.0.0.1:55331');
	const existing = docker(['ps', '-a', '--format', '{{.Names}}'])
		.split('\n')
		.filter((entry) => entry.startsWith(`${state.prefix}-`));
	for (const container of existing) {
		assert.equal(
			docker(['inspect', '--format', '{{index .Config.Labels "myfamily.ops"}}', container]),
			'20261101',
			'Container ownership label'
		);
	}
	for (const network of [state.network, `${state.network}-gateway`]) {
		assert.equal(
			docker(['network', 'inspect', '--format', '{{index .Labels "myfamily.ops"}}', network]),
			'20261101',
			'Network ownership label'
		);
	}
	if (state.physicalRestored) {
		for (const kind of ['database', 'storage', 'database-config']) {
			const volume = `${state.recoveryPrefix}-${kind}`;
			assert.equal(
				docker(['volume', 'inspect', '--format', '{{.Name}}', volume]),
				volume,
				'Recovered volume must already exist'
			);
		}
	}
	if (state.physicalRestored && !state.sourceRemovalPending) {
		for (const [service, kind, destination] of [
			['db', 'database', '/var/lib/postgresql/data'],
			['db', 'database-config', '/etc/postgresql-custom'],
			['storage', 'storage', '/var/lib/storage']
		]) {
			if (!existing.includes(name(service))) continue;
			const mounts = JSON.parse(docker(['inspect', '--format', '{{json .Mounts}}', name(service)]));
			assert.equal(
				mounts.find((mount) => mount.Destination === destination)?.Name,
				`${state.recoveryPrefix}-${kind}`,
				'Recovered service volume binding'
			);
		}
	}
}
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const name = (service) => `${state.prefix}-${service}`;
const sql = (query) =>
	docker(
		[
			'exec',
			'-i',
			name('db'),
			'sh',
			'-c',
			'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -At'
		],
		query
	);
const jwt = (role) => {
	const payload = Buffer.from(
		JSON.stringify({
			role,
			iss: 'supabase',
			iat: Math.floor(Date.now() / 1000),
			exp: Math.floor(Date.now() / 1000) + 604800
		})
	).toString('base64url');
	const head = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url');
	return `${head}.${payload}.${createHmac('sha256', state.jwtSecret).update(`${head}.${payload}`).digest('base64url')}`;
};
async function waitFor(check, label) {
	for (let attempt = 0; attempt < 150; attempt++) {
		try {
			if (await check()) return;
		} catch {
			// Services can be temporarily unreachable while their dependencies start.
		}
		await sleep(1000);
	}
	throw new Error(`${label} did not become ready`);
}
function start(service, env, options = [], args = []) {
	if (docker(['ps', '-a', '--format', '{{.Names}}']).split('\n').includes(name(service))) return;
	const envFile = join(directory, `${service}.env`);
	writeFileSync(
		envFile,
		Object.entries(env)
			.map(([key, value]) => `${key}=${value}`)
			.join('\n') + '\n',
		{ mode: 0o600 }
	);
	const limits = {
		db: ['1', '1g'],
		auth: ['.5', '256m'],
		rest: ['.5', '256m'],
		storage: ['1', '512m'],
		realtime: ['1', '512m'],
		kong: ['.5', '256m']
	}[service];
	docker([
		'run',
		'-d',
		'--name',
		name(service),
		'--label',
		'myfamily.ops=20261101',
		'--restart',
		'unless-stopped',
		'--cpus',
		limits[0],
		'--memory',
		limits[1],
		'--network',
		service === 'kong' ? `${state.network}-gateway` : state.network,
		'--network-alias',
		service,
		...(service === 'realtime' ? ['--network-alias', 'realtime-dev'] : []),
		'--env-file',
		envFile,
		...options,
		images[service],
		...args
	]);
	if (service === 'kong') docker(['network', 'connect', state.network, name(service)]);
}
async function request(path, token = state.anonKey, options = {}) {
	const response = await fetch(state.url + path, {
		...options,
		headers: { apikey: state.anonKey, Authorization: `Bearer ${token}`, ...options.headers },
		signal: AbortSignal.timeout(15000)
	});
	if (!response.ok) {
		throw new Error(`API ${path.split('?')[0]} returned ${response.status}`);
	}
	if (response.status === 204) return null;
	return response.json();
}
const post = (path, body, token, headers = {}) =>
	request(path, token, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...headers },
		body: JSON.stringify(body)
	});
async function startDatabase(volumePrefix) {
	start(
		'db',
		{
			POSTGRES_PASSWORD: state.dbPassword,
			POSTGRES_DB: 'postgres',
			JWT_SECRET: state.jwtSecret,
			JWT_EXP: '3600'
		},
		[
			'--mount',
			`type=volume,src=${volumePrefix}-database,dst=/var/lib/postgresql/data`,
			'--mount',
			`type=volume,src=${volumePrefix}-database-config,dst=/etc/postgresql-custom`
		],
		[
			'postgres',
			'-c',
			'config_file=/etc/postgresql/postgresql.conf',
			'-c',
			'listen_addresses=*',
			'-c',
			'wal_level=logical',
			'-c',
			'max_replication_slots=10',
			'-c',
			'max_wal_senders=10'
		]
	);
	await waitFor(
		() =>
			docker(['exec', name('db'), 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']).includes(
				'accepting connections'
			),
		'database'
	);
	await waitFor(
		() => sql("select 1 from pg_roles where rolname = 'authenticator';") === '1',
		'database initialization'
	);
}
async function startServices(volumePrefix) {
	const dbUrl = (user) => `postgres://${user}:${state.dbPassword}@db:5432/postgres`;
	start('auth', {
		GOTRUE_API_HOST: '0.0.0.0',
		GOTRUE_API_PORT: '9999',
		API_EXTERNAL_URL: state.url,
		GOTRUE_DB_DRIVER: 'postgres',
		GOTRUE_DB_DATABASE_URL: dbUrl('supabase_auth_admin'),
		GOTRUE_SITE_URL: 'http://127.0.0.1:55330',
		GOTRUE_JWT_ADMIN_ROLES: 'service_role',
		GOTRUE_JWT_AUD: 'authenticated',
		GOTRUE_JWT_DEFAULT_GROUP_NAME: 'authenticated',
		GOTRUE_JWT_EXP: '3600',
		GOTRUE_JWT_SECRET: state.jwtSecret,
		GOTRUE_EXTERNAL_EMAIL_ENABLED: 'true',
		GOTRUE_MAILER_AUTOCONFIRM: 'true',
		GOTRUE_DISABLE_SIGNUP: 'false',
		GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED: 'true',
		GOTRUE_RATE_LIMIT_EMAIL_SENT: '20',
		GOTRUE_RATE_LIMIT_TOKEN_REFRESH: '60',
		GOTRUE_RATE_LIMIT_SIGN_IN_SIGN_UP: '30'
	});
	start('rest', {
		PGRST_DB_URI: dbUrl('authenticator'),
		PGRST_DB_SCHEMAS: 'public',
		PGRST_DB_ANON_ROLE: 'anon',
		PGRST_JWT_SECRET: state.jwtSecret
	});
	start(
		'storage',
		{
			ANON_KEY: state.anonKey,
			SERVICE_KEY: state.serviceRoleKey,
			POSTGREST_URL: 'http://rest:3000',
			AUTH_JWT_SECRET: state.jwtSecret,
			DATABASE_URL: dbUrl('supabase_storage_admin'),
			FILE_SIZE_LIMIT: '10485760',
			STORAGE_BACKEND: 'file',
			FILE_STORAGE_BACKEND_PATH: '/var/lib/storage',
			TENANT_ID: 'recovery',
			REGION: 'local',
			GLOBAL_S3_BUCKET: 'recovery',
			ENABLE_IMAGE_TRANSFORMATION: 'false'
		},
		['--mount', `type=volume,src=${volumePrefix}-storage,dst=/var/lib/storage`]
	);
	start('realtime', {
		PORT: '4000',
		DB_HOST: 'db',
		DB_PORT: '5432',
		DB_USER: 'supabase_admin',
		DB_PASSWORD: state.dbPassword,
		DB_NAME: 'postgres',
		DB_AFTER_CONNECT_QUERY: 'SET search_path TO _realtime',
		DB_ENC_KEY: state.realtimeDbKey,
		API_JWT_SECRET: state.jwtSecret,
		SECRET_KEY_BASE: state.realtimeSecret,
		ERL_AFLAGS: '-proto_dist inet_tcp +S 1:1',
		DNS_NODES: "''",
		RLIMIT_NOFILE: '10000',
		APP_NAME: 'realtime',
		SEED_SELF_HOST: 'true',
		RUN_JANITOR: 'true',
		SELF_HOST_TENANT_NAME: 'realtime-dev'
	});
	const routes = {
		_format_version: '2.1',
		services: [
			{
				name: 'auth',
				url: 'http://auth:9999',
				routes: [{ name: 'auth', paths: ['/auth/v1/'], strip_path: true }]
			},
			{
				name: 'rest',
				url: 'http://rest:3000',
				routes: [{ name: 'rest', paths: ['/rest/v1/'], strip_path: true }]
			},
			{
				name: 'storage',
				url: 'http://storage:5000',
				routes: [{ name: 'storage', paths: ['/storage/v1/'], strip_path: true }]
			},
			{
				name: 'realtime',
				url: 'http://realtime-dev:4000/socket',
				routes: [{ name: 'realtime', paths: ['/realtime/v1/'], strip_path: true }]
			}
		]
	};
	const gatewayFile = join(directory, 'kong.json');
	writeFileSync(gatewayFile, JSON.stringify(routes));
	start(
		'kong',
		{
			KONG_DATABASE: 'off',
			KONG_DECLARATIVE_CONFIG: '/config/kong.json',
			KONG_PROXY_LISTEN: '0.0.0.0:8000',
			KONG_ADMIN_LISTEN: 'off',
			KONG_DNS_ORDER: 'LAST,A,CNAME',
			KONG_NGINX_WORKER_PROCESSES: '1'
		},
		[
			'-p',
			'127.0.0.1:55331:8000',
			'--mount',
			`type=bind,src=${gatewayFile},dst=/config/kong.json,readonly`
		]
	);
	await waitFor(async () => (await fetch(state.url + '/auth/v1/health')).ok, 'Auth');
	await waitFor(async () => (await fetch(state.url + '/storage/v1/status')).ok, 'Storage');
	await waitFor(
		async () =>
			(
				await fetch(state.url + '/rest/v1/', {
					headers: { Authorization: `Bearer ${state.serviceRoleKey}` }
				})
			).ok,
		'REST'
	);
}
async function setup() {
	try {
		state = JSON.parse(readFileSync(statePath, 'utf8'));
		validateState();
	} catch (error) {
		if (error.code !== 'ENOENT') throw error;
	}
	if (!state) {
		const suffix = randomBytes(4).toString('hex');
		state = {
			prefix: `myfamily-ops-20261101-restore-${suffix}`,
			network: `myfamily-ops-20261101-restore-${suffix}-net`,
			recoveryPrefix: `myfamily-recovery-ops20261101${suffix}`,
			url: 'http://127.0.0.1:55331',
			dbPassword: randomBytes(32).toString('hex'),
			jwtSecret: randomBytes(48).toString('hex'),
			realtimeDbKey: randomBytes(8).toString('hex'),
			realtimeSecret: randomBytes(48).toString('hex'),
			users: []
		};
		state.anonKey = jwt('anon');
		state.serviceRoleKey = jwt('service_role');
		save();
		docker(['network', 'create', '--internal', '--label', 'myfamily.ops=20261101', state.network]);
		docker(['network', 'create', '--label', 'myfamily.ops=20261101', `${state.network}-gateway`]);
		for (const kind of ['database', 'database-config', 'storage'])
			docker(['volume', 'create', `${state.prefix}-${kind}`]);
	}
	await startDatabase(state.prefix);
	sql(
		`alter role authenticator password '${state.dbPassword}'; alter role supabase_auth_admin password '${state.dbPassword}'; alter role supabase_storage_admin password '${state.dbPassword}'; alter role supabase_admin password '${state.dbPassword}'; create schema if not exists _realtime; alter schema _realtime owner to supabase_admin;`
	);
	await startServices(state.prefix);
	const migrations = readdirSync('supabase/migrations')
		.filter((file) => file.endsWith('.sql'))
		.sort();
	for (const migration of migrations.slice(state.migrations || 0)) {
		try {
			sql(readFileSync(join('supabase/migrations', migration), 'utf8'));
		} catch {
			throw new Error(`Migration failed: ${migration}; inspect private diagnostic`);
		}
		state.migrations = (state.migrations || 0) + 1;
		save();
	}
	state.migrations = migrations.length;
	sql("notify pgrst, 'reload schema';");
	await sleep(1500);
	for (let index = 0; index < 11; index++) {
		let user = state.users[index];
		if (user?.giftId || (index === 10 && user?.id)) continue;
		user ||= {
			email: `synthetic-ops-${index}@example.invalid`,
			password: randomBytes(18).toString('hex')
		};
		const existing = (await request('/auth/v1/admin/users', state.serviceRoleKey)).users.find(
			(entry) => entry.email === user.email
		);
		const created = existing
			? await request(`/auth/v1/admin/users/${existing.id}`, state.serviceRoleKey, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ password: user.password })
				})
			: await post(
					'/auth/v1/admin/users',
					{
						email: user.email,
						password: user.password,
						email_confirm: true,
						user_metadata: { name: `Prueba operativa ${index}` }
					},
					state.serviceRoleKey
				);
		user.id = created.id;
		state.users[index] = user;
		save();
		const session = await post('/auth/v1/token?grant_type=password', {
			email: user.email,
			password: user.password
		});
		user.accessToken = session.access_token;
		user.refreshToken = session.refresh_token;
		if (index < 10) {
			const families = await request('/rest/v1/families?select=id', user.accessToken);
			user.familyId =
				families[0]?.id ||
				(await post(
					'/rest/v1/rpc/create_family',
					{ p_name: `Familia sintética ${index}` },
					user.accessToken
				));
			save();
			user.listId ||= await post(
				'/rest/v1/rpc/create_family_list',
				{
					p_family_id: user.familyId,
					p_title: 'Lista de recuperación',
					p_description: '',
					p_visibility: 'family',
					p_member_ids: []
				},
				user.accessToken
			);
			save();
			user.listItemId ||= await post(
				'/rest/v1/rpc/add_family_list_item',
				{ p_list_id: user.listId, p_title: 'Elemento sintético', p_quantity: 1, p_unit: '' },
				user.accessToken
			);
			save();
			const [gift] = await post(
				'/rest/v1/gift_items',
				{
					family_id: user.familyId,
					owner_id: user.id,
					name: 'Regalo sintético',
					desired_quantity: 1
				},
				user.accessToken,
				{ Prefer: 'return=representation' }
			);
			user.giftId = gift.id;
		}
		save();
	}
	if (state.seeded) {
		await verifyApis();
		return;
	}
	await post(
		'/storage/v1/bucket',
		{ id: 'ops-recovery', name: 'ops-recovery', public: false },
		state.serviceRoleKey
	);
	sql(
		`create policy ops_recovery_object_access on storage.objects for all to authenticated using (bucket_id='ops-recovery' and (storage.foldername(name))[1] = (select auth.uid())::text) with check (bucket_id='ops-recovery' and (storage.foldername(name))[1] = (select auth.uid())::text);`
	);
	state.objectPath = `${state.users[0].id}/fixture.bin`;
	const bytes = randomBytes(256 * 1024);
	state.objectSha256 = createHash('sha256').update(bytes).digest('hex');
	const uploaded = await fetch(`${state.url}/storage/v1/object/ops-recovery/${state.objectPath}`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${state.users[0].accessToken}`,
			'Content-Type': 'application/octet-stream'
		},
		body: bytes
	});
	assert.equal(uploaded.ok, true, `Storage upload ${uploaded.status}`);
	state.vaultSecret = randomBytes(32).toString('hex');
	sql(
		`create extension if not exists supabase_vault cascade; select vault.create_secret('${state.vaultSecret}', 'ops-recovery');`
	);
	state.seeded = true;
	save();
	await verifyApis();
	console.log(`Synthetic full stack ready: ${statePath}`);
}
async function verifyApis() {
	for (const user of state.users) {
		const login = await post('/auth/v1/token?grant_type=password', {
			email: user.email,
			password: user.password
		});
		assert.equal(login.user.id, user.id);
		const refresh = await post('/auth/v1/token?grant_type=refresh_token', {
			refresh_token: user.refreshToken
		});
		assert.equal(refresh.user.id, user.id);
		user.refreshToken = refresh.refresh_token;
		user.accessToken = refresh.access_token;
		save();
		if (user.familyId) {
			const families = await request('/rest/v1/families?select=id', user.accessToken);
			assert.deepEqual(
				families.map((family) => family.id),
				[user.familyId]
			);
			assert.equal(
				(
					await request(
						`/rest/v1/family_list_items?id=eq.${user.listItemId}&select=id`,
						user.accessToken
					)
				).length,
				1
			);
			assert.equal(
				(await request(`/rest/v1/gift_items?id=eq.${user.giftId}&select=id`, user.accessToken))
					.length,
				1
			);
		}
	}
	const outsider = state.users.at(-1);
	assert.deepEqual(await request('/rest/v1/families?select=id', outsider.accessToken), []);
	assert.deepEqual(await request('/rest/v1/family_lists?select=id', outsider.accessToken), []);
	assert.deepEqual(await request('/rest/v1/gift_items?select=id', outsider.accessToken), []);
	const response = await fetch(
		`${state.url}/storage/v1/object/authenticated/ops-recovery/${state.objectPath}`,
		{ headers: { Authorization: `Bearer ${state.users[0].accessToken}` } }
	);
	assert.equal(response.ok, true, `Storage download ${response.status}`);
	assert.equal(
		createHash('sha256')
			.update(Buffer.from(await response.arrayBuffer()))
			.digest('hex'),
		state.objectSha256
	);
	const denied = await fetch(
		`${state.url}/storage/v1/object/authenticated/ops-recovery/${state.objectPath}`,
		{ headers: { Authorization: `Bearer ${outsider.accessToken}` } }
	);
	assert.equal(denied.status, 400, 'Storage outsider response status');
	const deniedBody = await denied.json();
	assert.equal(String(deniedBody.statusCode), '404', 'Storage outsider object is hidden');
	assert.equal(deniedBody.error, 'not_found', 'Storage outsider denial reason');
	assert(
		sql("select decrypted_secret from vault.decrypted_secrets where name='ops-recovery';") ===
			state.vaultSecret,
		'Vault secret decryption'
	);
	await verifyRealtime();
	save();
}
async function verifyRealtime() {
	const user = state.users[0];
	const marker = `Regalo sintético ${randomBytes(12).toString('hex')}`;
	const client = createClient(state.url, state.anonKey, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
	client.realtime.setAuth(user.accessToken);
	let changed;
	const change = new Promise((done) => {
		changed = done;
	});
	const channel = client.channel('ops-recovery');
	channel.on(
		'postgres_changes',
		{ event: 'UPDATE', schema: 'public', table: 'gift_items', filter: `id=eq.${user.giftId}` },
		(event) => {
			if (event.new.name === marker) changed(true);
		}
	);
	try {
		await new Promise((done, reject) => {
			const timer = setTimeout(() => reject(new Error('Realtime subscription timeout')), 30000);
			channel.subscribe((status) => {
				if (status === 'SUBSCRIBED') {
					clearTimeout(timer);
					done();
				} else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
					clearTimeout(timer);
					reject(new Error(`Realtime ${status}`));
				}
			});
		});
		await sleep(3000);
		sql(`update public.gift_items set name='${marker}' where id='${user.giftId}';`);
		let timer;
		try {
			assert.equal(
				await Promise.race([
					change,
					new Promise((done) => {
						timer = setTimeout(() => done(false), 15000);
					})
				]),
				true,
				'Realtime database change delivery'
			);
		} finally {
			clearTimeout(timer);
		}
	} finally {
		await client.removeAllChannels();
	}
}
async function restore() {
	if (!state.backupPath) await verifyApis();
	const archiveReused = Boolean(state.backupPath);
	let swapped = Boolean(state.physicalRestored);
	const started = state.restoreStarted || Date.now();
	let restored = state.extractedAt || 0;
	let backupPath = state.backupPath ? join(directory, state.backupPath) : null;
	try {
		if (!state.physicalRestored) {
			state.restoreStarted = started;
			save();
			if (!archiveReused)
				writeFileSync(join(directory, 'fixture-before-backup.json'), JSON.stringify(state), {
					mode: 0o600
				});
			for (const service of ['kong', 'realtime', 'storage', 'rest', 'auth', 'db'])
				docker(['stop', '--time', '30', name(service)]);
			const sources = {
				database: { container: name('db'), path: '/var/lib/postgresql/data' },
				storage: { container: name('storage'), path: '/var/lib/storage' },
				'database-config': { container: name('db'), path: '/etc/postgresql-custom' }
			};
			const sourcePath = join(directory, 'sources.json'),
				passwordPath = join(directory, 'backup-password');
			writeFileSync(sourcePath, JSON.stringify(sources));
			if (!state.backupPath) writeFileSync(passwordPath, randomBytes(48), { mode: 0o600 });
			backupPath = join(directory, state.backupPath || `backup-${Date.now()}`);
			const runBackup = (args) => {
				try {
					execFileSync(process.execPath, ['scripts/backup.mjs', ...args], {
						encoding: 'utf8',
						stdio: ['ignore', 'pipe', 'pipe']
					});
				} catch {
					throw new Error(`Backup operation ${args[0]} failed`);
				}
			};
			if (!state.backupPath) runBackup(['backup', backupPath, passwordPath, sourcePath]);
			runBackup(['verify', backupPath, passwordPath]);
			state.backupPath = backupPath.split(/[\\/]/).at(-1);
			save();
			runBackup([
				'restore-volumes',
				backupPath,
				passwordPath,
				state.recoveryPrefix,
				'CREATE_ISOLATED_VOLUMES'
			]);
			restored = Date.now();
			state.physicalRestored = true;
			state.restoreStarted = started;
			state.extractedAt = restored;
			state.sourceRemovalPending = true;
			save();
			swapped = true;
		}
		if (state.sourceRemovalPending) {
			const existing = docker(['ps', '-a', '--format', '{{.Names}}']).split('\n');
			for (const service of ['kong', 'realtime', 'storage', 'rest', 'auth', 'db']) {
				const container = name(service);
				if (!existing.includes(container)) continue;
				assert.equal(
					docker(['inspect', '--format', '{{index .Config.Labels "myfamily.ops"}}', container]),
					'20261101',
					'Source container ownership'
				);
				assert.equal(
					docker(['inspect', '--format', '{{json .State.Running}}', container]),
					'false',
					'Source removal requires stopped container'
				);
				docker(['rm', container]);
			}
			state.sourceRemovalPending = false;
			save();
		}
		await startDatabase(state.recoveryPrefix);
		await startServices(state.recoveryPrefix);
		const sessions = JSON.parse(
			sql(
				'select coalesce(json_agg(s), \'[]\'::json) from (select distinct on (user_id) user_id as "userId", token from auth.refresh_tokens where revoked = false order by user_id, created_at desc) s;'
			)
		);
		for (const user of state.users) {
			const session = sessions.find((entry) => entry.userId === user.id);
			assert(session?.token, 'Persisted archived Auth refresh session');
			user.refreshToken = session.token;
		}
		save();
		await verifyApis();
		state.restored = true;
		save();
		const manifest = JSON.parse(readFileSync(join(backupPath, 'manifest.json'), 'utf8'));
		const roots = manifest.entries.map((entry) => {
			const actual = docker([
				'run',
				'--rm',
				'--network',
				'none',
				'--mount',
				`type=volume,src=${state.recoveryPrefix}-${entry.kind},dst=/probe,readonly`,
				'--entrypoint',
				'/bin/sh',
				images.db,
				'-c',
				"stat -c '%u:%g:%a' /probe"
			]);
			assert.equal(actual, `${entry.root.uid}:${entry.root.gid}:${entry.root.mode}`);
			return { kind: entry.kind, preserved: true, root: actual };
		});
		writeFileSync(
			join(directory, 'result.json'),
			JSON.stringify(
				{
					passed: true,
					database: images.db,
					storageImage: images.storage,
					migrations: state.migrations,
					users: state.users.length,
					syntheticOnly: true,
					authLoginAndRefresh: true,
					refreshSessionSource: 'persisted encrypted database archive',
					familyListWishlistRls: true,
					outsiderReadDenied: true,
					storageBytes: 262144,
					storageSha256Preserved: true,
					storageOutsiderDenied: true,
					vaultDecryptionPreserved: true,
					realtimeAuthenticatedChangeDelivered: true,
					archivesAuthenticated: true,
					roots,
					coldStopArchiveVerificationAndExtractionMs: state.extractedAt ? restored - started : null,
					archiveReused,
					totalRecoveryMs: state.restoreStarted ? Date.now() - started : null,
					restoredStackRetained: true
				},
				null,
				2
			)
		);
		console.log(`Full Supabase encrypted restoration verified: ${join(directory, 'result.json')}`);
	} catch (error) {
		if (!swapped) {
			const failures = [];
			for (const service of ['db', 'auth', 'rest', 'storage', 'realtime', 'kong']) {
				try {
					docker(['start', name(service)]);
				} catch {
					failures.push(service);
				}
			}
			if (failures.length)
				throw new Error(`${error.message}; source restart failed: ${failures.join(', ')}`);
		} else {
			throw new Error(`${error.message}; restored volumes retained for diagnosis`);
		}
		throw error;
	}
}

try {
	if (command === 'setup') await setup();
	else {
		state = JSON.parse(readFileSync(statePath, 'utf8'));
		validateState();
		if (command === 'restore') await restore();
		else if (command === 'verify') {
			await verifyApis();
			console.log('API verification passed');
		} else
			throw new Error(
				'Usage: node scripts/test-supabase-recovery.mjs setup|restore|verify OUTPUT_DIRECTORY'
			);
	}
} catch (error) {
	writeFileSync(
		join(directory, 'failure.json'),
		JSON.stringify({ passed: false, message: error.message }, null, 2)
	);
	console.error(error.message);
	process.exitCode = 1;
}
