import { redirect } from '@sveltejs/kit';
import { safeInternalPath } from '$lib/auth/redirects';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
	const code = url.searchParams.get('code');
	const next = safeInternalPath(url.searchParams.get('next'));
	const type = url.searchParams.get('type');

	if (code) {
		const { error } = await supabase.auth.exchangeCodeForSession(code);
		if (!error) {
			// Redirige al dashboard para nuevos usuarios o al perfil para confirmación de email
			if (type === 'signup') {
				throw redirect(303, '/dashboard');
			}
			throw redirect(303, next);
		}
	}

	// Return the user to an error page with instructions
	throw redirect(303, '/auth/error');
};
