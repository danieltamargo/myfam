import type { PageServerLoad, Actions } from './$types';
import { redirect, fail } from '@sveltejs/kit';

// LOAD FUNCTION
export const load: PageServerLoad = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		throw redirect(303, '/login');
	}

	// Get full user with identities
	const {
		data: { user: fullUser }
	} = await supabase.auth.getUser();

	// Get profile
	const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();

	// Get identities
	const identities = fullUser?.identities || [];

	// Get families where user is owner
	const { data: ownedFamilies } = await supabase
		.from('family_members')
		.select('family_id, family:families(name)')
		.eq('user_id', user.id)
		.eq('role', 'owner');

	// Check if user is sole owner of any family
	let isSoleOwner = false;
	if (ownedFamilies && ownedFamilies.length > 0) {
		for (const owned of ownedFamilies) {
			const { data: owners } = await supabase
				.from('family_members')
				.select('id')
				.eq('family_id', owned.family_id!)
				.eq('role', 'owner');

			if (owners && owners.length === 1) {
				isSoleOwner = true;
				break;
			}
		}
	}

	return {
		user: fullUser,
		profile,
		identities: identities.map((identity) => ({
			provider: identity.provider,
			email: identity.identity_data?.email || '',
			created_at: identity.created_at
		})),
		isSoleOwner
	};
};

// ACTIONS
export const actions: Actions = {
	updateProfile: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: 'Unauthorized' });

		const formData = await request.formData();
		const displayName = formData.get('display_name') as string;
		const avatarUrl = formData.get('avatar_url') as string;

		const { error } = await supabase
			.from('profiles')
			.update({
				display_name: displayName,
				avatar_url: avatarUrl
			})
			.eq('id', user.id);

		if (error) {
			return fail(500, { message: error.message });
		}

		return { success: true };
	},

	deleteAccount: async ({ locals: { supabase, safeGetSession }, fetch }) => {
		const { user, session } = await safeGetSession();
		if (!user || !session) return fail(401, { message: 'Unauthorized' });

		// Call Edge Function to delete user
		const response = await fetch(
			`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-account`,
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${session.access_token}`,
					'Content-Type': 'application/json'
				}
			}
		);

		const result = await response.json();

		if (!response.ok) {
			return fail(response.status, { message: result.error });
		}

		// Sign out and redirect
		await supabase.auth.signOut();
		throw redirect(303, '/login?deleted=true');
	}
};
