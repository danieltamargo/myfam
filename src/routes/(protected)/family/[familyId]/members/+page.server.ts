import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	const { familyId } = params;

	// Get all family members
	const { data: members } = await supabase
		.from('family_members')
		.select(`
			user_id,
			role,
			joined_at,
			profile:profiles(
				display_name,
				avatar_url
			)
		`)
		.eq('family_id', familyId)
		.order('joined_at', { ascending: true });

	// Get pending invitations
	const { data: invitations } = await supabase
		.from('family_invitations')
		.select(`
			*,
			invited_user:profiles!invited_user_id(email)
		`)
		.eq('family_id', familyId)
		.eq('status', 'pending')
		.order('created_at', { ascending: false });

	return {
		members: (members || []).map((m) => ({
			userId: m.user_id,
			role: m.role,
			joinedAt: m.joined_at,
			displayName: (m.profile as any)?.display_name || 'Unknown User',
			avatarUrl: (m.profile as any)?.avatar_url
		})),
		invitations: invitations || [],
		currentUserId: user?.id
	};
};

export const actions: Actions = {
	inviteMember: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: 'Unauthorized' });

		const { familyId } = params;

		// Check if user has permission to invite (owner or admin)
		const { data: membership } = await supabase
			.from('family_members')
			.select('role')
			.eq('family_id', familyId)
			.eq('user_id', user.id)
			.single();

		if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
			return fail(403, { message: 'You do not have permission to invite members' });
		}

		const formData = await request.formData();
		const email = formData.get('email') as string;

		if (!email || !email.includes('@')) {
			return fail(400, { message: 'Valid email is required' });
		}

		// Check if user exists
		const { data: invitedUser } = await supabase
			.from('profiles')
			.select('id')
			.eq('email', email)
			.single();

		if (!invitedUser) {
			return fail(404, { message: 'User not found. They need to create an account first.' });
		}

		// Check if already a member
		const { data: existingMember } = await supabase
			.from('family_members')
			.select('id')
			.eq('family_id', familyId)
			.eq('user_id', invitedUser.id)
			.single();

		if (existingMember) {
			return fail(400, { message: 'User is already a member of this family' });
		}

		// Check if already invited (use maybeSingle to handle case where no rows found)
		const { data: existingInvite } = await supabase
			.from('family_invitations')
			.select('id, status')
			.eq('family_id', familyId)
			.eq('invited_user_id', invitedUser.id)
			.eq('status', 'pending')
			.maybeSingle();

		if (existingInvite) {
			// Update the existing invitation to refresh it
			await supabase
				.from('family_invitations')
				.update({
					invited_by: user.id,
					updated_at: new Date().toISOString()
				})
				.eq('id', existingInvite.id);

			return { success: true, message: 'Invitation resent successfully' };
		}

		// Create invitation - use upsert to handle race conditions
		const { error } = await supabase
			.from('family_invitations')
			.upsert({
				family_id: familyId,
				invited_by: user.id,
				invited_user_id: invitedUser.id,
				status: 'pending'
			}, {
				onConflict: 'family_id,invited_user_id',
				ignoreDuplicates: false
			});

		if (error) {
			console.error('Invitation error:', error);
			return fail(500, { message: 'Failed to send invitation. Please try again.' });
		}

		return { success: true, message: 'Invitation sent successfully' };
	},

	updateRole: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: 'Unauthorized' });

		const { familyId } = params;

		// Check if user is owner
		const { data: membership } = await supabase
			.from('family_members')
			.select('role')
			.eq('family_id', familyId)
			.eq('user_id', user.id)
			.single();

		if (!membership || membership.role !== 'owner') {
			return fail(403, { message: 'Only owners can change member roles' });
		}

		const formData = await request.formData();
		const targetUserId = formData.get('userId') as string;
		const newRole = formData.get('role') as string;

		if (!['owner', 'admin', 'member'].includes(newRole)) {
			return fail(400, { message: 'Invalid role' });
		}

		// Cannot change own role
		if (targetUserId === user.id) {
			return fail(400, { message: 'Cannot change your own role' });
		}

		// If transferring ownership, update both users
		if (newRole === 'owner') {
			// Update new owner
			const { error: newOwnerError } = await supabase
				.from('family_members')
				.update({ role: 'owner' })
				.eq('family_id', familyId)
				.eq('user_id', targetUserId);

			if (newOwnerError) {
				return fail(500, { message: newOwnerError.message });
			}

			// Demote current owner to admin
			const { error: demoteError } = await supabase
				.from('family_members')
				.update({ role: 'admin' })
				.eq('family_id', familyId)
				.eq('user_id', user.id);

			if (demoteError) {
				return fail(500, { message: demoteError.message });
			}

			return { success: true, message: 'Ownership transferred successfully. You are now an admin.' };
		}

		// Normal role update
		const { error } = await supabase
			.from('family_members')
			.update({ role: newRole })
			.eq('family_id', familyId)
			.eq('user_id', targetUserId);

		if (error) {
			return fail(500, { message: error.message });
		}

		return { success: true, message: 'Role updated successfully' };
	},

	removeMember: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: 'Unauthorized' });

		const { familyId } = params;

		// Check if user is owner
		const { data: membership } = await supabase
			.from('family_members')
			.select('role')
			.eq('family_id', familyId)
			.eq('user_id', user.id)
			.single();

		if (!membership || membership.role !== 'owner') {
			return fail(403, { message: 'Only owners can remove members' });
		}

		const formData = await request.formData();
		const targetUserId = formData.get('userId') as string;

		// Cannot remove self
		if (targetUserId === user.id) {
			return fail(400, { message: 'Cannot remove yourself' });
		}

		const { error } = await supabase
			.from('family_members')
			.delete()
			.eq('family_id', familyId)
			.eq('user_id', targetUserId);

		if (error) {
			return fail(500, { message: error.message });
		}

		return { success: true, message: 'Member removed successfully' };
	},

	leaveFamily: async ({ params, locals: { supabase, safeGetSession }, cookies }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: 'Unauthorized' });

		const { familyId } = params;

		// Check current membership
		const { data: membership } = await supabase
			.from('family_members')
			.select('role')
			.eq('family_id', familyId)
			.eq('user_id', user.id)
			.single();

		if (!membership) {
			return fail(404, { message: 'You are not a member of this family' });
		}

		// Prevent owner from leaving (must transfer ownership first)
		if (membership.role === 'owner') {
			return fail(400, { message: 'Owners cannot leave the family. Transfer ownership first or delete the family.' });
		}

		// Remove the member
		const { error } = await supabase
			.from('family_members')
			.delete()
			.eq('family_id', familyId)
			.eq('user_id', user.id);

		if (error) {
			return fail(500, { message: error.message });
		}

		// Clear active family if it was this one
		const activeFamily = cookies.get('activeFamily');
		if (activeFamily === familyId) {
			cookies.delete('activeFamily', { path: '/' });
		}

		return { success: true, message: 'You have left the family', redirect: '/dashboard' };
	}
};
