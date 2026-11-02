import { spawnSync, spawn } from 'node:child_process';
import {
	createCipheriv,
	createDecipheriv,
	randomBytes,
	scryptSync,
	createHash,
	createHmac,
	timingSafeEqual
} from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Writable } from 'node:stream';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

function docker(args) {
	const result = spawnSync('docker', args, { encoding: 'utf8' });
	if (result.error || result.status !== 0) throw new Error(`Docker failed: ${args[0]}`);
	return result.stdout.trim();
}

function inspect(id, format) {
	return JSON.parse(docker(['inspect', '--format', format, id]));
}

export function parseRootMetadata(value) {
	const match = /^(\d{1,10}):(\d{1,10}):([0-7]{3,4})$/.exec(value);
	if (!match || Number(match[1]) > 4294967294 || Number(match[2]) > 4294967294) {
		throw new Error('Invalid volume root metadata');
	}
	return { uid: Number(match[1]), gid: Number(match[2]), mode: match[3] };
}

function validateRootMetadata(root) {
	if (!root || !Number.isInteger(root.uid) || !Number.isInteger(root.gid))
		throw new Error('Missing volume root metadata');
	return parseRootMetadata(`${root.uid}:${root.gid}:${root.mode}`);
}

const SOURCE_KINDS = ['database', 'storage', 'database-config'];

export function sourceKinds(config) {
	if (
		!config ||
		typeof config !== 'object' ||
		Array.isArray(config) ||
		!Object.hasOwn(config, 'database') ||
		!Object.hasOwn(config, 'storage') ||
		Object.keys(config).some((kind) => !SOURCE_KINDS.includes(kind))
	) {
		throw new Error('Invalid backup source kinds');
	}
	return SOURCE_KINDS.filter((kind) => Object.hasOwn(config, kind));
}

export function validateManifestEntries(entries) {
	if (!Array.isArray(entries) || ![2, 3].includes(entries.length))
		throw new Error('Invalid manifest entries');
	const config = Object.fromEntries(entries.map((entry) => [entry.kind, entry]));
	if (sourceKinds(config).length !== entries.length) throw new Error('Duplicate manifest entry');
	for (const entry of entries) {
		if (entry.file !== `${entry.kind}.tar.enc` || !/^sha256:[a-f0-9]{64}$/.test(entry.image))
			throw new Error('Invalid manifest entry');
		validateRootMetadata(entry.root);
	}
}

export function deriveKey(password, salt) {
	if (password.length < 32) throw new Error('Password file must contain at least 32 bytes');
	return scryptSync(password, salt, 32);
}

export function signManifest(manifest, password) {
	const { hmac: _hmac, ...payload } = manifest;
	return createHmac('sha256', deriveKey(password, Buffer.from(manifest.authSalt, 'hex')))
		.update(JSON.stringify(payload))
		.digest('hex');
}

export function authenticateManifest(manifest, password) {
	if (!/^[a-f0-9]{32}$/.test(manifest.authSalt) || !/^[a-f0-9]{64}$/.test(manifest.hmac))
		throw new Error('Invalid manifest authentication');
	if (
		!timingSafeEqual(
			Buffer.from(manifest.hmac, 'hex'),
			Buffer.from(signManifest(manifest, password), 'hex')
		)
	)
		throw new Error('Manifest authentication failed');
}

export async function encrypt(input, output, password) {
	const salt = randomBytes(16);
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', deriveKey(password, salt), iv);
	await pipeline(input, cipher, createWriteStream(output, { flags: 'wx', mode: 0o600 }));
	return {
		salt: salt.toString('hex'),
		iv: iv.toString('hex'),
		tag: cipher.getAuthTag().toString('hex')
	};
}

export async function decrypt(input, output, password, metadata) {
	const cipher = createDecipheriv(
		'aes-256-gcm',
		deriveKey(password, Buffer.from(metadata.salt, 'hex')),
		Buffer.from(metadata.iv, 'hex')
	);
	cipher.setAuthTag(Buffer.from(metadata.tag, 'hex'));
	await pipeline(input, cipher, output);
}

async function digest(path) {
	const hash = createHash('sha256');
	for await (const chunk of createReadStream(path)) hash.update(chunk);
	return hash.digest('hex');
}

function capture(args) {
	const child = spawn('docker', args, { stdio: ['ignore', 'pipe', 'ignore'] });
	const done = new Promise((accept, reject) => {
		child.on('error', reject);
		child.on('close', (code) =>
			code === 0 ? accept() : reject(new Error('Docker archive capture failed'))
		);
	});
	return { child, done };
}

