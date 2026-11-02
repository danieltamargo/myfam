import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ depends, locals: { safeGetSession } }) => {
	depends('supabase:auth');
	const { session, user } = await safeGetSession();

	return {
		session,
		user
	};
};
