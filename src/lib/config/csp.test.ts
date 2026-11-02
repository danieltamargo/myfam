import { describe, expect, it } from 'vitest';
import { createContentSecurityPolicy } from './csp.js';

describe('Content Security Policy', () => {
	it('uses native nonces/hashes and restricts active content', () => {
		const csp = createContentSecurityPolicy('https://project.supabase.co');
		expect(csp?.mode).toBe('auto');
		expect(csp?.directives).toMatchObject({
			'default-src': ['self'],
			'script-src': ['self'],
			'object-src': ['none'],
			'base-uri': ['self'],
			'form-action': ['self', 'https://project.supabase.co'],
			'frame-ancestors': ['none'],
			'connect-src': ['self', 'https://project.supabase.co', 'wss://project.supabase.co']
		});
	});

	it('supports local Supabase, storage previews and development HMR', () => {
		const directives = createContentSecurityPolicy('http://127.0.0.1:54321', true)?.directives;
		expect(directives?.['connect-src']).toEqual([
			'self',
			'http://127.0.0.1:54321',
			'ws://127.0.0.1:54321',
			'ws://localhost:*',
			'ws://127.0.0.1:*'
		]);
		expect(directives?.['img-src']).toEqual([
			'self',
			'data:',
			'blob:',
			'https:',
			'http://127.0.0.1:54321'
		]);
		expect(directives?.['style-src']).toEqual(['self', 'unsafe-inline']);
	});

	it('drops URL paths, query strings and fragments from allowed origins', () => {
		const csp = createContentSecurityPolicy('https://example.test/path?public=value#fragment');
		expect(csp?.directives?.['connect-src']).toEqual([
			'self',
			'https://example.test',
			'wss://example.test'
		]);
	});

	it.each(['javascript:alert(1)', 'data:text/html,test', 'https://user:password@example.test'])(
		'rejects non-HTTP origins and embedded credentials: %s',
		(url) => {
			expect(() => createContentSecurityPolicy(url)).toThrow();
		}
	);

	it('does not permit development websocket origins in production', () => {
		expect(createContentSecurityPolicy(undefined)?.directives?.['connect-src']).toEqual(['self']);
	});

	it('allows signed download redirects only to the configured HTTP origin', () => {
		expect(
			createContentSecurityPolicy('http://127.0.0.1:54321')?.directives?.['form-action']
		).toEqual(['self', 'http://127.0.0.1:54321']);
		expect(createContentSecurityPolicy(undefined)?.directives?.['form-action']).toEqual(['self']);
	});
});
