import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const linux = process.platform === 'linux';
async function fixture(mode = '') {
	const dir = await mkdtemp(join(tmpdir(), 'backup-cycle-'));
	const log = join(dir, 'calls');
	const stub = `import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2), mode = process.env.CYCLE_MODE;
appendFileSync(process.env.CYCLE_LOG, JSON.stringify(args)+'\\n');
if (args[0] === 'compose') process.exit(0);
if (args[0] === 'ps') { console.log('app\\ndb'); process.exit(0); }
if (args[0] === 'inspect') {
 const id = args.at(-1), restarted = existsSync(process.env.CYCLE_DIR+'/started-'+id);
 console.log(JSON.stringify({id, labels:{'com.docker.compose.project': mode==='foreign'&&id==='storage'?'other':'family', 'com.docker.compose.service':id, 'com.docker.compose.depends_on':id==='app'?'db:service_healthy:false':''}, state:{Running:true, ...(restarted&&mode==='unhealthy'?{Health:{Status:'unhealthy'}}:restarted&&mode==='timeout'?{Health:{Status:'starting'}}:{})}})); process.exit(0);
}
if (args[0] === 'start') {writeFileSync(process.env.CYCLE_DIR+'/started-'+args[1], ''); if(mode==='startfail'&&args[1]==='db')process.exit(1);}
if (args[0] === 'stop' && mode==='stopfail') process.exit(1);
`;
	await writeFile(join(dir, 'docker.mjs'), stub);
	await writeFile(
		join(dir, 'docker'),
		`#!/usr/bin/env bash\nexec '${process.execPath}' -- '${join(dir, 'docker.mjs')}' "$@"\n`
	);
	await chmod(join(dir, 'docker'), 0o700);
	await writeFile(join(dir, 'package.json'), '{"type":"module"}');
	await writeFile(
		join(dir, 'node'),
		`#!/usr/bin/env bash\nif [[ $1 == scripts/backup.mjs ]]; then\n printf '%s\\n' "$2" >> "$CYCLE_DIR/phases"\n if [[ $CYCLE_MODE == "$2" ]]; then exit 1; fi\n if [[ $CYCLE_MODE == wait ]]; then touch "$CYCLE_DIR/waiting"; sleep 2; fi\n exit 0\nfi\nexec '${process.execPath}' -- "$@"\n`
	);
	await chmod(join(dir, 'node'), 0o700);
	await writeFile(
		join(dir, 'sources.json'),
		JSON.stringify({
			database: { container: 'db', path: '/data' },
			storage: { container: 'storage', path: '/storage' }
		})
	);
	const env = {
		...process.env,
		PATH: `${dir}:${process.env.PATH}`,
		CYCLE_DIR: dir,
		CYCLE_LOG: log,
		CYCLE_MODE: mode,
		BACKUP_READY_TIMEOUT_SECONDS: '1'
	};
	function run() {
		const child = spawn(
			'bash',
			[
				resolve('scripts/backup-cycle.sh'),
				'family',
				'compose.yaml',
				'unused.env',
				join(dir, 'sources.json'),
				'password',
				join(dir, 'backups')
			],
			{ env }
		);
		let output = '';
		child.stdout.on('data', (value) => (output += value));
		child.stderr.on('data', (value) => (output += value));
		const done = new Promise((resolve, reject) => {
			child.on('error', reject);
			child.on('close', (code, signal) => resolve({ code, signal, output }));
		});
		return { child, done };
	}
	return {
		dir,
		run,
		async calls() {
			return (await readFile(log, 'utf8')).trim().split('\n').map(JSON.parse);
		},
		async cleanup() {
			await rm(dir, { recursive: true, force: true });
		}
	};
}

test('cycle preserves exact running IDs and dependency order', { skip: !linux }, async () => {
	const f = await fixture();
	try {
		const result = await f.run().done;
		assert.equal(result.code, 0, result.output);
		const calls = await f.calls();
		assert.deepEqual(
			calls.filter((c) => c[0] === 'stop').map((c) => c.at(-1)),
			['app', 'db']
		);
		assert.deepEqual(
			calls.filter((c) => c[0] === 'start').map((c) => c[1]),
			['db', 'app']
		);
		assert.ok(!calls.some((c) => c[0] === 'start' && c.includes('stopped-replica')));
	} finally {
		await f.cleanup();
	}
});
for (const mode of [
	'stopfail',
	'backup',
	'verify',
	'startfail',
	'unhealthy',
	'timeout',
	'foreign'
]) {
	test(`cycle handles ${mode}`, { skip: !linux }, async () => {
		const f = await fixture(mode);
		try {
			const result = await f.run().done;
			assert.notEqual(result.code, 0, result.output);
			const calls = await f.calls(),
				starts = calls.filter((c) => c[0] === 'start').map((c) => c[1]);
			if (mode === 'foreign') {
				assert.deepEqual(starts, []);
				assert.ok(!calls.some((c) => c[0] === 'stop'));
			} else assert.deepEqual(starts, ['db', 'app']);
		} finally {
			await f.cleanup();
		}
	});
}
async function waiting(f) {
	for (let i = 0; i < 100; i++) {
		try {
			await readFile(join(f.dir, 'waiting'));
			return;
		} catch (error) {
			if (error.code !== 'ENOENT') throw error;
		}
		await new Promise((r) => setTimeout(r, 20));
	}
	throw new Error('Backup stub did not start');
}
for (const signal of ['SIGINT', 'SIGTERM'])
	test(`cycle recovers after ${signal}`, { skip: !linux }, async () => {
		const f = await fixture('wait');
		try {
			const task = f.run();
			await waiting(f);
			task.child.kill(signal);
			const result = await task.done;
			assert.equal(result.code, signal === 'SIGINT' ? 130 : 143, result.output);
			assert.deepEqual(
				(await f.calls()).filter((c) => c[0] === 'start').map((c) => c[1]),
				['db', 'app']
			);
		} finally {
			await f.cleanup();
		}
	});
test('cycle rejects concurrent capture before stopping containers', { skip: !linux }, async () => {
	const f = await fixture('wait');
	try {
		const first = f.run();
		await waiting(f);
		const second = await f.run().done;
		assert.equal(second.code, 1, second.output);
		assert.match(second.output, /Another backup cycle/);
		assert.equal((await first.done).code, 0);
		assert.equal((await f.calls()).filter((c) => c[0] === 'stop').length, 2);
	} finally {
		await f.cleanup();
	}
});
