import { beforeEach, describe, expect, it, vi } from 'vitest';

const { env } = vi.hoisted(() => ({ env: { SUPER_ADMIN_USER_IDS: '' } }));
vi.mock('$env/dynamic/private', () => ({ env }));
import { requireSuperAdmin, superAdminIds } from './access';

const adminId = '98000000-0000-4000-8000-000000000001';
const otherId = '98000000-0000-4000-8000-000000000002';

function context(id: string | null, level = 'aal2') {
	return {
		supabase: {
			rpc: vi
				.fn()
				.mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id }, error: null }) }),
			auth: {
				getUser: vi.fn().mockResolvedValue({
					data: { user: id ? { id, user_metadata: { role: 'super_admin' } } : null },
					error: null
				}),
				mfa: {
					getAuthenticatorAssuranceLevel: vi
						.fn()
						.mockResolvedValue({ data: { currentLevel: level }, error: null })
				}
			}
		}
	};
}

describe('superadministrator authorization', () => {
	beforeEach(() => {
		env.SUPER_ADMIN_USER_IDS = adminId;
	});
	it('fails closed for missing or malformed lists and accepts trimmed UUIDs', () => {
		expect([...superAdminIds('')]).toEqual([]);
		expect([...superAdminIds(`${adminId},not-a-uuid`)]).toEqual([]);
		expect([...superAdminIds(` ${adminId.toUpperCase()}, ${otherId} `)]).toEqual([
			adminId,
			otherId
		]);
	});
	it('requires a remotely verified identity', async () => {
		const locals = context(null);
		await expect(requireSuperAdmin(locals as never)).rejects.toMatchObject({ status: 401 });
		expect(locals.supabase.auth.mfa.getAuthenticatorAssuranceLevel).not.toHaveBeenCalled();
	});
	it('ignores editable role metadata and rejects normal family administrators', async () => {
		const locals = context(otherId);
		await expect(requireSuperAdmin(locals as never)).rejects.toMatchObject({ status: 403 });
		expect(locals.supabase.auth.mfa.getAuthenticatorAssuranceLevel).not.toHaveBeenCalled();
	});
	it('requires AAL2 even when the allowed account has no enrolled factor', async () => {
		await expect(requireSuperAdmin(context(adminId, 'aal1') as never)).rejects.toMatchObject({
			status: 403
		});
	});
	it('allows only the verified, listed AAL2 account', async () => {
		await expect(requireSuperAdmin(context(adminId) as never)).resolves.toMatchObject({
			id: adminId
		});
	});
	it('rejects disabled or recovery-revoked accounts through the existing SQL guard', async () => {
		const locals = context(adminId);
		locals.supabase.rpc.mockReturnValue({
			maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { code: '42501' } })
		});
		await expect(requireSuperAdmin(locals as never)).rejects.toMatchObject({ status: 403 });
	});
	it('fails closed when identity or MFA verification fails', async () => {
		const locals = context(adminId);
		locals.supabase.auth.getUser.mockResolvedValue({
			data: { user: null },
			error: { message: 'unavailable' }
		} as never);
		await expect(requireSuperAdmin(locals as never)).rejects.toMatchObject({ status: 401 });
		const mfa = context(adminId);
		mfa.supabase.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
			data: null,
			error: { message: 'unavailable' }
		} as never);
		await expect(requireSuperAdmin(mfa as never)).rejects.toMatchObject({ status: 401 });
	});
});
