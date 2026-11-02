import type { Handle, RequestEvent } from '@sveltejs/kit';

function createRateLimit(
	keyFor: (event: RequestEvent) => string | null | Promise<string | null>,
	{ limit = 120, windowMs = 60_000, maxClients = 10_000 } = {},
	now = Date.now
): Handle {
	const clients = new Map<string, number>();
	let resetAt = 0;

	return async ({ event, resolve }) => {
		if (['GET', 'HEAD', 'OPTIONS'].includes(event.request.method)) return resolve(event);
		const key = await keyFor(event);
		if (key === null) return resolve(event);

		const currentTime = now();
		if (currentTime >= resetAt) {
			clients.clear();
			resetAt = currentTime + windowMs;
		}

		const count = clients.get(key) ?? 0;
		if (count >= limit || (count === 0 && clients.size >= maxClients)) {
			return new Response('Demasiadas solicitudes. Inténtalo de nuevo en unos segundos.', {
				status: 429,
				headers: {
					'Retry-After': String(Math.max(1, Math.ceil((resetAt - currentTime) / 1000))),
					'Cache-Control': 'no-store',
					'Content-Type': 'text/plain; charset=utf-8'
				}
			});
		}

		clients.set(key, count + 1);
		return resolve(event);
	};
}

export function createMutationRateLimit(
	options: { limit?: number; windowMs?: number; maxClients?: number } = {},
	now = Date.now
): Handle {
	return createRateLimit((event) => event.getClientAddress(), options, now);
}

export function createIdentityMutationRateLimit(
	options: { limit?: number; windowMs?: number; maxClients?: number } = {},
	now = Date.now
): Handle {
	return createRateLimit(
		async (event) => (await event.locals.safeGetSession()).user?.id ?? null,
		{ limit: 60, ...options },
		now
	);
}

export const handleMutationRateLimit = createMutationRateLimit();
export const handleIdentityMutationRateLimit = createIdentityMutationRateLimit();
