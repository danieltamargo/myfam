import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireModuleAvailable } from '$lib/server/modules/availability';
import { loadBirthdayMembers } from '$lib/server/birthdays/queries';
import { isValidBirthday } from '$lib/birthdays/upcoming';
import { parseUuidField } from '$lib/server/wishlist/schemas';

export const load: PageServerLoad = async ({
	params,
	parent,
	locals: { supabase, safeGetSession }
}) => {
	await requireModuleAvailable(supabase, params.familyId, 'wishlist');
	const { user } = await safeGetSession();
	if (!user) throw error(401, 'Debes iniciar sesión.');
	const { userRole } = await parent();
	try {
		return {
			birthdayMembers: await loadBirthdayMembers(supabase, params.familyId),
			canManageBirthdays: userRole === 'owner' || userRole === 'admin',
			currentUserId: user.id
		};
	} catch {
		throw error(500, 'No se pudieron cargar los cumpleaños.');
	}
};

export const actions: Actions = {
	save: async ({ params, request, locals: { supabase, safeGetSession } }) => {
		await requireModuleAvailable(supabase, params.familyId, 'wishlist');
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: 'Debes iniciar sesión.', success: false });
		const formData = await request.formData();
		const target = parseUuidField(formData, 'user_id');
		if (!target.success) return fail(400, { message: 'El miembro no es válido.', success: false });
		const { data: membership, error: membershipError } = await supabase
			.from('family_members')
			.select('role')
			.eq('family_id', params.familyId)
			.eq('user_id', user.id)
			.maybeSingle();
		if (membershipError)
			return fail(500, { message: 'No se pudieron comprobar los permisos.', success: false });
		if (
			!membership ||
			(target.data !== user.id && !['owner', 'admin'].includes(membership.role ?? ''))
		)
			return fail(403, {
				message: 'No tienes permiso para cambiar este cumpleaños.',
				success: false
			});
		const remove = formData.get('remove') === 'true';
		const month = Number(formData.get('month'));
		const day = Number(formData.get('day'));
		if (!remove && !isValidBirthday(month, day))
			return fail(400, { message: 'Indica un día y un mes válidos.', success: false });
		const result = remove
			? await supabase
					.from('family_member_birthdays')
					.delete()
					.eq('family_id', params.familyId)
					.eq('user_id', target.data)
			: await supabase
					.from('family_member_birthdays')
					.upsert({ family_id: params.familyId, user_id: target.data, month, day });
		if (result.error)
			return fail(result.error.code === '42501' ? 403 : 400, {
				message: 'No se pudo guardar el cumpleaños.',
				success: false
			});
		return { success: true, message: remove ? 'Cumpleaños eliminado.' : 'Cumpleaños guardado.' };
	}
};
