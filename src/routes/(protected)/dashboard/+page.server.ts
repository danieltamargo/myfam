import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { loadPlannerSnapshot, PlannerQueryError } from '$lib/server/planner/queries';

export const load: PageServerLoad = async ({ parent, locals: { supabase, safeGetSession } }) => {
	const [parentData, sessionData] = await Promise.all([parent(), safeGetSession()]);
	const { user } = sessionData;
	if (!user) return { invitations: [], planner: null, plannerError: false };

	const { data: invitations, error: invitationError } = await supabase
		.from('family_invitations')
		.select(
			'id, family_id, invited_by, created_at, family:families(id, name), invitedBy:public_profiles!family_invitations_invited_by_fkey(display_name)'
		)
		.eq('invited_user_id', user.id)
		.eq('status', 'pending')
		.order('created_at', { ascending: false });
	if (invitationError) console.error('Could not load dashboard invitations', invitationError);

	if (!parentData.activeFamily) {
		return { invitations: invitations ?? [], planner: null, plannerError: false };
	}

	try {
		return {
			invitations: invitations ?? [],
			planner: await loadPlannerSnapshot(supabase, parentData.activeFamily.id, user.id),
			plannerError: false
		};
	} catch (caught) {
		if (caught instanceof PlannerQueryError) console.error(caught.message);
		else console.error('Unexpected dashboard planner failure', caught);
		return { invitations: invitations ?? [], planner: null, plannerError: true };
	}
};

export const actions: Actions = {
	acceptInvitation: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: 'No tienes una sesión activa.' });
		const invitationId = String((await request.formData()).get('invitation_id') ?? '');
		if (!invitationId) return fail(400, { message: 'La invitación no es válida.' });
		const { error: invitationError } = await supabase.rpc('accept_family_invitation', {
			p_invitation_id: invitationId
		});
		if (invitationError) {
			console.error('Invitation error:', invitationError);
			return fail(invitationError.code === 'P0002' ? 404 : 500, {
				message: 'No se pudo aceptar la invitación.'
			});
		}
		throw redirect(303, '/families?invitation_accepted=true');
	},

	rejectInvitation: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: 'No tienes una sesión activa.' });
		const invitationId = String((await request.formData()).get('invitation_id') ?? '');
		if (!invitationId) return fail(400, { message: 'La invitación no es válida.' });
		const { error } = await supabase.rpc('reject_family_invitation', {
			p_invitation_id: invitationId
		});
		if (error) return fail(500, { message: 'No se pudo rechazar la invitación.' });
		return { success: true, message: 'Invitación rechazada.' };
	}
};
