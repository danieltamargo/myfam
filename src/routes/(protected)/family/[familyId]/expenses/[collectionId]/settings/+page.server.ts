import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { guardModuleActions } from '$lib/server/modules/availability';
import {
	changeExpenseCollectionRole,
	createExpenseCategory,
	deleteExpenseCategory,
	ExpenseCommandError,
	inviteExpenseCollectionMember,
	leaveExpenseCollection,
	revokeExpenseCollectionMember,
	setExpenseCollectionArchived,
	transferExpenseCollectionOwnership,
	updateExpenseCollection
} from '$lib/server/expenses/commands';
import { ExpenseQueryError, loadExpenseSettings } from '$lib/server/expenses/queries';
import { loadVisibleCalendarEventOptions } from '$lib/server/calendar/resource-links';
import {
	parseExpenseCategoryForm,
	parseExpenseCollectionForm,
	parseExpenseMemberForm,
	parseExpenseUuidField,
	type ExpenseValidationErrors
} from '$lib/server/expenses/schemas';

function invalidForm(errors: ExpenseValidationErrors) {
	return fail(400, {
		error: Object.values(errors)[0] ?? 'Los datos enviados no son válidos.',
		fieldErrors: errors
	});
}

function commandFailure(caught: unknown, fallback: string) {
	if (caught instanceof ExpenseCommandError) return fail(caught.status, { error: caught.message });
	console.error(fallback, caught);
	return fail(500, { error: fallback });
}

function ensureRouteCollection(collectionId: string, routeCollectionId: string) {
	if (collectionId !== routeCollectionId)
		return fail(400, { error: 'La colección seleccionada no coincide con esta página.' });
	return null;
}

export const load: PageServerLoad = async ({ parent, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) throw error(401, 'Unauthorized');
	const { expenseCollection } = await parent();
	try {
		const [settings, calendarEvents, association] = await Promise.all([
			loadExpenseSettings(supabase, expenseCollection),
			loadVisibleCalendarEventOptions(supabase, expenseCollection.familyId),
			supabase
				.from('expense_collection_event_links')
				.select('event_id')
				.eq('collection_id', expenseCollection.id)
				.maybeSingle()
		]);
		if (association.error)
			throw new ExpenseQueryError('No se pudo cargar la asociación con calendario.');
		return {
			...settings,
			calendarEvents,
			calendarEvent: calendarEvents.find((event) => event.id === association.data?.event_id) ?? null
		};
	} catch (caught) {
		if (caught instanceof ExpenseQueryError) console.error(caught.message);
		else console.error('Unexpected expense settings query failure', caught);
		throw error(500, 'No se pudieron cargar los ajustes de la colección.');
	}
};

