import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';
import type { CalendarEventInput } from './schemas';

export class CalendarCommandError extends Error {
	constructor(
		public readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'CalendarCommandError';
	}
}

function throwCalendarCommandError(error: PostgrestError, fallback: string): never {
	if (error.code === '42501')
		throw new CalendarCommandError(403, 'No tienes permiso para realizar esta acción.');
	if (error.code === 'P0002')
		throw new CalendarCommandError(404, 'El evento ya no está disponible.');
	if (error.code === '40001')
		throw new CalendarCommandError(
			409,
			'El evento cambió mientras lo editabas. Recarga la página e inténtalo de nuevo.'
		);
	if (error.code === '23503' || error.code === '23514' || error.code === '22023')
		throw new CalendarCommandError(400, 'Los datos del evento no son válidos.');
	throw new CalendarCommandError(500, fallback);
}

function nullableRpc<T>(value: T | null): T {
	return value as T;
}

function eventArgs(input: CalendarEventInput) {
	return {
		p_title: input.title,
		p_description: nullableRpc(input.description),
		p_starts_at: input.startsAt,
		p_ends_at: input.endsAt,
		p_timezone: input.timezone,
		p_all_day: input.allDay,
		p_visibility: input.visibility,
		p_participant_ids: input.participantIds,
		p_recurrence_frequency: input.recurrenceFrequency,
		p_recurrence_interval: input.recurrenceInterval,
		p_recurrence_until: nullableRpc(input.recurrenceUntil),
		p_recurrence_count: nullableRpc(input.recurrenceCount),
		p_wishlist_category_id: nullableRpc(input.wishlistCategoryId),
		p_reminder_minutes: nullableRpc(input.reminderMinutes)
	};
}

export async function createCalendarEvent(
	supabase: SupabaseClient<Database>,
	familyId: string,
	input: CalendarEventInput
): Promise<string> {
	const { data, error } = await supabase.rpc('create_calendar_event', {
		p_family_id: familyId,
		...eventArgs(input)
	});
	if (error) throwCalendarCommandError(error, 'No se pudo crear el evento.');
	return data;
}

export async function updateCalendarEvent(
	supabase: SupabaseClient<Database>,
	eventId: string,
	version: number,
	input: CalendarEventInput
): Promise<void> {
	const { error } = await supabase.rpc('update_calendar_event', {
		p_event_id: eventId,
		p_version: version,
		...eventArgs(input)
	});
	if (error) throwCalendarCommandError(error, 'No se pudo actualizar el evento.');
}

export async function deleteCalendarEvent(
	supabase: SupabaseClient<Database>,
	eventId: string,
	version: number
): Promise<void> {
	const { error } = await supabase.rpc('delete_calendar_event', {
		p_event_id: eventId,
		p_version: version
	});
	if (error) throwCalendarCommandError(error, 'No se pudo eliminar el evento.');
}
