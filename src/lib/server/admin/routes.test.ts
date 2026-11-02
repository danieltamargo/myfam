import { beforeEach, describe, expect, it, vi } from 'vitest';

const { env, getSupabaseAdmin } = vi.hoisted(() => ({
	env: {
		SUPER_ADMIN_USER_IDS: '98000000-0000-4000-8000-000000000001',
		ORIGIN: 'https://app.example.test'
	},
	getSupabaseAdmin: vi.fn()
}));
vi.mock('$env/dynamic/private', () => ({ env }));
vi.mock('$lib/supabase-admin', () => ({ getSupabaseAdmin }));
import { actions, load } from '../../../routes/(protected)/admin/+page.server';

const actor = '98000000-0000-4000-8000-000000000001';
const target = '98000000-0000-4000-8000-000000000003';
function event(userId: string | null = actor, fields: Record<string, string> = {}, level = 'aal2') {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.set(key, value);
	return {
		url: new URL('https://app.example.test/admin'),
		request: new Request('https://app.example.test/admin', { method: 'POST', body }),
		setHeaders: vi.fn(),
		locals: {
			supabase: {
				rpc: vi.fn().mockReturnValue({
					maybeSingle: vi.fn().mockResolvedValue({ data: { id: userId }, error: null })
				}),
				auth: {
					getUser: vi
						.fn()
						.mockResolvedValue({ data: { user: userId ? { id: userId } : null }, error: null }),
					mfa: {
						getAuthenticatorAssuranceLevel: vi
							.fn()
							.mockResolvedValue({ data: { currentLevel: level }, error: null })
					}
				}
			}
		}
	};
}

function service() {
	const query = {
		select: vi.fn().mockReturnThis(),
		order: vi.fn().mockReturnThis(),
		range: vi.fn().mockResolvedValue({ data: [], error: null })
	};
	return {
		query,
		from: vi.fn(() => query),
		rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
		auth: {
			resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
			admin: {
				listUsers: vi.fn().mockResolvedValue({ data: { users: [], nextPage: null }, error: null }),
				inviteUserByEmail: vi
					.fn()
					.mockResolvedValue({ data: { user: { id: target } }, error: null }),
				getUserById: vi.fn().mockResolvedValue({
					data: { user: { id: target, email: 'fixture@example.test' } },
					error: null
				}),
				updateUserById: vi.fn().mockResolvedValue({ error: null })
			}
		}
	};
}

describe('administration server routes', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});
	it.each([null, target])(
		'denies load and all mutations before acquiring service privileges for %s',
		async (id) => {
			await expect(load(event(id) as never)).rejects.toMatchObject({ status: id ? 403 : 401 });
			for (const action of Object.values(actions))
				await expect(action!(event(id) as never)).rejects.toMatchObject({ status: id ? 403 : 401 });
			expect(getSupabaseAdmin).not.toHaveBeenCalled();
		}
	);
	it('rejects listed AAL1 users before acquiring service privileges', async () => {
		await expect(actions.create!(event(actor, {}, 'aal1') as never)).rejects.toMatchObject({
			status: 403
		});
		expect(getSupabaseAdmin).not.toHaveBeenCalled();
	});
	it('loads only allowlisted fields with bounded independent pages and disables caching', async () => {
		const client = service();
		getSupabaseAdmin.mockReturnValue(client);
		const context = event();
		context.url.search = '?page=2&businessPage=3&authPage=4';
		await load(context as never);
		expect(client.auth.admin.listUsers).toHaveBeenCalledWith({ page: 2, perPage: 25 });
		expect(client.query.range).toHaveBeenCalledWith(50, 75);
		expect(client.query.select.mock.calls[0][0]).not.toContain('metadata');
		expect(client.rpc).toHaveBeenCalledWith('admin_auth_events', { p_limit: 26, p_offset: 75 });
		expect(context.setHeaders).toHaveBeenCalledWith({ 'cache-control': 'private, no-store' });
	});
	it('validates new users before acquiring the service client', async () => {
		const result = await actions.create!(event(actor, { name: '', email: 'bad' }) as never);
		expect(result).toMatchObject({ status: 400 });
		expect(getSupabaseAdmin).not.toHaveBeenCalled();
	});
	it('invites through Auth with a trusted redirect and no editable authorization role', async () => {
		const client = service();
		getSupabaseAdmin.mockReturnValue(client);
		const result = await actions.create!(
			event(actor, { name: 'Lucía', email: 'lucia@example.test' }) as never
		);
		expect(result).toMatchObject({ success: expect.any(String) });
		expect(client.auth.admin.inviteUserByEmail).toHaveBeenCalledWith('lucia@example.test', {
			data: { name: 'Lucía' },
			redirectTo: 'https://app.example.test/reset-password'
		});
		expect(client.rpc.mock.calls.map((call) => call[1].p_status)).toEqual(['pending', 'succeeded']);
		expect(client.rpc.mock.calls[1][1].p_target).toBe(target);
	});
	it('resends welcome for existing users through recovery rather than duplicate invitations', async () => {
		const client = service();
		getSupabaseAdmin.mockReturnValue(client);
		await actions.welcome!(event(actor, { userId: target }) as never);
		expect(client.auth.resetPasswordForEmail).toHaveBeenCalledWith('fixture@example.test', {
			redirectTo: 'https://app.example.test/reset-password'
		});
		expect(client.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
	});
	it('requires an explicit disable confirmation on the server', async () => {
		const result = await actions.disable!(event(actor, { userId: target }) as never);
		expect(result).toMatchObject({ status: 400 });
		expect(getSupabaseAdmin).not.toHaveBeenCalled();
	});
	it('rejects welcome redirects for a request origin that differs from the configured origin', async () => {
		const client = service();
		getSupabaseAdmin.mockReturnValue(client);
		const context = event(actor, { userId: target });
		context.url = new URL('https://evil.example.test/admin');
		const result = await actions.welcome!(context as never);
		expect(result).toMatchObject({ status: 503 });
		expect(client.auth.resetPasswordForEmail).not.toHaveBeenCalled();
		expect(client.rpc.mock.calls.map((call) => call[1].p_status)).toEqual(['pending', 'failed']);
	});
	it('does not expose provider diagnostics in a failed mail response or audit', async () => {
		const client = service();
		getSupabaseAdmin.mockReturnValue(client);
		client.auth.resetPasswordForEmail.mockResolvedValue({
			error: { message: 'provider-secret' }
		} as never);
		const result = await actions.welcome!(event(actor, { userId: target }) as never);
		expect(result).toMatchObject({ status: 503 });
		expect(JSON.stringify([result, client.rpc.mock.calls])).not.toContain('provider-secret');
	});
});
