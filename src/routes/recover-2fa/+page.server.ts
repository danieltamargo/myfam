import { createClient } from '@supabase/supabase-js';
import { error, fail, isHttpError, redirect } from '@sveltejs/kit';
import { getSupabaseAdmin } from '$lib/supabase-admin';
import { recoverMfa } from '$lib/server/auth/recovery';
import type { Database } from '$lib/types/database';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, setHeaders, request }) => {
	if (request.method === 'GET') setHeaders({ 'cache-control': 'no-store' });
	const { user } = await locals.safeGetSession();
	if (!user) throw redirect(303, '/login');
	return {};
};

export const actions: Actions = {
	default: async ({ locals, request, setHeaders }) => {
		setHeaders({ 'cache-control': 'no-store' });
		const { user } = await locals.safeGetSession();
		if (!user) throw error(401, 'Inicia sesión para recuperar tu segundo factor.');
		const form = await request.formData();
		const password = form.get('password');
		const newPassword = form.get('new_password');
		const code = form.get('code');
		if (
			typeof password !== 'string' ||
			typeof newPassword !== 'string' ||
			typeof code !== 'string'
		) {
			return fail(400, { message: 'Completa la contraseña y el código de recuperación.' });
		}
		const passwordClient = createClient<Database>(
			import.meta.env.VITE_SUPABASE_URL,
			import.meta.env.VITE_SUPABASE_ANON_KEY,
			{ auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
		);
		try {
			await recoverMfa({
				user,
				password,
				newPassword,
				code,
				admin: getSupabaseAdmin(),
				passwordClient,
				cookieClient: locals.supabase
			});
		} catch (cause) {
			if (isHttpError(cause)) return fail(cause.status, { message: cause.body.message });
			throw error(503, 'No se pudo recuperar el segundo factor.');
		}
		throw redirect(303, '/recover-2fa/setup');
	}
};
