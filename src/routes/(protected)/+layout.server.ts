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

	// Get user's profile to check active_family_id
	const { data: profile } = await supabase
		.from('profiles')
		.select('active_family_id')
		.eq('id', user.id)
		.single();

	// Find the active family from the user's families
	const activeFamily = families.find((f) => f.id === profile?.active_family_id) || families[0] || null;

	// Get all notifications (both read and unread)
	const { data: notifications } = await supabase
		.from('notifications')
		.select('*')
		.eq('user_id', user.id)
		.order('created_at', { ascending: false })
		.limit(50); // Limit to last 50 notifications

	return {
		user,
		session,
		families,
		activeFamily,
		notifications: notifications || []
	};
};
