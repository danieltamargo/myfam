import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';

function handlerFor(profileResult) {
	let handler;
	let adminReads = 0;
	let deleted = false;
	const service = {
		auth: {
			getUser: async () => ({ data: { user: { id: 'synthetic-user' } }, error: null }),
			admin: {
				deleteUser: async () => {
					deleted = true;
					return { error: null };
				}
			}
		},
		from: () => {
			adminReads += 1;
			const query = {
				select: () => query,
				eq: () => query,
				then: (done) => Promise.resolve({ data: [], error: null }).then(done)
			};
			return query;
		}
	};
	const source = readFileSync(
		new URL('../supabase/functions/delete-account/index.ts', import.meta.url),
		'utf8'
	).replace("import { createClient } from 'jsr:@supabase/supabase-js@2';", '');
	runInNewContext(stripTypeScriptTypes(source), {
		Request,
		Response,
		atob,
		Deno: {
			env: { get: (name) => (name === 'SUPABASE_SECRET_KEYS' ? undefined : 'synthetic-value') },
			serve: (callback) => {
				handler = callback;
			}
		},
		createClient: (_url, _key, options) =>
			options.global ? { rpc: () => ({ maybeSingle: async () => profileResult }) } : service
	});
	return {
		request: () =>
			handler(
				new Request('https://example.test/delete-account', {
					method: 'POST',
					headers: {
						Authorization: `Bearer synthetic.${Buffer.from(JSON.stringify({ aal: 'aal2' })).toString('base64url')}.synthetic`
					}
				})
			),
		state: () => ({ adminReads, deleted })
	};
}

test('account deletion rejects disabled or recovery-revoked AAL2 sessions before privileged reads', async () => {
	for (const result of [
		{ data: null, error: { code: '42501' } },
		{ data: null, error: null },
		{ data: { id: 'another-user' }, error: null }
	]) {
		const app = handlerFor(result);
		assert.equal((await app.request()).status, 403);
		assert.deepEqual(app.state(), { adminReads: 0, deleted: false });
	}
});

test('account deletion proceeds for a verified AAL2 account with authorized profile access', async () => {
	const app = handlerFor({ data: { id: 'synthetic-user' }, error: null });
	assert.equal((await app.request()).status, 200);
	assert.deepEqual(app.state(), { adminReads: 1, deleted: true });
});