async function backup(config, directory, password) {
	const kinds = sourceKinds(config);
	const ids = docker(['ps', '-aq']).split(/\s+/).filter(Boolean);
	const sources = [];
	for (const kind of kinds) {
		const source = config[kind];
		if (!source?.container || !source.path?.startsWith('/') || source.path.includes(':'))
			throw new Error(`Invalid ${kind} source`);
		const state = inspect(source.container, '{{json .State}}');
		if (state.Running || state.ExitCode !== 0)
			throw new Error(`${kind} must be cleanly stopped first`);
		const mounts = inspect(source.container, '{{json .Mounts}}');
		if (
			kind === 'database' &&
			mounts.some((item) => item.Destination === '/etc/postgresql-custom') &&
			(config['database-config']?.container !== source.container ||
				config['database-config']?.path !== '/etc/postgresql-custom')
		) {
			throw new Error('Database configuration volume must be included as database-config');
		}
		const mount = mounts.find((item) => item.Destination === source.path && item.Type === 'volume');
		if (!mount) throw new Error(`${kind} path must be the root of a named Docker volume`);
		for (const id of ids) {
			const otherMounts = inspect(id, '{{json .Mounts}}');
			if (
				otherMounts.some((item) => item.Name === mount.Name) &&
				inspect(id, '{{json .State.Running}}')
			)
				throw new Error('A source volume still has a running container');
		}
		const image = inspect(source.container, '{{json .Image}}');
		const root = parseRootMetadata(
			docker([
				'run',
				'--rm',
				'--network',
				'none',
				'--read-only',
				'--user',
				'0',
				'--mount',
				`type=volume,src=${mount.Name},dst=/capture,readonly,volume-nocopy`,
				'--entrypoint',
				'/bin/sh',
				image,
				'-c',
				"stat -c '%u:%g:%a' /capture"
			])
		);
		sources.push({ ...source, kind, image, root });
	}
	await mkdir(directory, { mode: 0o700 });
	const manifest = {
		version: 2,
		authSalt: randomBytes(16).toString('hex'),
		method: 'cold-volume-aes256gcm-scrypt',
		createdAt: new Date().toISOString(),
		entries: []
	};
	for (const source of sources) {
		const file = `${source.kind}.tar.enc`;
		const path = join(directory, file);
		const { child, done } = capture(['cp', '-a', `${source.container}:${source.path}/.`, '-']);
		const [metadata] = await Promise.all([encrypt(child.stdout, path, password), done]);
		manifest.entries.push({
			kind: source.kind,
			image: source.image,
			root: source.root,
			file,
			...metadata,
			sha256: await digest(path),
			bytes: (await stat(path)).size
		});
	}
	manifest.hmac = signManifest(manifest, password);
	await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', {
		flag: 'wx',
		mode: 0o600
	});
	console.log(
		'Encrypted backup created. Sources remain stopped; restart them in dependency order.'
	);
}

async function verify(directory, password) {
	const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
	authenticateManifest(manifest, password);
	if (manifest.version !== 2 || manifest.method !== 'cold-volume-aes256gcm-scrypt')
		throw new Error('Unsupported manifest');
	validateManifestEntries(manifest.entries);
	for (const entry of manifest.entries) {
		const path = join(directory, entry.file);
		if ((await stat(path)).size !== entry.bytes || (await digest(path)) !== entry.sha256)
			throw new Error('Archive integrity check failed');
		await decrypt(
			createReadStream(path),
			new Writable({
				write(_chunk, _encoding, callback) {
					callback();
				}
			}),
			password,
			entry
		);
	}
	return manifest;
}

async function restore(directory, password, prefix, confirmation) {
	if (
		!/^myfamily-recovery-[a-z0-9-]{8,48}$/.test(prefix) ||
		confirmation !== 'CREATE_ISOLATED_VOLUMES'
	)
		throw new Error('An isolated recovery prefix and explicit confirmation are required');
	const manifest = await verify(directory, password);
	const existing = docker(['volume', 'ls', '--format', '{{.Name}}']).split(/\s+/);
	if (manifest.entries.some((entry) => existing.includes(`${prefix}-${entry.kind}`)))
		throw new Error('Recovery volume already exists');
	for (const entry of manifest.entries) {
		const volume = `${prefix}-${entry.kind}`;
		docker(['volume', 'create', '--label', 'myfamily.recovery=true', volume]);
		const helper = docker([
			'create',
			'--interactive',
			'--network',
			'none',
			'--read-only',
			'--user',
			'0',
			'--mount',
			`type=volume,src=${volume},dst=/restore,volume-nocopy`,
			'--entrypoint',
			'/bin/sh',
			entry.image,
			'-c',
			'tar --numeric-owner -xpf - -C /restore && chown "$1:$2" /restore && chmod "$3" /restore',
			'restore-root',
			String(entry.root.uid),
			String(entry.root.gid),
			entry.root.mode
		]);
		try {
			const child = spawn('docker', ['start', '--attach', '--interactive', helper], {
				stdio: ['pipe', 'ignore', 'ignore']
			});
			const done = new Promise((accept, reject) => {
				child.on('error', reject);
				child.on('close', (code) =>
					code === 0 ? accept() : reject(new Error('Recovery extraction failed'))
				);
			});
			await Promise.all([
				decrypt(createReadStream(join(directory, entry.file)), child.stdin, password, entry),
				done
			]);
			if (inspect(helper, '{{json .State.ExitCode}}') !== 0)
				throw new Error('Volume root ownership restoration failed');
		} finally {
			docker(['rm', '-v', helper]);
		}
	}
	console.log(
		`Created isolated volumes: ${manifest.entries.map((entry) => `${prefix}-${entry.kind}`).join(', ')}. No services started.`
	);
}

async function main() {
	const [command, directory, passwordFile, ...args] = process.argv.slice(2);
	if (!['backup', 'verify', 'restore-volumes'].includes(command) || !directory || !passwordFile)
		throw new Error(
			'Usage: node scripts/backup.mjs backup|verify|restore-volumes DIRECTORY PASSWORD_FILE [CONFIG_FILE | PREFIX CREATE_ISOLATED_VOLUMES]'
		);
	const password = await readFile(resolve(passwordFile));
	deriveKey(password, Buffer.alloc(16));
	if (command === 'backup')
		await backup(JSON.parse(await readFile(args[0], 'utf8')), resolve(directory), password);
	if (command === 'verify') {
		await verify(resolve(directory), password);
		console.log('All encrypted archives verified.');
	}
	if (command === 'restore-volumes') await restore(resolve(directory), password, ...args);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	main().catch(() => {
		console.error(
			'Operation failed. Check inputs, stopped containers, password and Docker availability. Incomplete destinations must not be used.'
		);
		process.exitCode = 1;
	});
}
