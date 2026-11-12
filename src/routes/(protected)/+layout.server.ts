import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { enforceMfaForProtectedRoute } from '$lib/server/auth/mfa';
import { isSuperAdmin } from '$lib/server/admin/access';

export const load: LayoutServerLoad = async ({ url, locals: { safeGetSession, supabase } }) => {
	const { user, session } = await safeGetSession();

	if (!user || !session) {
		throw redirect(303, '/login');
	}

	await enforceMfaForProtectedRoute(supabase, url);

	// Get user's families
	const { data: familyMembers } = await supabase
		.from('family_members')
		.select('family_id, role, family:families(id, name, alias)')
		.eq('user_id', user.id);

	const families = (familyMembers || [])
		.filter((fm) => fm.family)
		.map((fm) => ({
			id: (fm.family as any).id,
			name: (fm.family as any).alias ?? (fm.family as any).name,
			role: fm.role
		}));

	// Get user's profile to check active_family_id
	const { data: profile } = await supabase.rpc('get_my_profile').maybeSingle();

	// Find the active family from the user's families
	const activeFamily =
		families.find((f) => f.id === profile?.active_family_id) || families[0] || null;

	// Get all notifications (both read and unread)
	const { data: notifications } = await supabase
		.from('notifications')
		.select('*')
		.eq('user_id', user.id)
		.order('created_at', { ascending: false })
		.limit(50); // Limit to last 50 notifications

	return {
		user,
		isSuperAdmin: isSuperAdmin(user.id),
		session,
		families,
		activeFamily,
		notifications: notifications || []
	};
};
