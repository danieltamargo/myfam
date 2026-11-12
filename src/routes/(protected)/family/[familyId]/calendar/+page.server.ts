import { error, fail, redirect } from '@sveltejs/kit';
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
import { startGoogleCalendarOAuth } from '$lib/server/calendar/google/oauth';
import {
	loadGoogleCalendarPanel,
	selectGoogleCalendar,
	syncGoogleCalendar,
	exportGoogleCalendarEvent,
	disconnectGoogleCalendar,
	resolveGoogleCalendarConflict
} from '$lib/server/calendar/google/service';

import { startMicrosoftCalendarOAuth } from '$lib/server/calendar/microsoft/oauth';
import {
	loadMicrosoftCalendarPanel,
	selectMicrosoftCalendar,
	syncMicrosoftCalendar,
	exportMicrosoftCalendarEvent,
	disconnectMicrosoftCalendar,
	resolveMicrosoftCalendarConflict
} from '$lib/server/calendar/microsoft/service';

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
	depends,
	url,
	params,
	locals: { supabase, safeGetSession }
}) => {
	depends('app:calendar');
	await requireModuleAvailable(supabase, params.familyId, 'calendar');
	const { user } = await safeGetSession();
	if (!user) throw error(401, 'Unauthorized');
	const { userRole } = await parent();
	try {
		const [calendar, googleCalendar, microsoftCalendar] = await Promise.all([
			loadCalendarPage(
				supabase,
				params.familyId,
				user.id,
				userRole,
				parseCalendarQuery(url.searchParams)
			),
			loadGoogleCalendarPanel(supabase, params.familyId, user.id),
			loadMicrosoftCalendarPanel(supabase, params.familyId, user.id)
		]);
		return { ...calendar, googleCalendar, microsoftCalendar, currentUserId: user.id };
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

type GoogleOperation = (
	client: Parameters<typeof syncGoogleCalendar>[0],
	familyId: string,
	userId: string,
	connectionId: string,
	form: FormData
) => Promise<string>;
async function runGoogleAction(
	request: Request,
	familyId: string,
	locals: App.Locals,
	operation: GoogleOperation
) {
	const { user } = await locals.safeGetSession();
	if (!user) return fail(401, { error: 'Autenticación requerida.' });
	try {
		const form = await request.formData();
		const connectionId = form.get('connection_id');
		if (
			typeof connectionId !== 'string' ||
			!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
				connectionId
			)
		)
			return fail(400, { error: 'Conexión no válida.' });
		return {
			success: true,
			message: await operation(locals.supabase, familyId, user.id, connectionId, form)
		};
	} catch (caught) {
		if (caught instanceof CalendarCommandError)
			return fail(caught.status, { error: caught.message });
		return fail(503, {
			error: 'No se pudo completar la conexión. Comprueba la configuración de Google Calendar.'
		});
	}
}

type MicrosoftOperation = (
	client: Parameters<typeof syncMicrosoftCalendar>[0],
	familyId: string,
	userId: string,
	connectionId: string,
	form: FormData
) => Promise<string>;
async function runMicrosoftAction(
	request: Request,
	familyId: string,
	locals: App.Locals,
	operation: MicrosoftOperation
) {
	const { user } = await locals.safeGetSession();
	if (!user) return fail(401, { error: 'Autenticación requerida.' });
	try {
		const form = await request.formData();
		const connectionId = form.get('connection_id');
		if (
			typeof connectionId !== 'string' ||
			!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
				connectionId
			)
		)
			return fail(400, { error: 'Conexión no válida.' });
		return {
			success: true,
			message: await operation(locals.supabase, familyId, user.id, connectionId, form)
		};
	} catch (caught) {
		if (caught instanceof CalendarCommandError)
			return fail(caught.status, { error: caught.message });
		return fail(503, {
			error: 'No se pudo completar la conexión. Comprueba la configuración de Microsoft Calendar.'
		});
	}
}

