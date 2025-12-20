import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();

	// If user is authenticated, redirect to dashboard
	if (user) {
		throw redirect(303, '/dashboard');
	}

	return {};
};
