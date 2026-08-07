import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { guardModuleActions, requireModuleAvailable } from '$lib/server/modules/availability';
import {
	createCalendarEvent,
	deleteCalendarEvent,
	CalendarCommandError,
	updateCalendarEvent
} from '$lib/server/calendar/commands';
import {
	CalendarQueryError,
	loadCalendarFormContext,
	loadCalendarPage
} from '$lib/server/calendar/queries';
import {
	parseCalendarEventForm,
	parseCalendarEventIdentity,
	parseCalendarQuery,
	type CalendarValidationErrors
} from '$lib/server/calendar/schemas';

function invalidForm(errors: CalendarValidationErrors) {
	return fail(400, {
		error: Object.values(errors)[0] ?? 'Los datos enviados no son válidos.',
		fieldErrors: errors
	});
}

function commandFailure(caught: unknown, fallback: string) {
	if (caught instanceof CalendarCommandError) return fail(caught.status, { error: caught.message });
	if (caught instanceof CalendarQueryError) return fail(500, { error: caught.message });
	console.error(fallback, caught);
	return fail(500, { error: fallback });
}

export const load: PageServerLoad = async ({
	parent,
	url,
	params,
	locals: { supabase, safeGetSession }
}) => {
	await requireModuleAvailable(supabase, params.familyId, 'calendar');
	const { user } = await safeGetSession();
	if (!user) throw error(401, 'Unauthorized');
	const { userRole } = await parent();
	try {
		return await loadCalendarPage(
			supabase,
			params.familyId,
			user.id,
			userRole,
			parseCalendarQuery(url.searchParams)
		);
	} catch (caught) {
		if (caught instanceof CalendarQueryError) console.error(caught.message);
		else console.error('Unexpected calendar query failure', caught);
		throw error(500, 'No se pudo cargar el calendario.');
	}
};

async function parseEventRequest(
	request: Request,
	supabase: Parameters<typeof loadCalendarFormContext>[0],
	familyId: string
) {
	const [formData, context] = await Promise.all([
		request.formData(),
		loadCalendarFormContext(supabase, familyId)
	]);
	return {
		formData,
		parsed: parseCalendarEventForm(formData, context.memberIds, context.categoryIds)
	};
}

const moduleActions: Actions = {
	createEvent: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		try {
			const { parsed } = await parseEventRequest(request, supabase, params.familyId);
			if (!parsed.success) return invalidForm(parsed.errors);
			const eventId = await createCalendarEvent(supabase, params.familyId, parsed.data);
			return { success: true, message: 'Evento creado.', eventId };
		} catch (caught) {
			return commandFailure(caught, 'No se pudo crear el evento.');
		}
	},

	updateEvent: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		try {
			const { formData, parsed } = await parseEventRequest(request, supabase, params.familyId);
			const identity = parseCalendarEventIdentity(formData);
			if (!identity.success) return invalidForm(identity.errors);
			if (!parsed.success) return invalidForm(parsed.errors);
			await updateCalendarEvent(
				supabase,
				identity.data.eventId,
				identity.data.version,
				parsed.data
			);
			return { success: true, message: 'Evento actualizado.' };
		} catch (caught) {
			return commandFailure(caught, 'No se pudo actualizar el evento.');
		}
	},

	deleteEvent: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		const identity = parseCalendarEventIdentity(await request.formData());
		if (!identity.success) return invalidForm(identity.errors);
		try {
			await deleteCalendarEvent(supabase, identity.data.eventId, identity.data.version);
			return { success: true, message: 'Evento eliminado.' };
		} catch (caught) {
			return commandFailure(caught, 'No se pudo eliminar el evento.');
		}
	}
};

export const actions: Actions = guardModuleActions('calendar', moduleActions);
