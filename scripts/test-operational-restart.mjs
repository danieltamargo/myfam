import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { createServerClient } from '@supabase/ssr';

const execute = promisify(execFile);
const prefix = 'myfamily-ops-20261101-';
const docker = async (args) => {
	try {
		return (
			await execute('docker', args, { timeout: 45000, maxBuffer: 1024 * 1024 })
		).stdout.trim();
	} catch {
		throw new Error(`Docker ${args[0]} failed for the isolated fixture.`);
	}
};

function loopback(value) {
	const url = new URL(value);
	if (
		!['http:', 'https:'].includes(url.protocol) ||
		!['127.0.0.1', '[::1]'].includes(url.hostname) ||
		url.username ||
		url.password
	)
		throw new Error('Only literal loopback HTTP endpoints are permitted.');
	return url;
}

export function validateConfig(config) {
	const supabase = loopback(config.supabaseUrl);
	if (supabase.pathname !== '/' || !config.anonKey)
		throw new Error('Supply a Supabase origin and anon key.');
	if (!Array.isArray(config.containers) || !config.containers.length)
		throw new Error('Supply containers in dependency startup order.');
	const names = config.containers.map((entry) => entry.name);
	if (
		new Set(names).size !== names.length ||
		names.some(
			(name) => typeof name !== 'string' || !/^myfamily-ops-20261101-[a-z0-9-]+$/.test(name)
		)
	)
		throw new Error('Only explicitly named isolated operational containers are permitted.');
	if (
		!Array.isArray(config.crashTargets) ||
		!config.crashTargets.length ||
		config.crashTargets.some((name) => !names.includes(name))
	)
		throw new Error('Crash targets must belong to the explicit container list.');
	if (!Array.isArray(config.users) || !config.users.length)
		throw new Error('Supply synthetic fixture users.');
	for (const user of config.users) {
		if (!user.email || !user.password || !Array.isArray(user.paths) || !user.paths.length)
			throw new Error('Each user needs credentials and verification paths.');
		for (const path of user.paths) {
			const url = loopback(new URL(path, supabase));
			if (
				url.origin !== supabase.origin ||
				!/^\/(rest\/v1|storage\/v1\/object)\//.test(url.pathname)
			)
				throw new Error('Verification paths must be local REST or Storage reads.');
		}
	}
	if (config.appUrl && !/^[0-9a-f-]{36}$/i.test(config.users[0].familyId))
		throw new Error('App verification requires a synthetic family ID.');
	return { ...config, supabase, app: config.appUrl ? loopback(config.appUrl) : null };
}

async function request(url, options = {}) {
	const response = await fetch(url, {
		...options,
		redirect: 'error',
		signal: AbortSignal.timeout(5000)
	});
	if (!response.ok) throw new Error(`Fixture HTTP request returned ${response.status}.`);
	return response;
}

async function verify(config) {
	const started = performance.now();
	const hashes = [];
	for (const [index, user] of config.users.entries()) {
		if (!config.tokens[index]) {
			const login = await request(new URL('/auth/v1/token?grant_type=password', config.supabase), {
				method: 'POST',
				headers: { apikey: config.anonKey, 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: user.email, password: user.password })
			});
			const { access_token: token } = await login.json();
			if (!token) throw new Error('Fixture login did not return an access token.');
			config.tokens[index] = token;
		}
		const token = config.tokens[index];
		for (const path of user.paths) {
			const response = await request(new URL(path, config.supabase), {
				headers: { apikey: config.anonKey, Authorization: `Bearer ${token}` }
			});
			hashes.push(
				createHash('sha256')
					.update(Buffer.from(await response.arrayBuffer()))
					.digest('hex')
			);
		}
	}
	if (config.app) {
		const response = await request(
			new URL(`/family/${config.users[0].familyId}/lists`, config.app),
			{ headers: { cookie: config.appCookie } }
		);
		const html = await response.text();
		if (!html.includes(config.users[0].familyId))
			throw new Error('Authenticated app response did not contain the fixture family.');
	}
	return { hashes, elapsedMs: Math.round(performance.now() - started) };
}

