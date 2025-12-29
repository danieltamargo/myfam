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
			const { data: family, error: familyError } = await supabase
				.from('families')
				.select('id, name')
				.eq('id', inv.family_id)
				.single();

			if (familyError) {
				console.error('Error fetching family:', familyError);
			}

			// Get invited_by user data
			const { data: invitedBy, error: invitedByError } = await supabase
				.from('profiles')
				.select('display_name, email')
				.eq('id', inv.invited_by)
				.single();

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

		// Get invitation details
		const { data: invitation, error: invitationError } = await supabase
			.from('family_invitations')
			.select('family_id')
			.eq('id', invitationId)
			.eq('invited_user_id', user.id)
			.eq('status', 'pending')
			.single();

		if (invitationError || !invitation) {
			console.error('Invitation error:', invitationError);
			return fail(404, { message: 'Invitation not found or already processed' });
		}

		// Check if user is already a member
		const { data: existingMember } = await supabase
			.from('family_members')
			.select('id')
			.eq('family_id', invitation.family_id)
			.eq('user_id', user.id)
			.single();

		if (existingMember) {
			// Just update the invitation status
			await supabase
				.from('family_invitations')
				.update({ status: 'accepted' })
				.eq('id', invitationId);
			return { success: true, message: 'You are already a member of this family' };
		}

		// Add user to family as member
		const { error: memberError } = await supabase.from('family_members').insert({
			family_id: invitation.family_id,
			user_id: user.id,
			role: 'member'
		});

		if (memberError) {
			console.error('Member insert error:', memberError);
			return fail(500, { message: `Failed to join family: ${memberError.message}` });
		}

		// Update invitation status
		const { error: updateError } = await supabase
			.from('family_invitations')
			.update({ status: 'accepted' })
			.eq('id', invitationId);

		if (updateError) {
			console.error('Invitation update error:', updateError);
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
		const { error } = await supabase
			.from('family_invitations')
			.update({ status: 'rejected' })
			.eq('id', invitationId)
			.eq('invited_user_id', user.id);

		if (error) {
			return fail(500, { message: 'Failed to reject invitation' });
		}

		return { success: true, message: 'Invitation rejected' };
	}
};
