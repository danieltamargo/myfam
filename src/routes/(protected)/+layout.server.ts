import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: LayoutServerLoad = async ({ locals: { safeGetSession } }) => {
	const { user, session } = await safeGetSession();

	if (!user || !session) {
		throw redirect(303, '/login');
	}

	return {
		user,
		session
	};
};
