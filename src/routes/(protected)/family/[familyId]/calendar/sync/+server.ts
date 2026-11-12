import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireModuleAvailable } from '$lib/server/modules/availability';
import { CalendarCommandError } from '$lib/server/calendar/commands';
import {
	autoSyncGoogleCalendar,
	loadGoogleCalendarPanel
} from '$lib/server/calendar/google/service';
import {
	autoSyncMicrosoftCalendar,
	loadMicrosoftCalendarPanel
} from '$lib/server/calendar/microsoft/service';

export const POST: RequestHandler = async ({ request, url, params, locals }) => {
	const headers = { 'Cache-Control': 'no-store' };
	if (request.headers.get('origin') !== url.origin)
		return json({ error: 'Origen no permitido.' }, { status: 403, headers });
	const { user } = await locals.safeGetSession();
	if (!user) return json({ error: 'Autenticación requerida.' }, { status: 401, headers });
	await requireModuleAvailable(locals.supabase, params.familyId, 'calendar');
	const providers = [
		{
			provider: 'google_calendar',
			label: 'Google Calendar',
			load: loadGoogleCalendarPanel,
			sync: autoSyncGoogleCalendar
		},
		{
			provider: 'microsoft_calendar',
			label: 'Outlook',
			load: loadMicrosoftCalendarPanel,
			sync: autoSyncMicrosoftCalendar
		}
	] as const;
	const results = await Promise.all(
		providers.map(async (provider) => {
			try {
				const panel = await provider.load(locals.supabase, params.familyId, user.id);
				if (!panel.configured || !panel.connection?.calendarId)
					return { provider: provider.provider, status: 'unconfigured' as const, changed: false };
				return {
					provider: provider.provider,
					...(await provider.sync(locals.supabase, params.familyId, user.id, panel.connection.id))
				};
			} catch (caught) {
				return {
					provider: provider.provider,
					status: 'error' as const,
					changed: false,
					message:
						caught instanceof CalendarCommandError
							? caught.message
							: `No se pudo sincronizar ${provider.label}. Inténtalo de nuevo.`
				};
			}
		})
	);
	return json({ results, changed: results.some((result) => result.changed) }, { headers });
};
