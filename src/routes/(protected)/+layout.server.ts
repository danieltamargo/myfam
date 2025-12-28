import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: LayoutServerLoad = async ({ locals: { safeGetSession, supabase } }) => {
	const { user, session } = await safeGetSession();

	if (!user || !session) {
		throw redirect(303, '/login');
	}

	// Get user's families
	const { data: familyMembers } = await supabase
		.from('family_members')
		.select('family_id, role, family:families(id, name)')
		.eq('user_id', user.id);

	const families = (familyMembers || [])
		.filter((fm) => fm.family)
		.map((fm) => ({
			id: (fm.family as any).id,
			name: (fm.family as any).name,
			role: fm.role
		}));

	return {
		user,
		session,
		families
	};
};