const moduleActions: Actions = {
	setCalendarEvent: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Autenticación requerida.' });
		const form = await request.formData();
		const selection = form.get('calendar_event_id');
		if (typeof selection !== 'string')
			return fail(400, { error: 'Selecciona una acción de calendario.' });
		const change = selection === '__keep__' ? 'keep' : selection ? 'replace' : 'clear';
		if (change === 'replace') {
			const parsed = parseExpenseUuidField(form, 'calendar_event_id');
			if (!parsed.success) return invalidForm(parsed.errors);
		}
		const { error: associationError } = await supabase.rpc('set_expense_collection_event', {
			p_collection_id: params.collectionId,
			p_change: change,
			p_event_id: (change === 'replace' ? selection : null) as string
		});
		if (associationError)
			return fail(associationError.code === '42501' ? 403 : 400, {
				error:
					'No se pudo cambiar la asociación. Debes gestionar la colección y poder ver el evento de esta misma familia.'
			});
		return { success: true, message: 'Asociación del calendario actualizada.' };
	},
	updateCollection: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		const parsed = parseExpenseCollectionForm(await request.formData());
		if (!parsed.success) return invalidForm(parsed.errors);
		try {
			await updateExpenseCollection(supabase, params.collectionId, parsed.data);
			return { success: true, message: 'Colección actualizada.' };
		} catch (caught) {
			return commandFailure(caught, 'No se pudo actualizar la colección.');
		}
	},

	archiveCollection: async ({ params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		try {
			await setExpenseCollectionArchived(supabase, params.collectionId, true);
			return { success: true, message: 'Colección archivada.' };
		} catch (caught) {
			return commandFailure(caught, 'No se pudo archivar la colección.');
		}
	},

	restoreCollection: async ({ params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		try {
			await setExpenseCollectionArchived(supabase, params.collectionId, false);
			return { success: true, message: 'Colección reactivada.' };
		} catch (caught) {
			return commandFailure(caught, 'No se pudo reactivar la colección.');
		}
	},

	inviteMember: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		const parsed = parseExpenseMemberForm(await request.formData());
		if (!parsed.success) return invalidForm(parsed.errors);
		const mismatch = ensureRouteCollection(parsed.data.collectionId, params.collectionId);
		if (mismatch) return mismatch;
		try {
			await inviteExpenseCollectionMember(
				supabase,
				params.collectionId,
				parsed.data.userId,
				parsed.data.role
			);
			return { success: true, message: 'Invitación creada.' };
		} catch (caught) {
			return commandFailure(caught, 'No se pudo invitar al participante.');
		}
	},

	changeRole: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		const parsed = parseExpenseMemberForm(await request.formData());
		if (!parsed.success) return invalidForm(parsed.errors);
		const mismatch = ensureRouteCollection(parsed.data.collectionId, params.collectionId);
		if (mismatch) return mismatch;
		try {
			await changeExpenseCollectionRole(
				supabase,
				params.collectionId,
				parsed.data.userId,
				parsed.data.role
			);
			return { success: true, message: 'Rol actualizado.' };
		} catch (caught) {
			return commandFailure(caught, 'No se pudo cambiar el rol.');
		}
	},

	revokeMember: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		const parsed = parseExpenseUuidField(
			await request.formData(),
			'user_id',
			'El participante seleccionado no es válido.'
		);
		if (!parsed.success) return invalidForm(parsed.errors);
		try {
			await revokeExpenseCollectionMember(supabase, params.collectionId, parsed.data);
			return { success: true, message: 'Acceso revocado.' };
		} catch (caught) {
			return commandFailure(caught, 'No se pudo revocar el acceso.');
		}
	},

	transferOwnership: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		const parsed = parseExpenseUuidField(
			await request.formData(),
			'user_id',
			'El nuevo propietario no es válido.'
		);
		if (!parsed.success) return invalidForm(parsed.errors);
		try {
			await transferExpenseCollectionOwnership(supabase, params.collectionId, parsed.data);
			return { success: true, message: 'Propiedad transferida.' };
		} catch (caught) {
			return commandFailure(caught, 'No se pudo transferir la propiedad.');
		}
	},

	createCategory: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		const parsed = parseExpenseCategoryForm(await request.formData());
		if (!parsed.success) return invalidForm(parsed.errors);
		try {
			await createExpenseCategory(
				supabase,
				params.collectionId,
				parsed.data.name,
				parsed.data.color
			);
			return { success: true, message: 'Categoría creada.' };
		} catch (caught) {
			return commandFailure(caught, 'No se pudo crear la categoría.');
		}
	},

	deleteCategory: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		const parsed = parseExpenseUuidField(
			await request.formData(),
			'category_id',
			'La categoría seleccionada no es válida.'
		);
		if (!parsed.success) return invalidForm(parsed.errors);
		try {
			await deleteExpenseCategory(supabase, params.collectionId, parsed.data);
			return { success: true, message: 'Categoría eliminada.' };
		} catch (caught) {
			return commandFailure(caught, 'No se pudo eliminar la categoría.');
		}
	},

	leaveCollection: async ({ params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		try {
			await leaveExpenseCollection(supabase, params.collectionId);
		} catch (caught) {
			return commandFailure(caught, 'No se pudo abandonar la colección.');
		}
		throw redirect(303, `/family/${params.familyId}/expenses`);
	}
};

export const actions: Actions = guardModuleActions('expenses', moduleActions);
