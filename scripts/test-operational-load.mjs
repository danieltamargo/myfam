import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { cpus, totalmem, platform, release } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { scanUploadBytes } from '../src/lib/server/security/antivirus.ts';
import { createServerClient } from '@supabase/ssr';

const execute = promisify(execFile);
const mib = 1024 * 1024;

export function localUrl(value) {
	const url = new URL(value);
	if (
		!['http:', 'https:'].includes(url.protocol) ||
		url.username ||
		url.password ||
		!['127.0.0.1', '[::1]'].includes(url.hostname)
	) {
		throw new Error('Only literal loopback HTTP endpoints are permitted.');
	}
	return url;
}

function integer(value, fallback, min, max, name) {
	const number = value ?? fallback;
	if (!Number.isSafeInteger(number) || number < min || number > max)
		throw new Error(`Invalid bounded setting: ${name}.`);
	return number;
}

function endpoint(base, path, prefix) {
	if (typeof path !== 'string' || !path.startsWith(prefix) || path.includes('..'))
		throw new Error('Invalid workload path.');
	const url = localUrl(new URL(path, base));
	if (url.origin !== base.origin) throw new Error('Workload must keep the configured origin.');
	return url;
}

export function validateConfig(config) {
	const supabase = localUrl(config.supabaseUrl);
	if (supabase.pathname !== '/') throw new Error('Supabase URL must be an origin.');
	if (typeof config.anonKey !== 'string' || !config.anonKey) throw new Error('Missing anon key.');
	if (config.cookieName !== undefined && !/^sb-[a-z0-9-]+-auth-token$/.test(config.cookieName))
		throw new Error('Invalid app session cookie name.');
	if (!Array.isArray(config.users) || config.users.length !== 10)
		throw new Error('Supply exactly ten isolated synthetic users.');
	for (const user of config.users) {
		if (!user.email || !user.password) throw new Error('Synthetic user credentials missing.');
		endpoint(supabase, user.readPath ?? config.readPath, '/rest/v1/');
		const write = user.write ?? config.write;
		if (write) {
			endpoint(supabase, write.path, '/rest/v1/rpc/');
			if (!write.body || typeof write.body !== 'object' || Array.isArray(write.body))
				throw new Error('RPC writes need a fixture-specific JSON body.');
		}
	}
	if (new Set(config.users.map((user) => user.email)).size !== 10)
		throw new Error('Each virtual user needs a distinct synthetic account.');
	if (
		!Array.isArray(config.dockerContainers) ||
		!config.dockerContainers.length ||
		config.dockerContainers.some(
			(name) => typeof name !== 'string' || !/^myfamily-ops-20261101[a-zA-Z0-9_.-]*$/.test(name)
		)
	)
		throw new Error(
			'Only explicitly named myfamily-ops-20261101 fixture containers are permitted.'
		);
	if (config.appUrl) {
		localUrl(config.appUrl);
		if (config.users.some((user) => !/^[0-9a-f-]{36}$/i.test(user.familyId)))
			throw new Error('Authenticated app reads require each synthetic family ID.');
	}
	if (config.clamav && !['127.0.0.1', '::1'].includes(config.clamav.host))
		throw new Error('ClamAV must use a literal loopback address.');
	if (config.clamav) integer(config.clamav.port, 3310, 1, 65535, 'clamav.port');
	return {
		...config,
		supabase,
		phaseSeconds: integer(config.phaseSeconds, 20, 20, 30, 'phaseSeconds'),
		warmupSeconds: integer(config.warmupSeconds, 2, 1, 5, 'warmupSeconds'),
		thinkMs: integer(config.thinkMs, 100, 50, 2000, 'thinkMs'),
		requestTimeoutMs: integer(config.requestTimeoutMs, 5000, 1000, 10000, 'requestTimeoutMs'),
		maxScanBytes: integer(config.maxScanBytes, mib, mib, 15 * mib, 'maxScanBytes')
	};
}

