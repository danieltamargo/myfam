import { describe, expect, it, vi } from 'vitest';
import { GET } from './+server';

function callbackEvent(next?: string, type?: string) {
	const url = new URL('http://localhost/auth/callback');
	url.searchParams.set('code', 'pkce-code');
	if (next !== undefined) url.searchParams.set('next', next);
	if (type !== undefined) url.searchParams.set('type', type);

	return {
		url,
		locals: {
			supabase: {
				auth: {
					exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null })
				}
			}
		}
	};
}

describe('OAuth callback', () => {
	it('conserva una ruta interna con query string', async () => {
		await expect(GET(callbackEvent('/family/family-a?tab=members') as never)).rejects.toMatchObject(
			{
				status: 303,
				location: '/family/family-a?tab=members'
			}
		);
	});

	it.each([
		['URL absoluta', 'https://evil.example'],
		['URL relativa al protocolo', '//evil.example'],
		['backslash', '/\\evil.example'],
		['variante codificada', '/%2F%2Fevil.example'],
		['vacío', '']
	])('envía %s al fallback seguro', async (_label, next) => {
		await expect(GET(callbackEvent(next) as never)).rejects.toMatchObject({
			status: 303,
			location: '/dashboard'
		});
	});

	it('mantiene el destino histórico de signup', async () => {
		await expect(GET(callbackEvent('/profile', 'signup') as never)).rejects.toMatchObject({
			status: 303,
			location: '/dashboard'
		});
	});
});
