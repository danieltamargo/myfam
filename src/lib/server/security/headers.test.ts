import { describe, expect, it, vi } from 'vitest';
import { handleSecurityHeaders } from './headers';

describe('security response headers', () => {
	it.each([200, 404, 500])(
		'preserves the response and applies browser protections (%s)',
		async (status) => {
			const original = new Response('response body', {
				status,
				headers: { 'Content-Type': 'text/plain', 'Set-Cookie': 'session=example; HttpOnly' }
			});
			const response = await handleSecurityHeaders({
				event: {},
				resolve: vi.fn().mockResolvedValue(original)
			} as never);

			expect(response.status).toBe(status);
			expect(await response.text()).toBe('response body');
			expect(response.headers.get('Content-Type')).toBe('text/plain');
			expect(response.headers.get('Set-Cookie')).toBe('session=example; HttpOnly');
			expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
			expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
			expect(response.headers.get('X-Frame-Options')).toBe('DENY');
			expect(response.headers.get('Permissions-Policy')).toBe(
				'camera=(), microphone=(), geolocation=()'
			);
			expect(response.headers.has('Strict-Transport-Security')).toBe(false);
		}
	);

	it('supports redirects with immutable headers', async () => {
		const response = await handleSecurityHeaders({
			event: {},
			resolve: vi.fn().mockResolvedValue(Response.redirect('https://example.test/login', 303))
		} as never);

		expect(response.status).toBe(303);
		expect(response.headers.get('Location')).toBe('https://example.test/login');
		expect(response.headers.get('X-Frame-Options')).toBe('DENY');
	});
});