async function inspect(name) {
	const format =
		'{"Id":{{json .Id}},"Name":{{json .Name}},"Config":{"Labels":{"myfamily.ops":{{json (index .Config.Labels "myfamily.ops")}}}},"NetworkSettings":{"Networks":{{json .NetworkSettings.Networks}}},"State":{"Running":{{json .State.Running}},"ExitCode":{{json .State.ExitCode}},"OOMKilled":{{json .State.OOMKilled}}{{with (index .State "Health")}},"Health":{"Status":{{json .Status}}}{{end}}},"RestartCount":{{json .RestartCount}},"HostConfig":{"RestartPolicy":{"Name":{{json .HostConfig.RestartPolicy.Name}}}}}';
	return JSON.parse(await docker(['inspect', '--format', format, name]));
}

async function freshAuth(config) {
	const user = config.users[0];
	const headers = { apikey: config.anonKey, 'Content-Type': 'application/json' };
	const login = await request(new URL('/auth/v1/token?grant_type=password', config.supabase), {
		method: 'POST',
		headers,
		body: JSON.stringify({ email: user.email, password: user.password })
	});
	const session = await login.json();
	if (!session.access_token || !session.refresh_token)
		throw new Error('Fresh fixture login failed.');
	const refresh = await request(
		new URL('/auth/v1/token?grant_type=refresh_token', config.supabase),
		{
			method: 'POST',
			headers,
			body: JSON.stringify({ refresh_token: session.refresh_token })
		}
	);
	if (!(await refresh.json()).access_token) throw new Error('Fixture session refresh failed.');
	return { login: true, refresh: true };
}

function state(container) {
	return {
		name: container.Name.slice(1),
		running: container.State.Running,
		exitCode: container.State.ExitCode,
		oomKilled: container.State.OOMKilled,
		restartCount: container.RestartCount,
		health: container.State.Health?.Status ?? 'not-configured',
		restartPolicy: container.HostConfig.RestartPolicy.Name
	};
}

async function ready(config, containers, baseline) {
	const deadline = Date.now() + 120000;
	let lastError;
	while (Date.now() < deadline) {
		try {
			const states = await Promise.all(containers.map((entry) => inspect(entry.Id)));
			if (
				states.some(
					(entry) =>
						!entry.State.Running || (entry.State.Health && entry.State.Health.Status !== 'healthy')
				)
			)
				throw new Error('Fixture container readiness is pending.');
			const verification = await verify(config);
			if (JSON.stringify(verification.hashes) !== JSON.stringify(baseline.hashes))
				throw new Error('Acknowledged fixture data changed after recovery.');
			return { verification, containers: states.map(state) };
		} catch (error) {
			lastError = error;
		}
		await sleep(500);
	}
	throw new Error(`Recovery deadline exceeded: ${lastError?.message}`);
}

