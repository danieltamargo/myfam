import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireModuleAvailable } from '$lib/server/modules/availability';
import {
	addFamilyListItem,
	createFamilyList,
	deleteFamilyListItem,
	ListCommandError,
	setFamilyListItemCompleted
} from '$lib/server/lists/commands';
import { ListQueryError, loadListFormContext, loadListPage } from '$lib/server/lists/queries';
import {
	parseFamilyListForm,
	parseFamilyListItemForm,
	parseListItemIdentity,
	type ListValidationErrors
} from '$lib/server/lists/schemas';

function invalidForm(errors: ListValidationErrors) {
	return fail(400, {
		error: Object.values(errors)[0] ?? 'Los datos enviados no son válidos.',
		fieldErrors: errors
	});
}

function commandFailure(caught: unknown, fallback: string) {
	if (caught instanceof ListCommandError) return fail(caught.status, { error: caught.message });
	if (caught instanceof ListQueryError) return fail(500, { error: caught.message });
	console.error(fallback, caught);
	return fail(500, { error: fallback });
}

export const load: PageServerLoad = async ({
	url,
	params,
	locals: { supabase, safeGetSession }
}) => {
	requireModuleAvailable('lists');
	const { user } = await safeGetSession();
	if (!user) throw error(401, 'Unauthorized');
	try {
		return {
			...(await loadListPage(supabase, params.familyId, user.id, url.searchParams.get('list'))),
			familyId: params.familyId
		};
	} catch (caught) {
		if (caught instanceof ListQueryError) console.error(caught.message);
		else console.error('Unexpected list query failure', caught);
		throw error(500, 'No se pudieron cargar las listas.');
	}
};

export const actions: Actions = {
	createList: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		try {
			const [formData, memberIds] = await Promise.all([
				request.formData(),
				loadListFormContext(supabase, params.familyId)
			]);
			const parsed = parseFamilyListForm(formData, memberIds);
			if (!parsed.success) return invalidForm(parsed.errors);
			const listId = await createFamilyList(supabase, params.familyId, parsed.data);
			return { success: true, message: 'Lista creada.', listId };
		} catch (caught) {
			return commandFailure(caught, 'No se pudo crear la lista.');
		}
	},

	addItem: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		const parsed = parseFamilyListItemForm(await request.formData());
		if (!parsed.success) return invalidForm(parsed.errors);
		try {
			const itemId = await addFamilyListItem(supabase, parsed.data.listId, parsed.data.item);
			return { success: true, message: 'Artículo añadido.', itemId };
		} catch (caught) {
			return commandFailure(caught, 'No se pudo añadir el artículo.');
		}
	},

	toggleItem: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		const formData = await request.formData();
		const identity = parseListItemIdentity(formData);
		if (!identity.success) return invalidForm(identity.errors);
		try {
			await setFamilyListItemCompleted(
				supabase,
				identity.data.itemId,
				identity.data.version,
				formData.get('completed') === 'true'
			);
			return { success: true, message: 'Lista actualizada.' };
		} catch (caught) {
			return commandFailure(caught, 'No se pudo actualizar el artículo.');
		}
	},

	deleteItem: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		const parsed = parseListItemIdentity(await request.formData());
		if (!parsed.success) return invalidForm(parsed.errors);
		try {
			await deleteFamilyListItem(supabase, parsed.data.itemId, parsed.data.version);
			return { success: true, message: 'Artículo eliminado.' };
		} catch (caught) {
			return commandFailure(caught, 'No se pudo eliminar el artículo.');
		}
	}
};
