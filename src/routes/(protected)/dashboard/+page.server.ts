import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		return { invitations: [] };
	}

	// Get pending invitations for this user
	const { data: invitations } = await supabase
		.from('family_invitations')
		.select('*')
		.eq('invited_user_id', user.id)
		.eq('status', 'pending')
		.order('created_at', { ascending: false });

	// Enrich with family and user data
	const enrichedInvitations = await Promise.all(
		(invitations || []).map(async (inv) => {
			// Get family data
			const { data: family, error: familyError } = inv.family_id
				? await supabase.from('families').select('id, name').eq('id', inv.family_id).single()
				: { data: null, error: null };

			if (familyError) {
				console.error('Error fetching family:', familyError);
			}

			// Get invited_by user data
			const { data: invitedBy, error: invitedByError } = inv.invited_by
				? await supabase.from('profiles').select('display_name').eq('id', inv.invited_by).single()
				: { data: null, error: null };

			if (invitedByError) {
				console.error('Error fetching invited_by:', invitedByError);
			}

			return {
				...inv,
				family,
				invited_by: invitedBy
			};
		})
	);

	return {
		invitations: enrichedInvitations
	};
};

export const actions: Actions = {
	acceptInvitation: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: 'Unauthorized' });

		const formData = await request.formData();
		const invitationId = formData.get('invitation_id') as string;

		const { error: invitationError } = await supabase.rpc('accept_family_invitation', {
			p_invitation_id: invitationId
		});

		if (invitationError) {
			console.error('Invitation error:', invitationError);
			return fail(invitationError.code === 'P0002' ? 404 : 500, {
				message: invitationError.message
			});
		}

		// Redirect to families page with success message
		throw redirect(303, '/families?invitation_accepted=true');
	},

	rejectInvitation: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: 'Unauthorized' });

		const formData = await request.formData();
		const invitationId = formData.get('invitation_id') as string;

		// Update invitation status
		const { error } = await supabase.rpc('reject_family_invitation', {
			p_invitation_id: invitationId
		});

		if (error) {
			return fail(500, { message: 'Failed to reject invitation' });
		}

		return { success: true, message: 'Invitation rejected' };
	}
};
