import { describe, expect, it, vi } from 'vitest';
import { createSafeSessionReader } from './session';

function client() {
	return {
		auth: {
			getSession: vi.fn().mockResolvedValue({
				data: { session: { access_token: 'test-token', user: { id: 'unverified-cookie-user' } } },
				error: null
			}),
			getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'verified-user' } }, error: null })
		}
	};
}

describe('request-scoped verified session', () => {
	it('shares concurrent verification only within the same request and replaces cookie user data', async () => {
		const supabase = client();
		const read = createSafeSessionReader(supabase as never);
		const results = await Promise.all([read(), read(), read()]);
		expect(supabase.auth.getSession).toHaveBeenCalledOnce();
		expect(supabase.auth.getUser).toHaveBeenCalledExactlyOnceWith('test-token');
		for (const result of results) {
			expect(result.user?.id).toBe('verified-user');
			expect(result.session?.user.id).toBe('verified-user');
		}
		await createSafeSessionReader(supabase as never)();
		expect(supabase.auth.getUser).toHaveBeenCalledTimes(2);
	});

	it('does not accept a session whose identity cannot be verified', async () => {
		const supabase = client();
		supabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error('rejected') });
		await expect(createSafeSessionReader(supabase as never)()).resolves.toEqual({
			session: null,
			user: null
		});
	});

	it('does not query identity for an absent session', async () => {
		const supabase = client();
		supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
		await expect(createSafeSessionReader(supabase as never)()).resolves.toEqual({
			session: null,
			user: null
		});
		expect(supabase.auth.getUser).not.toHaveBeenCalled();
	});
});
