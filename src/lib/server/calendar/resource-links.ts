import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '$lib/types/database';
import { CalendarQueryError } from './queries';

export type CalendarEventOption = Pick<
	Tables<'calendar_events'>,
	'id' | 'title' | 'starts_at' | 'timezone'
>;

export async function loadVisibleCalendarEventOptions(
	supabase: SupabaseClient<Database>,
	familyId: string
): Promise<CalendarEventOption[]> {
	const events: CalendarEventOption[] = [];
	for (let offset = 0; ; offset += 500) {
		const { data, error } = await supabase
			.from('calendar_events')
			.select('id, title, starts_at, timezone')
			.eq('family_id', familyId)
			.order('starts_at', { ascending: false })
			.order('id')
			.range(offset, offset + 499);
		if (error) throw new CalendarQueryError('No se pudieron cargar los eventos disponibles.');
		events.push(...(data ?? []));
		if ((data ?? []).length < 500) return events;
	}
}

export async function loadGiftCalendarAssociations(
	supabase: SupabaseClient<Database>,
	itemIds: string[]
) {
	const links: Pick<Tables<'gift_calendar_event_links'>, 'item_id' | 'event_id'>[] = [];
	for (let offset = 0; offset < itemIds.length; offset += 100) {
		const { data, error } = await supabase
			.from('gift_calendar_event_links')
			.select('item_id, event_id')
			.in('item_id', itemIds.slice(offset, offset + 100));
		if (error)
			throw new CalendarQueryError('No se pudieron cargar las asociaciones de los regalos.');
		links.push(...(data ?? []));
	}
	return links;
}
