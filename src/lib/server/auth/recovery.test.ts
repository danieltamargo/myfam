import { describe, expect, it, vi } from 'vitest';
import { hashRecoveryCode, recoverMfa, replaceRecoveryCodes } from './recovery';

const code = '01234567-89abcdef-01234567-89abcdef';
const user = { id: 'user-a', email: 'recovery@example.test' };

function context() {
	const issuedToken = `header.${Buffer.from(JSON.stringify({ session_id: 'new-session' })).toString('base64url')}.signature`;
	const passwordClient = {
		auth: {
			signInWithPassword: vi
				.fn()
				.mockResolvedValueOnce({
					data: { user, session: { access_token: 'first-factor' } },
					error: null
				})
				.mockResolvedValueOnce({
					data: { user, session: { access_token: issuedToken, refresh_token: 'refresh' } },
					error: null
				}),
			signOut: vi.fn().mockResolvedValue({ error: null })
		}
	};
	const admin = {
		rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
		auth: {
			admin: {
				updateUserById: vi.fn().mockResolvedValue({ error: null }),
				signOut: vi.fn().mockResolvedValue({ error: null }),
				mfa: {
					listFactors: vi
						.fn()
						.mockResolvedValue({ data: { factors: [{ id: 'old-factor' }] }, error: null }),
					deleteFactor: vi.fn().mockResolvedValue({ error: null })
				}
			}
		}
	};
	const cookieClient = { auth: { setSession: vi.fn().mockResolvedValue({ error: null }) } };
	const args = {
		user,
		password: 'old-password',
		newPassword: 'new-password-for-recovery',
		code,
		admin,
		passwordClient,
		cookieClient
	} as unknown as Parameters<typeof recoverMfa>[0];
	return { args, admin, passwordClient, cookieClient };
}

describe('MFA recovery', () => {
	it('normalizes only valid 128-bit recovery codes', () => {
		expect(hashRecoveryCode(code.toUpperCase())).toBe(hashRecoveryCode(code.replaceAll('-', '')));
		expect(hashRecoveryCode('123456')).toBeNull();
		expect(hashRecoveryCode('z'.repeat(32))).toBeNull();
	});

	it('returns fresh codes once while sending only their hashes to the database', async () => {
		const rpc = vi.fn().mockResolvedValue({ error: null });
		const codes = await replaceRecoveryCodes({ rpc } as never);
		expect(codes).toHaveLength(8);
		expect(new Set(codes).size).toBe(8);
		expect(codes.every((value) => /^[a-f0-9]{8}(-[a-f0-9]{8}){3}$/.test(value))).toBe(true);
		expect(rpc).toHaveBeenCalledWith('replace_my_mfa_recovery_codes', {
			p_hashes: codes.map(hashRecoveryCode)
		});
	});

	it('revokes without returning codes and fails closed when generation is denied', async () => {
		const rpc = vi.fn().mockResolvedValue({ error: null });
		await expect(replaceRecoveryCodes({ rpc } as never, true)).resolves.toEqual([]);
		expect(rpc).toHaveBeenCalledWith('replace_my_mfa_recovery_codes', { p_hashes: [] });
		rpc.mockResolvedValue({ error: new Error('denied') });
		await expect(replaceRecoveryCodes({ rpc } as never)).rejects.toMatchObject({ status: 403 });
	});

	it('changes credentials, revokes sessions and binds the server-issued recovery session before setting cookies', async () => {
		const { args, admin, passwordClient, cookieClient } = context();
		await recoverMfa(args);
		expect(admin.rpc).toHaveBeenNthCalledWith(1, 'begin_mfa_recovery', {
			p_user_id: user.id,
			p_code_hash: hashRecoveryCode(code),
			p_job_id: expect.any(String)
		});
		expect(admin.auth.admin.signOut).toHaveBeenCalledWith('first-factor', 'global');
		expect(admin.auth.admin.updateUserById).toHaveBeenCalledWith(user.id, {
			password: args.newPassword
		});
		expect(admin.auth.admin.mfa.deleteFactor).toHaveBeenCalledWith({
			userId: user.id,
			id: 'old-factor'
		});
		expect(admin.rpc).toHaveBeenNthCalledWith(2, 'bind_mfa_recovery_session', {
			p_user_id: user.id,
			p_job_id: expect.any(String),
			p_session_id: 'new-session'
		});
		expect(cookieClient.auth.setSession).toHaveBeenCalledOnce();
		expect(admin.rpc.mock.invocationCallOrder[1]).toBeLessThan(
			cookieClient.auth.setSession.mock.invocationCallOrder[0]
		);
		expect(passwordClient.auth.signOut).not.toHaveBeenCalled();
	});

	it('never attempts code consumption or admin changes with the wrong password', async () => {
		const { args, admin, passwordClient, cookieClient } = context();
		passwordClient.auth.signInWithPassword
			.mockReset()
			.mockResolvedValue({ data: { session: null }, error: new Error('invalid') });
		await expect(recoverMfa(args)).rejects.toMatchObject({ status: 400 });
		expect(admin.rpc).not.toHaveBeenCalled();
		expect(cookieClient.auth.setSession).not.toHaveBeenCalled();
	});

	it('rejects spent or foreign codes without removing factors and closes its temporary session', async () => {
		const { args, admin, passwordClient } = context();
		admin.rpc.mockResolvedValue({ data: false, error: null });
		await expect(recoverMfa(args)).rejects.toMatchObject({ status: 400 });
		expect(admin.auth.admin.updateUserById).not.toHaveBeenCalled();
		expect(admin.auth.admin.mfa.deleteFactor).not.toHaveBeenCalled();
		expect(passwordClient.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
	});

	it('keeps recovery locked and withholds cookies when factor removal or session binding fails', async () => {
		for (const step of ['delete', 'bind']) {
			const { args, admin, cookieClient } = context();
			if (step === 'delete')
				admin.auth.admin.mfa.deleteFactor.mockResolvedValue({ error: new Error('unavailable') });
			else
				admin.rpc
					.mockResolvedValueOnce({ data: true, error: null })
					.mockResolvedValueOnce({ data: null, error: new Error('conflict') });
			await expect(recoverMfa(args)).rejects.toMatchObject({ status: 503 });
			expect(cookieClient.auth.setSession).not.toHaveBeenCalled();
			expect(admin.rpc).not.toHaveBeenCalledWith('complete_my_mfa_recovery');
		}
	});

	it('rejects unchanged passwords and OAuth-only users before admin operations', async () => {
		const { args, admin } = context();
		await expect(recoverMfa({ ...args, newPassword: args.password })).rejects.toMatchObject({
			status: 400
		});
		await expect(
			recoverMfa({ ...args, user: { ...args.user, email: undefined } })
		).rejects.toMatchObject({ status: 400 });
		expect(admin.rpc).not.toHaveBeenCalled();
	});
});
