import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { guardModuleActions, requireModuleAvailable } from '$lib/server/modules/availability';
import {
	acceptExpenseCollectionInvitation,
	createExpenseCollection,
	ExpenseCommandError
} from '$lib/server/expenses/commands';
import { loadExpenseCollections, ExpenseQueryError } from '$lib/server/expenses/queries';
import { loadVisibleCalendarEventOptions } from '$lib/server/calendar/resource-links';
import {
	parseExpenseCollectionForm,
	parseExpenseCollectionId,
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

export const load: PageServerLoad = async ({
	params,
	url,
	locals: { supabase, safeGetSession }
}) => {
	await requireModuleAvailable(supabase, params.familyId, 'expenses');
	const { user } = await safeGetSession();
	if (!user) throw error(401, 'Unauthorized');
	let selectedCalendarEvent = null;
	if (url.searchParams.has('event')) {
		await requireModuleAvailable(supabase, params.familyId, 'calendar');
		const options = await loadVisibleCalendarEventOptions(supabase, params.familyId);
		selectedCalendarEvent =
			options.find((event) => event.id === url.searchParams.get('event')) ?? null;
		if (!selectedCalendarEvent) throw error(404, 'Evento no disponible.');
	}
	try {
		return {
			...(await loadExpenseCollections(supabase, params.familyId, user.id)),
			selectedCalendarEvent
		};
	} catch (caught) {
		if (caught instanceof ExpenseQueryError) console.error(caught.message);
		else console.error('Unexpected expense collections query failure', caught);
		throw error(500, 'No se pudieron cargar las colecciones de gastos.');
	}
};

const moduleActions: Actions = {
	createCollection: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		const formData = await request.formData();
		const parsed = parseExpenseCollectionForm(formData);
		if (!parsed.success) return invalidForm(parsed.errors);
		const eventId = formData.get('calendar_event_id');
		if (eventId) {
			await requireModuleAvailable(supabase, params.familyId, 'calendar');
			const options = await loadVisibleCalendarEventOptions(supabase, params.familyId);
			if (!options.some((event) => event.id === eventId))
				return fail(400, { error: 'Evento no disponible.' });
		}
		let collectionId: string;
		try {
			collectionId = await createExpenseCollection(supabase, params.familyId, parsed.data);
		} catch (caught) {
			return commandFailure(caught, 'No se pudo crear la colección de gastos.');
		}
		throw redirect(
			303,
			`/family/${params.familyId}/expenses/${collectionId}${eventId ? `?event=${eventId}#nuevo-gasto` : ''}`
		);
	},

	acceptInvitation: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		const formData = await request.formData();
		const parsed = parseExpenseCollectionId(formData);
		if (!parsed.success) return invalidForm(parsed.errors);
		const eventId = formData.get('calendar_event_id');
		if (eventId) {
			await requireModuleAvailable(supabase, params.familyId, 'calendar');
			const options = await loadVisibleCalendarEventOptions(supabase, params.familyId);
			if (!options.some((event) => event.id === eventId))
				return fail(400, { error: 'Evento no disponible.' });
		}
		try {
			await acceptExpenseCollectionInvitation(supabase, parsed.data);
		} catch (caught) {
			return commandFailure(caught, 'No se pudo aceptar la invitación.');
		}
		throw redirect(
			303,
			`/family/${params.familyId}/expenses/${parsed.data}${eventId ? `?event=${eventId}#nuevo-gasto` : ''}`
		);
	}
};

export const actions: Actions = guardModuleActions('expenses', moduleActions);
