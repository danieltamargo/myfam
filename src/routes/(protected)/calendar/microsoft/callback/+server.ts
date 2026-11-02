import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { completeMicrosoftCalendarOAuth } from '$lib/server/calendar/microsoft/oauth';
import { CalendarCommandError } from '$lib/server/calendar/commands';
import { MicrosoftCalendarError } from '$lib/server/calendar/microsoft/provider';

export const GET: RequestHandler = async ({ url, cookies, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) throw error(401, 'Inicia sesión en MyFamily antes de conectar el calendario.');
	let familyId: string;
	try {
		familyId = await completeMicrosoftCalendarOAuth(locals.supabase, cookies, url, user.id);
	} catch (caught) {
		if (caught instanceof CalendarCommandError) throw error(caught.status, caught.message);
		if (caught instanceof MicrosoftCalendarError)
			throw error(
				502,
				'Microsoft no pudo completar la autorización. Vuelve al calendario e inténtalo de nuevo.'
			);
		throw error(
			503,
			'No se pudo conectar Microsoft Calendar. Comprueba la configuración del servidor.'
		);
	}
	throw redirect(303, `/family/${familyId}/calendar?microsoft=connected`);
};
