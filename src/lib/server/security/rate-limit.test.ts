import { describe, expect, it, vi } from 'vitest';
import { createIdentityMutationRateLimit, createMutationRateLimit } from './rate-limit';

function request(address = '192.0.2.1', method = 'POST') {
	return {
		event: {
			request: new Request('https://example.test/action', { method }),
			getClientAddress: () => address
		},
		resolve: vi.fn().mockResolvedValue(new Response('ok'))
	};
}

describe('mutation rate limit', () => {
	it('blocks excess writes before resolving and gives a retry window', async () => {
		const handle = createMutationRateLimit({ limit: 2 }, () => 1000);
		await handle(request() as never);
		await handle(request() as never);
		const blocked = request();
		const response = await handle(blocked as never);
		expect(response.status).toBe(429);
		expect(response.headers.get('Retry-After')).toBe('60');
		expect(response.headers.get('Cache-Control')).toBe('no-store');
		expect(blocked.resolve).not.toHaveBeenCalled();
	});

	it('isolates clients and restores access when the window expires', async () => {
		let time = 1000;
		const handle = createMutationRateLimit({ limit: 1 }, () => time);
		expect((await handle(request() as never)).status).toBe(200);
		expect((await handle(request('192.0.2.2') as never)).status).toBe(200);
		expect((await handle(request() as never)).status).toBe(429);
		time += 60_000;
		expect((await handle(request() as never)).status).toBe(200);
	});

	it.each(['GET', 'HEAD', 'OPTIONS'])('does not consume write quota on %s', async (method) => {
		const handle = createMutationRateLimit({ limit: 1 });
		await handle(request() as never);
		expect((await handle(request('192.0.2.1', method) as never)).status).toBe(200);
	});

	it('bounds client memory without evicting existing limits', async () => {
		const handle = createMutationRateLimit({ limit: 2, maxClients: 1 });
		await handle(request() as never);
		expect((await handle(request('192.0.2.2') as never)).status).toBe(429);
		expect((await handle(request() as never)).status).toBe(200);
		expect((await handle(request() as never)).status).toBe(429);
	});
});

function authenticatedRequest(userId: string | null, address = '192.0.2.1', method = 'POST') {
	const context = request(address, method);
	return {
		...context,
		event: {
			...context.event,
			locals: {
				safeGetSession: vi.fn().mockResolvedValue({
					user: userId ? { id: userId } : null,
					session: userId ? {} : null
				})
			}
		}
	};
}

describe('verified identity mutation rate limit', () => {
	it('keeps the same account quota across addresses and ignores claimed identities in headers', async () => {
		const handle = createIdentityMutationRateLimit({ limit: 1 }, () => 1000);
		expect((await handle(authenticatedRequest('account-a') as never)).status).toBe(200);
		const second = authenticatedRequest('account-a', '192.0.2.2');
		second.event.request = new Request(second.event.request, {
			headers: { 'X-User-Id': 'account-b', 'X-Forwarded-For': '192.0.2.99' }
		});
		const response = await handle(second as never);
		expect(response.status).toBe(429);
		expect(response.headers.get('Retry-After')).toBe('60');
		expect(second.resolve).not.toHaveBeenCalled();
	});

	it('keeps account quotas independent even behind the same address', async () => {
		const handle = createIdentityMutationRateLimit({ limit: 1 });
		expect((await handle(authenticatedRequest('account-a') as never)).status).toBe(200);
		expect((await handle(authenticatedRequest('account-b') as never)).status).toBe(200);
		expect((await handle(authenticatedRequest('account-a') as never)).status).toBe(429);
	});

	it('expires the account window and bounds identities without allocating entries for guests', async () => {
		let time = 1000;
		const handle = createIdentityMutationRateLimit({ limit: 1, maxClients: 1 }, () => time);
		await handle(authenticatedRequest(null) as never);
		expect((await handle(authenticatedRequest('account-a') as never)).status).toBe(200);
		expect((await handle(authenticatedRequest('account-b') as never)).status).toBe(429);
		time += 60_000;
		expect((await handle(authenticatedRequest('account-b') as never)).status).toBe(200);
	});

	it.each(['GET', 'HEAD', 'OPTIONS'])(
		'does not verify or consume an identity quota on %s',
		async (method) => {
			const context = authenticatedRequest('account-a', '192.0.2.1', method);
			await createIdentityMutationRateLimit()(context as never);
			expect(context.event.locals.safeGetSession).not.toHaveBeenCalled();
		}
	);

	it('does not execute the mutation when identity verification unexpectedly fails', async () => {
		const context = authenticatedRequest('account-a');
		context.event.locals.safeGetSession.mockRejectedValue(new Error('unavailable'));
		await expect(createIdentityMutationRateLimit()(context as never)).rejects.toThrow(
			'unavailable'
		);
		expect(context.resolve).not.toHaveBeenCalled();
	});
});
