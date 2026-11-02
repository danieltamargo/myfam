import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bootstrapAdmin } from './bootstrap-admin.mjs';

const id = '98000000-0000-4000-8000-000000000001';
async function fixture(t, content = '') {
	const directory = await mkdtemp(join(tmpdir(), 'myfamily-admin-'));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const file = join(directory, 'app.env');
	await writeFile(
		file,
		`SUPABASE_PROJECT_URL=https://api.example.test\nSUPABASE_SECRET_KEY=synthetic$literal\nORIGIN=https://app.example.test\n${content}`,
		{ mode: 0o600 }
	);
	return file;
}

test('bootstrap preserves raw environment secrets and uses an existing account without sending email', async (t) => {
	const file = await fixture(t);
	let calls = 0;
	await bootstrapAdmin(file, 'Admin@Example.test', (url, secret) => {
		assert.equal(url, 'https://api.example.test');
		assert.equal(secret, 'synthetic$literal');
		return {
			auth: {
				admin: {
					listUsers: async () => {
						calls++;
						return { data: { users: [{ id, email: 'admin@example.test' }] }, error: null };
					}
				}
			}
		};
	});
	assert.equal(calls, 1);
	const result = await readFile(file, 'utf8');
	assert.match(result, /SUPABASE_SECRET_KEY=synthetic\$literal/);
	assert.match(result, new RegExp(`SUPER_ADMIN_USER_IDS=${id}\\n$`));
});

test('bootstrap invites missing account using the password setup page and preserves allowlist', async (t) => {
	const existing = '98000000-0000-4000-8000-000000000002';
	const file = await fixture(t, `SUPER_ADMIN_USER_IDS=${existing}\n`);
	await bootstrapAdmin(file, 'new@example.test', () => ({
		auth: {
			admin: {
				listUsers: async () => ({ data: { users: [], nextPage: null }, error: null }),
				inviteUserByEmail: async (email, options) => {
					assert.equal(email, 'new@example.test');
					assert.equal(options.redirectTo, 'https://app.example.test/reset-password');
					return { data: { user: { id } }, error: null };
				}
			}
		}
	}));
	assert.match(await readFile(file, 'utf8'), new RegExp(`SUPER_ADMIN_USER_IDS=${existing},${id}`));
});

test('bootstrap stops on lookup failure without writing or sending invites', async (t) => {
	const file = await fixture(t);
	const before = await readFile(file, 'utf8');
	await assert.rejects(
		bootstrapAdmin(file, 'new@example.test', () => ({
			auth: {
				admin: {
					listUsers: async () => ({ data: null, error: { message: 'do not print secret' } })
				}
			}
		})),
		/consultar los usuarios/
	);
	assert.equal(await readFile(file, 'utf8'), before);
});

test('bootstrap refuses a malformed existing allowlist before connecting', async (t) => {
	const file = await fixture(t, 'SUPER_ADMIN_USER_IDS=bad\n');
	await assert.rejects(
		bootstrapAdmin(file, 'new@example.test', () => {
			throw new Error('must not connect');
		}),
		/identificador no válido/
	);
});
