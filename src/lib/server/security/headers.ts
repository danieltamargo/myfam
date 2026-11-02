import type { Handle } from '@sveltejs/kit';

export const handleSecurityHeaders: Handle = async ({ event, resolve }) => {
	const resolved = await resolve(event);
	const response = new Response(resolved.body, resolved);
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
	return response;
};