const moduleActions: Actions = {
	connectGoogle: async ({ params, cookies, locals }) => {
		const { user } = await locals.safeGetSession();
		if (!user) return fail(401, { error: 'Autenticación requerida.' });
		let target: string;
		try {
			target = await startGoogleCalendarOAuth(locals.supabase, cookies, params.familyId, user.id);
		} catch (caught) {
			return fail(caught instanceof CalendarCommandError ? caught.status : 503, {
				error:
					caught instanceof CalendarCommandError
						? caught.message
						: 'Google Calendar no está configurado en el servidor.'
			});
		}
		throw redirect(303, target);
	},
	selectGoogleCalendar: ({ request, params, locals }) =>
		runGoogleAction(
			request,
			params.familyId,
			locals,
			async (client, familyId, userId, connectionId, form) => {
				const calendarId = form.get('calendar_id');
				if (typeof calendarId !== 'string')
					throw new CalendarCommandError(400, 'Selecciona un calendario propio.');
				await selectGoogleCalendar(client, familyId, userId, connectionId, calendarId);
				return 'Calendario seleccionado. Pulsa Sincronizar ahora para importar sus eventos.';
			}
		),
	syncGoogle: ({ request, params, locals }) =>
		runGoogleAction(
			request,
			params.familyId,
			locals,
			async (client, familyId, userId, connectionId) => {
				const conflicts = await syncGoogleCalendar(client, familyId, userId, connectionId);
				return conflicts
					? `Sincronización realizada con ${conflicts} conflictos pendientes. No se han sobrescrito esos eventos.`
					: 'Google Calendar sincronizado.';
			}
		),
	exportGoogle: ({ request, params, locals }) =>
		runGoogleAction(
			request,
			params.familyId,
			locals,
			async (client, familyId, userId, connectionId, form) => {
				const identity = parseCalendarEventIdentity(form);
				if (!identity.success)
					throw new CalendarCommandError(400, 'Selecciona un evento actualizado.');
				await exportGoogleCalendarEvent(
					client,
					familyId,
					userId,
					connectionId,
					identity.data.eventId,
					identity.data.version
				);
				return 'Evento enviado a tu calendario Google como privado.';
			}
		),
	resolveGoogleConflict: ({ request, params, locals }) =>
		runGoogleAction(
			request,
			params.familyId,
			locals,
			async (client, familyId, userId, connectionId, form) => {
				const identity = parseCalendarEventIdentity(form);
				const remoteId = form.get('remote_event_id');
				const localDeleted = form.get('local_deleted') === 'true';
				const choice = form.get('choice');
				if (
					(!localDeleted && !identity.success) ||
					typeof remoteId !== 'string' ||
					remoteId.length > 1024 ||
					!['google', 'local'].includes(String(choice))
				)
					throw new CalendarCommandError(400, 'Conflicto no válido.');
				await resolveGoogleCalendarConflict(
					client,
					familyId,
					userId,
					connectionId,
					remoteId,
					identity.success ? identity.data.version : 0,
					choice as 'google' | 'local'
				);
				return 'Conflicto resuelto con la versión elegida.';
			}
		),
	disconnectGoogle: ({ request, params, locals }) =>
		runGoogleAction(
			request,
			params.familyId,
			locals,
			async (client, familyId, userId, connectionId) => {
				await disconnectGoogleCalendar(client, familyId, userId, connectionId);
				return 'Google Calendar desconectado y acceso revocado. Tus eventos originales permanecen en Google.';
			}
		),
	connectMicrosoft: async ({ params, cookies, locals }) => {
		const { user } = await locals.safeGetSession();
		if (!user) return fail(401, { error: 'Autenticación requerida.' });
		let target: string;
		try {
			target = await startMicrosoftCalendarOAuth(
				locals.supabase,
				cookies,
				params.familyId,
				user.id
			);
		} catch (caught) {
			return fail(caught instanceof CalendarCommandError ? caught.status : 503, {
				error:
					caught instanceof CalendarCommandError
						? caught.message
						: 'Microsoft Calendar no está configurado en el servidor.'
			});
		}
		throw redirect(303, target);
	},
	selectMicrosoftCalendar: ({ request, params, locals }) =>
		runMicrosoftAction(
			request,
			params.familyId,
			locals,
			async (client, familyId, userId, connectionId, form) => {
				const calendarId = form.get('calendar_id');
				if (typeof calendarId !== 'string')
					throw new CalendarCommandError(400, 'Selecciona un calendario propio.');
				await selectMicrosoftCalendar(client, familyId, userId, connectionId, calendarId);
				return 'Calendario seleccionado. Pulsa Sincronizar ahora para importar sus eventos.';
			}
		),
	syncMicrosoft: ({ request, params, locals }) =>
		runMicrosoftAction(
			request,
			params.familyId,
			locals,
			async (client, familyId, userId, connectionId) => {
				const conflicts = await syncMicrosoftCalendar(client, familyId, userId, connectionId);
				return conflicts
					? `Sincronización realizada con ${conflicts} conflictos pendientes. No se han sobrescrito esos eventos.`
					: 'Microsoft Calendar sincronizado.';
			}
		),
	exportMicrosoft: ({ request, params, locals }) =>
		runMicrosoftAction(
			request,
			params.familyId,
			locals,
			async (client, familyId, userId, connectionId, form) => {
				const identity = parseCalendarEventIdentity(form);
				if (!identity.success)
					throw new CalendarCommandError(400, 'Selecciona un evento actualizado.');
				await exportMicrosoftCalendarEvent(
					client,
					familyId,
					userId,
					connectionId,
					identity.data.eventId,
					identity.data.version
				);
				return 'Evento enviado a tu calendario Microsoft como privado.';
			}
		),
	resolveMicrosoftConflict: ({ request, params, locals }) =>
		runMicrosoftAction(
			request,
			params.familyId,
			locals,
			async (client, familyId, userId, connectionId, form) => {
				const identity = parseCalendarEventIdentity(form);
				const remoteId = form.get('remote_event_id');
				const localDeleted = form.get('local_deleted') === 'true';
				const choice = form.get('choice');
				if (
					(!localDeleted && !identity.success) ||
					typeof remoteId !== 'string' ||
					remoteId.length > 1024 ||
					!['google', 'local'].includes(String(choice))
				)
					throw new CalendarCommandError(400, 'Conflicto no válido.');
				await resolveMicrosoftCalendarConflict(
					client,
					familyId,
					userId,
					connectionId,
					remoteId,
					identity.success ? identity.data.version : 0,
					choice as 'google' | 'local'
				);
				return 'Conflicto resuelto con la versión elegida.';
			}
		),
	disconnectMicrosoft: ({ request, params, locals }) =>
		runMicrosoftAction(
			request,
			params.familyId,
			locals,
			async (client, familyId, userId, connectionId) => {
				await disconnectMicrosoftCalendar(client, familyId, userId, connectionId);
				return 'Outlook desconectado de MyFamily. Retira también el permiso en tu cuenta Microsoft si quieres revocar el consentimiento.';
			}
		),
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