export function summarize(records, seconds) {
	const successful = records.filter((record) => record.classification === 'ok');
	const latencies = successful.map((record) => record.ms).sort((a, b) => a - b);
	const percentile = (fraction) =>
		latencies.length ? latencies[Math.ceil(latencies.length * fraction) - 1] : null;
	const classifications = {};
	for (const record of records)
		classifications[record.classification] = (classifications[record.classification] ?? 0) + 1;
	return {
		attempted: records.length,
		completed: successful.length,
		errors: records.length - successful.length,
		completedPerSecond: successful.length / seconds,
		attemptsPerSecond: records.length / seconds,
		latencyMs: { p50: percentile(0.5), p95: percentile(0.95), max: latencies.at(-1) ?? null },
		classifications
	};
}

export function reportFailures(report) {
	const failures = [];
	for (const phase of report.phases) {
		if (phase.errors)
			failures.push({ phase: phase.name, status: 'operation_errors', count: phase.errors });
		if (phase.samplingErrors.length)
			failures.push({
				phase: phase.name,
				status: 'resource_sampling_errors',
				count: phase.samplingErrors.length
			});
	}
	for (const container of report.containersAfter) {
		const before = report.containersBefore.find((entry) => entry.name === container.name);
		if (container.state !== 'running')
			failures.push({ container: container.name, status: container.state });
		if (container.health && container.health !== 'healthy')
			failures.push({ container: container.name, status: container.health });
		if (container.oomKilled) failures.push({ container: container.name, status: 'oom_killed' });
		if (!before || container.restartCount > before.restartCount)
			failures.push({ container: container.name, status: 'restarted_or_missing_baseline' });
	}
	for (const container of report.containersBefore) {
		if (!report.containersAfter.some((entry) => entry.name === container.name))
			failures.push({ container: container.name, status: 'missing_after_load' });
	}
	if (report.appProbe && (report.appProbe.classification || report.appProbe.status !== 200))
		failures.push({
			status: report.appProbe.classification ?? `app_http_${report.appProbe.status}`
		});
	return failures;
}

async function docker(args) {
	const result = await execute('docker', args, {
		timeout: 8000,
		maxBuffer: 2 * mib,
		windowsHide: true
	});
	return result.stdout.trim();
}

async function inventory(names) {
	const format =
		'{{json .Name}}|{{json .State.Status}}|{{json .State.OOMKilled}}|{{json .RestartCount}}|{{json .HostConfig.Memory}}|{{json .HostConfig.NanoCpus}}|{{with (index .State "Health")}}{{json .Status}}{{else}}null{{end}}|{{json (index .Config.Labels "myfamily.ops")}}';
	const rows = await docker(['inspect', '--format', format, ...names]);
	return rows
		.split('\n')
		.filter(Boolean)
		.map((row) => {
			const [name, state, oomKilled, restartCount, memoryBytes, nanoCpus, health, fixtureLabel] =
				row.split('|').map((part) => JSON.parse(part));
			if (!name.startsWith('/myfamily-ops-20261101') || fixtureLabel !== '20261101')
				throw new Error('Docker fixture identity check failed before workload.');
			return {
				name,
				state,
				oomKilled,
				restartCount,
				memoryLimitMiB: memoryBytes / mib,
				cpuLimit: nanoCpus / 1e9,
				health,
				fixtureLabel
			};
		});
}

function memoryMiB(value) {
	const match = value.trim().match(/^([\d.]+)\s*(B|KiB|MiB|GiB|kB|MB|GB)$/);
	if (!match) throw new Error('Unrecognized Docker memory unit.');
	const factors = {
		B: 1 / mib,
		KiB: 1 / 1024,
		MiB: 1,
		GiB: 1024,
		kB: 1000 / mib,
		MB: 1e6 / mib,
		GB: 1e9 / mib
	};
	return Number(match[1]) * factors[match[2]];
}

