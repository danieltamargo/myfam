import { describe, expect, it, vi } from 'vitest';
import { handleProtectedRoutes } from './protected';

function requestContext(
	routeId: string | null,
	method = 'GET',
	currentLevel = 'aal1',
	nextLevel = 'aal2'
) {
	const safeGetSession = vi.fn().mockResolvedValue({ user: { id: 'user-a' }, session: {} });
	const getAuthenticatorAssuranceLevel = vi.fn().mockResolvedValue({
		data: { currentLevel, nextLevel },
		error: null
	});
	const event = {
		route: { id: routeId },
		url: new URL('https://example.test/family/family-a/tasks'),
		request: new Request('https://example.test/family/family-a/tasks', { method }),
		locals: {
			safeGetSession,
			supabase: {
				auth: { mfa: { getAuthenticatorAssuranceLevel } },
				rpc: vi.fn().mockReturnValue({
					single: vi.fn().mockResolvedValue({
						data: { required: false, pending: false, session_valid: true, allowed: null },
						error: null
					})
				})
			}
		}
	};
	const resolve = vi.fn().mockResolvedValue(new Response('ok'));
	return { event, resolve, safeGetSession, getAuthenticatorAssuranceLevel };
}

describe('protected request guard', () => {
	it.each([
		['/(protected)/family/[familyId]/tasks', 'GET'],
		['/(protected)/family/[familyId]/tasks', 'POST'],
		['/(protected)/family/[familyId]/expenses/[collectionId]/export', 'GET']
	])('blocks pending MFA before resolving %s (%s)', async (routeId, method) => {
		const context = requestContext(routeId, method);
		await expect(handleProtectedRoutes(context as never)).rejects.toMatchObject({
			status: 303,
			location: expect.stringContaining('/verify-2fa?next=')
		});
		expect(context.resolve).not.toHaveBeenCalled();
	});

	it('blocks unauthenticated mutations before resolving them', async () => {
		const context = requestContext('/(protected)/families', 'POST');
		context.safeGetSession.mockResolvedValue({ user: null, session: null });
		await expect(handleProtectedRoutes(context as never)).rejects.toMatchObject({
			status: 303,
			location: '/login'
		});
		expect(context.resolve).not.toHaveBeenCalled();
		expect(context.getAuthenticatorAssuranceLevel).not.toHaveBeenCalled();
	});

	it.each([
		['aal1', 'aal1'],
		['aal2', 'aal2']
	])('allows authenticated requests at %s when next level is %s', async (current, next) => {
		const context = requestContext('/(protected)/families', 'POST', current, next);
		await expect(handleProtectedRoutes(context as never)).resolves.toBeInstanceOf(Response);
		expect(context.resolve).toHaveBeenCalledOnce();
	});

	it('fails closed when the assurance service is unavailable', async () => {
		const context = requestContext('/(protected)/families', 'POST');
		context.getAuthenticatorAssuranceLevel.mockResolvedValue({
			data: null,
			error: new Error('unavailable')
		});
		await expect(handleProtectedRoutes(context as never)).rejects.toMatchObject({ status: 503 });
		expect(context.resolve).not.toHaveBeenCalled();
	});

	it.each(['/verify-2fa', '/auth/callback', '/login', '/(protected-public)/example', null])(
		'leaves public route %s available without checking sessions',
		async (routeId) => {
			const context = requestContext(routeId);
			await handleProtectedRoutes(context as never);
			expect(context.safeGetSession).not.toHaveBeenCalled();
			expect(context.resolve).toHaveBeenCalledOnce();
		}
	);
});
