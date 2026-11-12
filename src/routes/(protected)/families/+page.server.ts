import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import * as m from '$paraglide/messages';

export const load: PageServerLoad = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		return { families: [] };
	}

	// Get user's families with member count
	const { data: familyMembers } = await supabase
		.from('family_members')
		.select(
			`
			family_id,
			role,
			joined_at,
			family:families(
				id,
				name,
				alias,
				created_at,
				created_by
			)
		`
		)
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
				name: family.alias ?? family.name,
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
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: m['families.unauthorized']() });

		const formData = await request.formData();
		const name = formData.get('name');

		if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) {
			return fail(400, { message: m['families.invalid']() });
		}

		const { data: familyId, error: familyError } = await supabase.rpc('create_family', {
			p_name: name.trim()
		});

		if (familyError || !familyId) {
			return fail(familyError?.code === '22023' ? 400 : 500, {
				message: familyError?.code === '22023' ? m['families.invalid']() : m['families.error']()
			});
		}

		return { success: true, familyId };
	}
};