export async function run(config) {
	config = validateConfig(config);
	const containers = await Promise.all(config.containers.map((entry) => inspect(entry.name)));
	for (const container of containers) {
		if (container.Config.Labels?.['myfamily.ops'] !== '20261101' || !container.State.Running)
			throw new Error('Every fixture container must be running and carry myfamily.ops=20261101.');
		const networks = Object.keys(container.NetworkSettings.Networks);
		if (!networks.length || networks.some((name) => !name.startsWith(prefix)))
			throw new Error('Fixture containers must only use isolated operational networks.');
		for (const name of networks) {
			const label = await docker([
				'network',
				'inspect',
				'--format',
				'{{index .Labels "myfamily.ops"}}',
				name
			]);
			if (label !== '20261101') throw new Error('Fixture network ownership label missing.');
		}
	}
	if (config.app) {
		const cookies = new Map();
		const client = createServerClient(config.supabase.origin, config.anonKey, {
			...(config.cookieName ? { cookieOptions: { name: config.cookieName } } : {}),
			global: {
				fetch: (url, options) =>
					fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(5000) })
			},
			cookies: {
				getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
				setAll: (values) => {
					for (const { name, value } of values) cookies.set(name, value);
				}
			}
		});
		const { error, data } = await client.auth.signInWithPassword({
			email: config.users[0].email,
			password: config.users[0].password
		});
		if (error || !data.session) throw new Error('Synthetic app session creation failed.');
		config.appCookie = [...cookies]
			.map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
			.join('; ');
	}
	config.tokens = [];
	const baseline = await verify(config);
	const report = { startedAt: new Date().toISOString(), baseline, scenarios: [] };
	let started = performance.now();
	let scenarioError;
	const failures = [];
	try {
		const appEntries = config.containers.filter((entry) => entry.role === 'app');
		if (config.app && appEntries.length !== 1)
			throw new Error('Automatic recovery requires exactly one explicit app container role.');
		if (appEntries.length) {
			const app = containers.find((entry) => entry.Name === `/${appEntries[0].name}`);
			if (app.HostConfig.RestartPolicy.Name !== 'unless-stopped')
				throw new Error('Automatic app recovery requires the unless-stopped restart policy.');
			const before = state(await inspect(app.Id));
			const killChild = `const fs = require('node:fs'); const assert = require('node:assert/strict'); assert.ok(fs.readlinkSync('/proc/1/exe').endsWith('/docker-init'), 'Expected Docker init as PID 1'); const children = fs.readFileSync('/proc/1/task/1/children', 'utf8').trim().split(/\\s+/).filter(Boolean); assert.equal(children.length, 1, 'Expected exactly one init child'); const pid = Number(children[0]); assert.ok(Number.isSafeInteger(pid) && pid > 1); const command = fs.readFileSync('/proc/' + pid + '/cmdline', 'utf8').split('\\0').filter(Boolean); assert.ok(fs.readlinkSync('/proc/' + pid + '/exe').endsWith('/node'), 'Expected Node executable'); assert.equal(command.length, 2, 'Expected node build'); assert.equal(command[1], 'build', 'Expected node build'); process.kill(pid, 'SIGKILL');`;
			started = performance.now();
			await docker(['exec', app.Id, 'node', '-e', killChild]);
			const deadline = Date.now() + 120000;
			let restarted;
			while (Date.now() < deadline) {
				restarted = await inspect(app.Id);
				if (restarted.RestartCount > before.restartCount && restarted.State.Running) break;
				await sleep(500);
			}
			if (!restarted?.State.Running || restarted.RestartCount <= before.restartCount)
				throw new Error('The app did not restart automatically within 120 seconds.');
			const recovered = await ready(config, containers, baseline);
			report.scenarios.push({
				scenario: 'app-child-SIGKILL-automatic-recovery',
				target: appEntries[0].name,
				automaticRecovery: true,
				before,
				...recovered,
				freshAuth: await freshAuth(config),
				appSessionPersisted: Boolean(config.app),
				killToVerifiedMs: Math.round(performance.now() - started)
			});
		}
		started = performance.now();
		for (const container of [...containers].reverse())
			await docker(['stop', '--time', '20', container.Id]);
		const stopped = await Promise.all(containers.map((entry) => inspect(entry.Id)));
		if (stopped.some((entry) => entry.State.Running))
			throw new Error('Graceful fixture shutdown did not stop every container.');
		for (const container of containers) await docker(['start', container.Id]);
		const graceful = await ready(config, containers, baseline);
		report.scenarios.push({
			scenario: 'graceful-full-stop-start',
			automaticRecovery: false,
			...graceful,
			freshAuth: await freshAuth(config),
			appSessionPersisted: Boolean(config.app),
			stopToVerifiedMs: Math.round(performance.now() - started),
			stopped: stopped.map(state)
		});
		for (const name of config.crashTargets) {
			const target = containers.find((entry) => entry.Name === `/${name}`);
			started = performance.now();
			await docker(['kill', '--signal', 'KILL', target.Id]);
			const killed = state(await inspect(target.Id));
			await docker(['start', target.Id]);
			const recovered = await ready(config, containers, baseline);
			report.scenarios.push({
				scenario: 'abrupt-SIGKILL-manual-recovery',
				target: name,
				automaticRecovery: false,
				killed,
				...recovered,
				freshAuth: await freshAuth(config),
				appSessionPersisted: Boolean(config.app),
				killToVerifiedMs: Math.round(performance.now() - started)
			});
		}
	} catch (error) {
		scenarioError = error;
	} finally {
		for (const container of containers) {
			try {
				if (!(await inspect(container.Id)).State.Running) await docker(['start', container.Id]);
			} catch {
				failures.push(container.Name.slice(1));
			}
		}
	}
	if (failures.length)
		throw new Error(
			`Could not recover isolated containers: ${failures.join(', ')}. ${scenarioError?.message ?? ''}`
		);
	if (scenarioError) throw scenarioError;
	return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	try {
		if (!process.argv[2] || !process.argv[3])
			throw new Error(
				'Usage: node scripts/test-operational-restart.mjs private-config.json report.json'
			);
		const report = await run(JSON.parse(await readFile(process.argv[2], 'utf8')));
		await writeFile(process.argv[3], JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
		console.log('Isolated restart verification completed; report written.');
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}
