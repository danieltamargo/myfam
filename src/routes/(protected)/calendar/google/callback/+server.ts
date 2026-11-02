import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { completeGoogleCalendarOAuth } from '$lib/server/calendar/google/oauth';
import { CalendarCommandError } from '$lib/server/calendar/commands';
import { GoogleCalendarError } from '$lib/server/calendar/google/provider';

export const GET: RequestHandler = async ({ url, cookies, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) throw error(401, 'Inicia sesión en MyFamily antes de conectar el calendario.');
	let familyId: string;
	try {
		familyId = await completeGoogleCalendarOAuth(locals.supabase, cookies, url, user.id);
	} catch (caught) {
		if (caught instanceof CalendarCommandError) throw error(caught.status, caught.message);
		if (caught instanceof GoogleCalendarError)
			throw error(
				502,
				'Google no pudo completar la autorización. Vuelve al calendario e inténtalo de nuevo.'
			);
		throw error(
			503,
			'No se pudo conectar Google Calendar. Comprueba la configuración del servidor.'
		);
	}
	throw redirect(303, `/family/${familyId}/calendar?google=connected`);
};