async function sampleResources(names) {
	const rows = await docker(['stats', '--no-stream', '--format', '{{json .}}', ...names]);
	return rows
		.split('\n')
		.filter(Boolean)
		.map((line) => {
			const row = JSON.parse(line);
			return {
				name: row.Name,
				cpuPercent: Number(row.CPUPerc.replace('%', '')),
				memoryMiB: memoryMiB(row.MemUsage.split('/')[0])
			};
		});
}

function errorClass(error) {
	if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return 'timeout';
	if (error?.status === 422) return 'scan_rejected';
	if (error?.status === 503) return 'scanner_unavailable_or_timeout';
	return 'network_or_protocol';
}

async function jsonRequest(url, options, timeoutMs) {
	const response = await fetch(url, {
		...options,
		redirect: 'error',
		signal: AbortSignal.timeout(Math.max(1, timeoutMs))
	});
	const text = await response.text();
	if (!response.ok)
		return { classification: response.status === 429 ? 'rate_limited' : `http_${response.status}` };
	try {
		return { classification: 'ok', data: text ? JSON.parse(text) : null };
	} catch {
		return { classification: 'invalid_json' };
	}
}

export async function runPhase(name, concurrency, seconds, operation, config) {
	const records = [];
	const samples = [];
	const samplingErrors = [];
	const started = performance.now();
	const deadline = started + seconds * 1000;
	let done = false;
	const sampler = (async () => {
		do {
			try {
				samples.push({
					elapsedSeconds: (performance.now() - started) / 1000,
					containers: await sampleResources(config.dockerContainers)
				});
			} catch {
				samplingErrors.push('docker_stats_failed');
			}
			if (!done) await sleep(1000);
		} while (!done);
	})();
	await Promise.all(
		Array.from({ length: concurrency }, async (_, index) => {
			while (performance.now() < deadline) {
				const requestStart = performance.now();
				let classification;
				try {
					classification = (await operation(index, config.requestTimeoutMs)).classification;
				} catch (error) {
					classification = errorClass(error);
				}
				records.push({ ms: performance.now() - requestStart, classification });
				const remaining = deadline - performance.now();
				if (remaining > 0) await sleep(Math.min(config.thinkMs, remaining));
			}
		})
	);
	if (!concurrency) await sleep(Math.max(0, deadline - performance.now()));
	const secondsElapsed = (performance.now() - started) / 1000;
	done = true;
	await sampler;
	return {
		name,
		warmup: name.includes('warmup'),
		concurrency,
		secondsElapsed,
		...summarize(records, secondsElapsed),
		samples,
		resourcePeaks: {
			cpuPercent: samples.length
				? Math.max(
						...samples.map((sample) =>
							sample.containers.reduce((sum, container) => sum + container.cpuPercent, 0)
						)
					)
				: null,
			memoryMiB: samples.length
				? Math.max(
						...samples.map((sample) =>
							sample.containers.reduce((sum, container) => sum + container.memoryMiB, 0)
						)
					)
				: null
		},
		samplingErrors,
		containersAfter: await inventory(config.dockerContainers)
	};
}

function cleanPayloads(maxBytes) {
	const pdf = Buffer.from(
		'%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n'
	);
	const png = Buffer.from(
		'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6cAAAAABJRU5ErkJggg==',
		'base64'
	);
	return [
		pdf,
		png,
		Buffer.concat([pdf, Buffer.alloc(mib - pdf.length, 32)]),
		...(maxBytes > mib ? [Buffer.concat([pdf, Buffer.alloc(maxBytes - pdf.length, 32)])] : [])
	];
}

