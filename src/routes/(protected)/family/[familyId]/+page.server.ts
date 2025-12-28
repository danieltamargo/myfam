import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params }) => {
	// Redirect to members page by default
	throw redirect(303, `/family/${params.familyId}/members`);
};
