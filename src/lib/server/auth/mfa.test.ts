import { describe, expect, it, vi } from 'vitest';
import { enforceMfaForProtectedRoute } from './mfa';

function supabaseWithAal(
	currentLevel: 'aal1' | 'aal2' | null,
	nextLevel: 'aal1' | 'aal2' | null,
	error: Error | null = null
) {
	const getAuthenticatorAssuranceLevel = vi.fn().mockResolvedValue({
		data: error ? null : { currentLevel, nextLevel, currentAuthenticationMethods: [] },
		error
	});

	return {
		client: {
			auth: { mfa: { getAuthenticatorAssuranceLevel } },
			rpc: vi.fn().mockReturnValue({
				single: vi.fn().mockResolvedValue({
					data: { required: false, pending: false, session_valid: true, allowed: null },
					error: null
				})
			})
		},
		getAuthenticatorAssuranceLevel
	};
}

describe('enforceMfaForProtectedRoute', () => {
	it('no fuerza 2FA a un usuario sin factor verificado', async () => {
		const { client } = supabaseWithAal('aal1', 'aal1');

		await expect(
			enforceMfaForProtectedRoute(client as never, new URL('http://localhost/dashboard'))
		).resolves.toBeUndefined();
	});

	it('redirige una sesión AAL1 elevable y conserva la ruta protegida directa', async () => {
		const { client } = supabaseWithAal('aal1', 'aal2');

		await expect(
			enforceMfaForProtectedRoute(
				client as never,
				new URL('http://localhost/family/family-a?tab=members')
			)
		).rejects.toMatchObject({
			status: 303,
			location: '/verify-2fa?next=%2Ffamily%2Ffamily-a%3Ftab%3Dmembers'
		});
	});

	it('permite continuar a una sesión AAL2', async () => {
		const { client } = supabaseWithAal('aal2', 'aal2');

		await expect(
			enforceMfaForProtectedRoute(client as never, new URL('http://localhost/dashboard'))
		).resolves.toBeUndefined();
	});

	it('evita un bucle si se evalúa la propia pantalla de verificación', async () => {
		const { client, getAuthenticatorAssuranceLevel } = supabaseWithAal('aal1', 'aal2');

		await expect(
			enforceMfaForProtectedRoute(
				client as never,
				new URL('http://localhost/verify-2fa?next=%2Fdashboard')
			)
		).resolves.toBeUndefined();
		expect(getAuthenticatorAssuranceLevel).not.toHaveBeenCalled();
	});

	it('falla cerrado si no puede comprobar el assurance level', async () => {
		const { client } = supabaseWithAal(null, null, new Error('auth unavailable'));

		await expect(
			enforceMfaForProtectedRoute(client as never, new URL('http://localhost/dashboard'))
		).rejects.toMatchObject({ status: 503 });
	});

	it('requires the bound session to reconfigure MFA even after all factors were removed', async () => {
		const { client } = supabaseWithAal('aal1', 'aal1');
		client.rpc.mockReturnValue({
			single: vi.fn().mockResolvedValue({
				data: { required: true, pending: false, session_valid: true, allowed: true },
				error: null
			})
		});
		await expect(
			enforceMfaForProtectedRoute(client as never, new URL('http://localhost/dashboard'))
		).rejects.toMatchObject({ status: 303, location: '/recover-2fa/setup' });
	});

	it('rejects an unbound AAL2 session during recovery', async () => {
		const { client } = supabaseWithAal('aal2', 'aal2');
		client.rpc.mockReturnValue({
			single: vi.fn().mockResolvedValue({
				data: { required: true, pending: false, session_valid: true, allowed: false },
				error: null
			})
		});
		await expect(
			enforceMfaForProtectedRoute(client as never, new URL('http://localhost/dashboard'))
		).rejects.toMatchObject({ status: 403 });
	});

	it('rejects an old session after recovery completed', async () => {
		const { client } = supabaseWithAal('aal2', 'aal2');
		client.rpc.mockReturnValue({
			single: vi.fn().mockResolvedValue({
				data: { required: false, pending: false, session_valid: false, allowed: null },
				error: null
			})
		});
		await expect(
			enforceMfaForProtectedRoute(client as never, new URL('http://localhost/dashboard'))
		).rejects.toMatchObject({ status: 303, location: '/login' });
	});
});
