import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, setHeaders, request }) => {
	if (request.method === 'GET') setHeaders({ 'cache-control': 'no-store' });
	const { user } = await locals.safeGetSession();
	if (!user) throw redirect(303, '/login');
	const { data, error: stateError } = await locals.supabase
		.rpc('get_my_mfa_recovery_state')
		.single();
	if (stateError || !data) throw error(503, 'No se pudo comprobar la recuperación.');
	if (!data.required) throw redirect(303, '/profile');
	if (data.pending || !data.session_valid || !data.allowed) {
		throw error(
			403,
			'Esta sesión no puede completar la recuperación. Contacta con quien administra MyFamily.'
		);
	}
	return {};
};

export const actions: Actions = {
	complete: async ({ locals, setHeaders }) => {
		setHeaders({ 'cache-control': 'no-store' });
		const { error: completeError } = await locals.supabase.rpc('complete_my_mfa_recovery');
		if (completeError)
			throw error(403, 'Verifica el nuevo autenticador desde la sesión de recuperación.');
		throw redirect(303, '/profile/recovery');
	}
};
