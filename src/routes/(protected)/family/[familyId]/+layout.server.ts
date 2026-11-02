import type { LayoutServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { loadFamilyModuleAccess } from '$lib/server/modules/availability';
import { loadBirthdayAlerts } from '$lib/server/birthdays/queries';
import type { BirthdayAlert } from '$lib/birthdays/upcoming';

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
	const moduleAccess = await loadFamilyModuleAccess(supabase, familyId);
	let birthdayAlerts: BirthdayAlert[] = [];
	let birthdayAlertsError = '';
	try {
		birthdayAlerts = await loadBirthdayAlerts(
			supabase,
			familyId,
			moduleAccess.some((access) => access.moduleId === 'wishlist' && access.enabled)
		);
	} catch {
		birthdayAlertsError = 'No se pudieron cargar los avisos de cumpleaños. Vuelve a intentarlo.';
	}

	return {
		family: {
			id: family.id,
			name: family.name,
			createdAt: family.created_at,
			createdBy: family.created_by
		},
		userRole: membership.role,
		moduleAccess,
		birthdayAlerts,
		birthdayAlertsError
	};
};
