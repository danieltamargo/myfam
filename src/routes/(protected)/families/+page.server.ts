import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/supabase-admin';

export const load: PageServerLoad = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		return { families: [] };
	}

	// Get user's families with member count
	const { data: familyMembers } = await supabase
		.from('family_members')
		.select(`
			family_id,
			role,
			joined_at,
			family:families(
				id,
				name,
				created_at,
				created_by
			)
		`)
		.eq('user_id', user.id)
		.order('joined_at', { ascending: false });

	if (!familyMembers) return { families: [] };

	// Get member counts for each family
	const familyIds = familyMembers.map((fm) => fm.family_id);
	const { data: memberCounts } = await supabase
		.from('family_members')
		.select('family_id')
		.in('family_id', familyIds);

	const countMap = (memberCounts || []).reduce(
		(acc, member) => {
			if (member.family_id) {
				acc[member.family_id] = (acc[member.family_id] || 0) + 1;
			}
			return acc;
		},
		{} as Record<string, number>
	);

	const families = familyMembers
		.filter((fm) => fm.family && fm.family_id)
		.map((fm) => {
			const family = fm.family as any;
			return {
				id: family.id,
				name: family.name,
				role: fm.role,
				memberCount: countMap[fm.family_id!] || 0,
				joinedAt: fm.joined_at,
				createdAt: family.created_at,
				isOwner: fm.role === 'owner'
			};
		});

	return { families };
};

export const actions: Actions = {
	createFamily: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user, session } = await safeGetSession();
		if (!user) return fail(401, { message: 'Unauthorized' });

		const formData = await request.formData();
		const name = formData.get('name') as string;

		if (!name || name.trim().length === 0) {
			return fail(400, { message: 'Family name is required' });
		}

		// Create family using admin client to bypass RLS
		// (RLS will be enforced for all subsequent operations)
		const { data: family, error: familyError } = await supabaseAdmin
			.from('families')
			.insert({
				name: name.trim(),
				created_by: user.id
			})
			.select()
			.single();

		if (familyError || !family) {
			return fail(500, { message: familyError?.message || 'Failed to create family' });
		}

		// Add user as owner using admin client
		const { error: memberError } = await supabaseAdmin.from('family_members').insert({
			family_id: family.id,
			user_id: user.id,
			role: 'owner'
		});

		if (memberError) {
			// Rollback: delete the family
			await supabase.from('families').delete().eq('id', family.id);
			return fail(500, { message: 'Failed to add you as owner' });
		}

		// Create default event categories for the family
		const defaultEvents = [
			{ name: 'Navidad', icon: '🎄', color: '#dc2626' },
			{ name: 'Cumpleaños', icon: '🎂', color: '#f59e0b' },
			{ name: 'Reyes', icon: '👑', color: '#8b5cf6' },
			{ name: 'San Valentín', icon: '❤️', color: '#ec4899' },
			{ name: 'Todos', icon: '🎁', color: '#10b981' }
		];

		const eventInserts = defaultEvents.map(event => ({
			family_id: family.id,
			name: event.name,
			icon: event.icon,
			color: event.color,
			is_system: true,
			created_by: user.id
		}));

		const { error: eventsError } = await supabaseAdmin
			.from('gift_event_categories')
			.insert(eventInserts);

		if (eventsError) {
			console.error('Warning: Failed to create default event categories:', eventsError);
			// Not critical - continue
		}

		return { success: true, familyId: family.id };
	}
};
