import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireModuleAvailable } from '$lib/server/modules/availability';
import { loadPlannerSnapshot, PlannerQueryError } from '$lib/server/planner/queries';

export const load: PageServerLoad = async ({ params, locals: { supabase, safeGetSession } }) => {
	await requireModuleAvailable(supabase, params.familyId, 'planner');
	const { user } = await safeGetSession();
	if (!user) throw error(401, 'Unauthorized');
	try {
		return {
			familyId: params.familyId,
			planner: await loadPlannerSnapshot(supabase, params.familyId, user.id)
		};
	} catch (caught) {
		if (caught instanceof PlannerQueryError) console.error(caught.message);
		else console.error('Unexpected planner query failure', caught);
		throw error(500, 'No se pudo cargar el planner familiar.');
	}
};
