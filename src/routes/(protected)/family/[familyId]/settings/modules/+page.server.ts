import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { isModuleId, MODULE_CATALOG } from '$lib/config/modules';
import { hasFamilyCapability, requireFamilyCapability } from '$lib/server/auth/authorization';

export const load: PageServerLoad = async ({ parent, locals, params }) => {
	const { family, moduleAccess } = await parent();
	const { user } = await locals.safeGetSession();
	const { data: membership, error } = await locals.supabase
		.from('family_members')
		.select('role, can_configure_modules')
		.eq('family_id', params.familyId)
		.eq('user_id', user!.id)
		.single();
	if (error) throw new Error('No se pudo consultar la configuración de permisos');
	return {
		family,
		modules: moduleAccess,
		canManage: hasFamilyCapability(membership, 'configure_modules')
	};
};

export const actions: Actions = {
	setPreference: async ({ request, params, locals }) => {
		await requireFamilyCapability(locals, params.familyId, 'configure_modules');
		const formData = await request.formData();
		const moduleId = formData.get('moduleId');
		const enabledValue = formData.get('enabled');

		if (!isModuleId(moduleId) || (enabledValue !== 'true' && enabledValue !== 'false')) {
			return fail(400, { error: 'La preferencia enviada no es válida.' });
		}

		const module = MODULE_CATALOG[moduleId];
		if (module.availability !== 'available' || !module.familyCanDisable) {
			return fail(400, { error: 'Este módulo no admite una preferencia familiar.' });
		}

		const enabled = enabledValue === 'true';
		const { error: mutationError } = await locals.supabase.rpc('set_family_module_preference', {
			p_family_id: params.familyId,
			p_module_name: moduleId,
			p_enabled: enabled
		});

		if (mutationError) {
			console.error('Module preference mutation failed', mutationError);
			return fail(mutationError.code === '42501' ? 403 : 500, {
				error: 'No se pudo guardar la preferencia del módulo.'
			});
		}

		return {
			success: enabled ? `${module.label} está activo.` : `${module.label} está desactivado.`
		};
	}
};
