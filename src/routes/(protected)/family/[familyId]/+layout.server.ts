import type { LayoutServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';

export const load: LayoutServerLoad = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		throw redirect(303, '/login');
	}

	const { familyId } = params;

	// Verify user is a member of this family
	const { data: membership } = await supabase
		.from('family_members')
		.select('role, family:families(id, name, created_at, created_by)')
		.eq('family_id', familyId)
		.eq('user_id', user.id)
		.single();

	if (!membership || !membership.family) {
		throw error(404, 'Family not found');
	}

	const family = membership.family as any;

	return {
		family: {
			id: family.id,
			name: family.name,
			createdAt: family.created_at,
			createdBy: family.created_by
		},
		userRole: membership.role
	};
};
