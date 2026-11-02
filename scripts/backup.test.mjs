import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { Readable, Writable } from 'node:stream';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	encrypt,
	decrypt,
	deriveKey,
	signManifest,
	authenticateManifest,
	parseRootMetadata,
	sourceKinds,
	validateManifestEntries
} from './backup.mjs';

test('encrypted archive preserves bytes and rejects wrong password and tampering', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'myfamily-backup-'));
	try {
		const path = join(directory, 'archive.enc');
		const password = Buffer.from('a sufficiently long recovery password 123456');
		const original = Buffer.from('Auth, PostgreSQL y Storage: áéíóúñ\0binary');
		const metadata = await encrypt(Readable.from(original), path, password);
		const chunks = [];
		await decrypt(
			createReadStream(path),
			new Writable({
				write(chunk, _encoding, done) {
					chunks.push(chunk);
					done();
				}
			}),
			password,
			metadata
		);
		assert.deepEqual(Buffer.concat(chunks), original);
		const sink = () =>
			new Writable({
				write(_chunk, _encoding, done) {
					done();
				}
			});
		await assert.rejects(
			decrypt(
				createReadStream(path),
				sink(),
				Buffer.from('a different sufficiently long password 98765'),
				metadata
			)
		);
		const bytes = await readFile(path);
		bytes[0] ^= 1;
		await writeFile(path, bytes);
		await assert.rejects(decrypt(createReadStream(path), sink(), password, metadata));
		assert.throws(() => deriveKey(Buffer.from('short'), Buffer.alloc(16)));
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test('only the two required sources and optional database configuration are accepted', () => {
	const entry = (kind) => ({
		kind,
		file: `${kind}.tar.enc`,
		image: `sha256:${'a'.repeat(64)}`,
		root: { uid: 101, gid: 102, mode: '700' }
	});
	const required = [entry('database'), entry('storage')];
	validateManifestEntries(required);
	validateManifestEntries([...required, entry('database-config')]);
	assert.deepEqual(sourceKinds({ database: {}, storage: {}, 'database-config': {} }), [
		'database',
		'storage',
		'database-config'
	]);
	assert.throws(() => sourceKinds({ database: {}, storage: {}, arbitrary: {} }));
	assert.throws(() => validateManifestEntries([entry('database'), entry('arbitrary')]));
	assert.throws(() => validateManifestEntries([...required, entry('storage')]));
	assert.throws(() => validateManifestEntries([entry('storage'), entry('database-config')]));
	assert.throws(() =>
		validateManifestEntries([
			...required,
			{ ...entry('database-config'), root: { uid: 0, gid: 0, mode: 'invalid' } }
		])
	);
});

test('manifest authentication binds image and archive metadata', () => {
	const password = Buffer.from('a sufficiently long recovery password 123456');
	const manifest = {
		version: 1,
		authSalt: 'a'.repeat(32),
		entries: [{ image: 'original', file: 'database.tar.enc' }]
	};
	manifest.hmac = signManifest(manifest, password);
	authenticateManifest(manifest, password);
	manifest.entries[0].image = 'modified';
	assert.throws(() => authenticateManifest(manifest, password));
});

test('volume root ownership and permissions are preserved as validated numeric metadata', () => {
	assert.deepEqual(parseRootMetadata('999:999:700'), { uid: 999, gid: 999, mode: '700' });
	assert.deepEqual(parseRootMetadata('0:0:1777'), { uid: 0, gid: 0, mode: '1777' });
	for (const input of ['-1:0:700', '0:0:888', '0:0:700;touch /tmp/x', '4294967295:0:700']) {
		assert.throws(() => parseRootMetadata(input));
	}
	const password = Buffer.from('a sufficiently long recovery password 123456');
	const manifest = {
		version: 2,
		authSalt: 'b'.repeat(32),
		entries: [{ root: parseRootMetadata('999:999:700') }]
	};
	manifest.hmac = signManifest(manifest, password);
	authenticateManifest(manifest, password);
	manifest.entries[0].root.mode = '777';
	assert.throws(() => authenticateManifest(manifest, password));
});
