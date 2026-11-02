import { describe, expect, it, vi } from 'vitest';
import { load } from './+layout.server';

describe('layout protegido', () => {
	it('bloquea una URL protegida directa antes de consultar datos con una sesión AAL1 elevable', async () => {
		const from = vi.fn();
		const supabase = {
			rpc: vi.fn().mockReturnValue({
				single: vi.fn().mockResolvedValue({
					data: { required: false, pending: false, session_valid: true, allowed: null },
					error: null
				})
			}),
			auth: {
				mfa: {
					getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({
						data: {
							currentLevel: 'aal1',
							nextLevel: 'aal2',
							currentAuthenticationMethods: []
						},
						error: null
					})
				}
			},
			from
		};

		await expect(
			load({
				url: new URL('http://localhost/family/family-a?tab=members'),
				locals: {
					safeGetSession: vi.fn().mockResolvedValue({
						user: { id: 'user-a' },
						session: { access_token: 'token' }
					}),
					supabase
				}
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/verify-2fa?next=%2Ffamily%2Ffamily-a%3Ftab%3Dmembers'
		});

		expect(from).not.toHaveBeenCalled();
	});
});