export async function main() {
	const file = process.argv[2] ?? process.env.OPERATIONAL_LOAD_CONFIG;
	if (!file) throw new Error('Provide a protected ignored JSON config path.');
	const config = validateConfig(JSON.parse(await readFile(file, 'utf8')));
	const report = {
		createdAt: new Date().toISOString(),
		mode: 'local-self-hosted-synthetic',
		limitations: [
			'Local Docker measurements are not a VPS capacity guarantee; repeat on the candidate VPS.',
			'Hosted Supabase moves database/Auth/Storage resource usage off the app VPS; this run measures local self-hosted containers.',
			'Closed-loop HTTP workload excludes browser rendering, Realtime subscriptions and WAN latency.',
			'ClamAV phases measure clean INSTREAM scans only, not authenticated upload or Storage throughput.',
			'Each operation keeps its configured timeout; phases stop launching at the deadline and include in-flight completion in elapsed time.',
			'Scan timeout is the configured load-harness timeout, not the production antivirus default.',
			'Latency percentiles include successful operations only; timeout/error counts are reported separately.',
			'Docker memory statistics use Docker working-set accounting; CPU 100 percent means one CPU core.'
		],
		environment: {
			platform: platform(),
			release: release(),
			node: process.version,
			hostCpuCount: cpus().length,
			hostMemoryMiB: totalmem() / mib
		},
		settings: {
			phaseSeconds: config.phaseSeconds,
			warmupSeconds: config.warmupSeconds,
			thinkMs: config.thinkMs,
			requestTimeoutMs: config.requestTimeoutMs,
			scanTimeoutMs: config.requestTimeoutMs,
			maxScanBytes: config.maxScanBytes
		},
		phases: [],
		skipped: []
	};
	const dockerInfo = JSON.parse(
		await docker(['info', '--format', '{"cpuCount":{{.NCPU}},"memoryBytes":{{.MemTotal}}}'])
	);
	report.environment.dockerVm = {
		cpuCount: dockerInfo.cpuCount,
		memoryMiB: dockerInfo.memoryBytes / mib
	};
	report.containersBefore = await inventory(config.dockerContainers);
	const sessions = [];
	const appCookies = [];
	const signIns = [];
	for (const user of config.users) {
		const signInStarted = performance.now();
		const cookies = new Map();
		const client = createServerClient(config.supabase.origin, config.anonKey, {
			...(config.cookieName ? { cookieOptions: { name: config.cookieName } } : {}),
			global: {
				fetch: (url, options) =>
					fetch(url, {
						...options,
						redirect: 'error',
						signal: AbortSignal.timeout(config.requestTimeoutMs)
					})
			},
			cookies: {
				getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
				setAll: (values) => {
					for (const { name, value } of values) cookies.set(name, value);
				}
			}
		});
		const { data, error } = await client.auth.signInWithPassword({
			email: user.email,
			password: user.password
		});
		if (error || !data.session?.access_token)
			throw new Error('Synthetic sign-in failed; no load started.');
		sessions.push(data.session.access_token);
		appCookies.push(
			[...cookies].map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join('; ')
		);
		signIns.push({ classification: 'ok', ms: performance.now() - signInStarted });
	}
	report.auth = {
		strategy: 'one sequential sign-in per virtual user before load',
		...summarize(signIns, signIns.reduce((sum, record) => sum + record.ms, 0) / 1000)
	};
	const request = (kind) => async (index, timeoutMs) => {
		const user = config.users[index];
		const write = user.write ?? config.write;
		const path = kind === 'read' ? (user.readPath ?? config.readPath) : write.path;
		const result = await jsonRequest(
			endpoint(config.supabase, path, '/rest/v1/'),
			{
				method: kind === 'read' ? 'GET' : 'POST',
				headers: {
					apikey: config.anonKey,
					authorization: `Bearer ${sessions[index]}`,
					'content-type': 'application/json'
				},
				...(kind === 'write' ? { body: JSON.stringify(write.body) } : {})
			},
			timeoutMs
		);
		if (
			result.classification === 'ok' &&
			kind === 'read' &&
			(!Array.isArray(result.data) || !result.data.length)
		)
			return { classification: 'empty_or_invalid_fixture' };
		return result;
	};
	let appSequence = 0;
	const appRead = async (index, timeoutMs) => {
		const page = appSequence++ % 2 ? 'lists' : 'wishlist';
		const url = new URL(`/family/${config.users[index].familyId}/${page}`, localUrl(config.appUrl));
		const response = await fetch(url, {
			headers: { cookie: appCookies[index] },
			redirect: 'manual',
			signal: AbortSignal.timeout(Math.max(1, timeoutMs))
		});
		const body = await response.text();
		if (response.status >= 300 && response.status < 400)
			return { classification: 'app_auth_or_other_redirect' };
		if (response.status !== 200) return { classification: `http_${response.status}` };
		return { classification: body.includes('<html') ? 'ok' : 'invalid_app_html' };
	};
	const phase = async (name, concurrency, seconds, operation) => {
		console.log(`Running ${name} (${concurrency} users, ${seconds}s).`);
		const result = await runPhase(name, concurrency, seconds, operation, config);
		report.phases.push(result);
		console.log(`${name}: ${result.completed} completed, ${result.errors} errors.`);
	};
	await phase('idle-baseline', 0, config.phaseSeconds, async () => ({ classification: 'ok' }));
	for (const kind of ['read', 'write']) {
		if (kind === 'write' && config.users.some((user) => !(user.write ?? config.write))) {
			report.skipped.push('RPC write phases: fixture-specific write configuration missing.');
			continue;
		}
		for (const concurrency of [1, 5, 10]) {
			await phase(
				`${kind}-warmup-${concurrency}`,
				concurrency,
				config.warmupSeconds,
				request(kind)
			);
			await phase(`${kind}-${concurrency}`, concurrency, config.phaseSeconds, request(kind));
		}
	}
	if (config.appUrl) {
		for (const concurrency of [1, 5, 10]) {
			await phase(`app-read-warmup-${concurrency}`, concurrency, config.warmupSeconds, appRead);
			await phase(`app-read-${concurrency}`, concurrency, config.phaseSeconds, appRead);
		}
	} else report.skipped.push('Authenticated app SSR reads: no local appUrl configured.');
	if (config.clamav) {
		const payloads = cleanPayloads(config.maxScanBytes);
		report.settings.scanPayloadBytes = payloads.map((payload) => payload.length);
		let sequence = 0;
		const scan = async (_index, timeoutMs) => {
			await scanUploadBytes(payloads[sequence++ % payloads.length], {
				host: config.clamav.host,
				port: config.clamav.port ?? 3310,
				timeoutMs
			});
			return { classification: 'ok' };
		};
		for (const concurrency of [1, 2]) {
			await phase(`scan-warmup-${concurrency}`, concurrency, config.warmupSeconds, scan);
			await phase(`scan-${concurrency}`, concurrency, config.phaseSeconds, scan);
		}
	} else report.skipped.push('ClamAV scan phases: no local scanner configured.');
	if (config.appUrl) {
		const start = performance.now();
		try {
			const response = await fetch(localUrl(config.appUrl), {
				redirect: 'manual',
				signal: AbortSignal.timeout(config.requestTimeoutMs)
			});
			await response.arrayBuffer();
			report.appProbe = { status: response.status, ms: performance.now() - start };
		} catch (error) {
			report.appProbe = { classification: errorClass(error) };
		}
	}
	report.containersAfter = await inventory(config.dockerContainers);
	report.failures = reportFailures(report);
	report.passed = report.failures.length === 0;
	const output = resolve(config.outputPath ?? 'output/operational-load/report.json');
	await mkdir(dirname(output), { recursive: true });
	await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, {
		encoding: 'utf8',
		mode: 0o600
	});
	console.log('Operational load report saved. No credentials or response bodies included.');
	if (!report.passed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	main().catch(() => {
		console.error(
			'Operational load failed. Check the protected local configuration and service health. No credentials were printed.'
		);
		process.exitCode = 1;
	});
}
