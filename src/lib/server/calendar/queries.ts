import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '$lib/types/database';
import type { CalendarQueryState, CalendarVisibility } from './schemas';

export class CalendarQueryError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CalendarQueryError';
	}
}

export interface CalendarMember {
	id: string;
	displayName: string;
	avatarUrl: string | null;
	role: 'owner' | 'admin' | 'member';
}

export interface CalendarCategory {
	id: string;
	name: string;
	icon: string | null;
	color: string | null;
}

export interface CalendarOccurrence {
	eventId: string;
	title: string;
	description: string | null;
	start: string;
	end: string;
	index: number;
	timezone: string;
	allDay: boolean;
	visibility: CalendarVisibility;
	createdBy: string;
	creatorName: string;
	wishlistCategoryId: string | null;
	version: number;
	participantIds: string[];
}

export interface CalendarEventRecord extends Tables<'calendar_events'> {
	participantIds: string[];
	reminderMinutes: number | null;
	canManage: boolean;
}

export interface CalendarPageData {
	query: CalendarQueryState;
	members: CalendarMember[];
	categories: CalendarCategory[];
	occurrences: CalendarOccurrence[];
	events: CalendarEventRecord[];
}

function assertQuery(error: { message: string } | null, message: string): void {
	if (error) throw new CalendarQueryError(`${message}: ${error.message}`);
}

export async function loadCalendarFormContext(
	supabase: SupabaseClient<Database>,
	familyId: string
): Promise<{ memberIds: Set<string>; categoryIds: Set<string> }> {
	const [membersResult, categoriesResult] = await Promise.all([
		supabase.from('family_members').select('user_id').eq('family_id', familyId),
		supabase.from('gift_event_categories').select('id').eq('family_id', familyId)
	]);
	assertQuery(membersResult.error, 'No se pudieron validar los miembros');
	assertQuery(categoriesResult.error, 'No se pudieron validar las categorías Wishlist');
	return {
		memberIds: new Set(
			(membersResult.data ?? [])
				.map((member) => member.user_id)
				.filter((id): id is string => Boolean(id))
		),
		categoryIds: new Set((categoriesResult.data ?? []).map((category) => category.id))
	};
}

export async function loadCalendarPage(
	supabase: SupabaseClient<Database>,
	familyId: string,
	userId: string,
	userRole: string,
	query: CalendarQueryState
): Promise<CalendarPageData> {
	const [membersResult, categoriesResult, occurrencesResult] = await Promise.all([
		supabase
			.from('family_members')
			.select('user_id, role')
			.eq('family_id', familyId)
			.order('joined_at'),
		supabase
			.from('gift_event_categories')
			.select('id, name, icon, color')
			.eq('family_id', familyId)
			.order('event_date', { ascending: true, nullsFirst: false })
			.order('name'),
		supabase.rpc('get_calendar_occurrences', {
			p_family_id: familyId,
			p_from: query.from,
			p_to: query.to,
			p_participant_id: query.participantId ?? undefined
		})
	]);
	assertQuery(membersResult.error, 'No se pudieron cargar los miembros');
	assertQuery(categoriesResult.error, 'No se pudieron cargar las categorías Wishlist');
	assertQuery(occurrencesResult.error, 'No se pudieron cargar los eventos');

	const membershipRows = (membersResult.data ?? []).filter(
		(member): member is typeof member & { user_id: string } => Boolean(member.user_id)
	);
	const profileIds = [...new Set(membershipRows.map((member) => member.user_id))];
	const { data: profiles, error: profilesError } = profileIds.length
		? await supabase
				.from('public_profiles')
				.select('id, display_name, avatar_url')
				.in('id', profileIds)
		: { data: [], error: null };
	assertQuery(profilesError, 'No se pudieron cargar los perfiles');
	const profileMap = new Map(
		(profiles ?? []).map((profile) => [
			profile.id,
			{
				displayName: profile.display_name?.trim() || 'Usuario',
				avatarUrl: profile.avatar_url
			}
		])
	);
	const members: CalendarMember[] = membershipRows.map((member) => ({
		id: member.user_id,
		displayName: profileMap.get(member.user_id)?.displayName ?? 'Usuario',
		avatarUrl: profileMap.get(member.user_id)?.avatarUrl ?? null,
		role: member.role as CalendarMember['role']
	}));

	const occurrenceRows = occurrencesResult.data ?? [];
	const eventIds = [...new Set(occurrenceRows.map((occurrence) => occurrence.event_id))];
	const [eventResult, participantResult, reminderResult] = eventIds.length
		? await Promise.all([
				supabase.from('calendar_events').select('*').in('id', eventIds),
				supabase
					.from('calendar_event_participants')
					.select('event_id, user_id')
					.in('event_id', eventIds),
				supabase
					.from('calendar_event_reminders')
					.select('event_id, minutes_before, occurrence_start')
					.in('event_id', eventIds)
					.eq('recipient_id', userId)
					.is('delivered_at', null)
					.order('occurrence_start')
			])
		: [
				{ data: [], error: null },
				{ data: [], error: null },
				{ data: [], error: null }
			];
	assertQuery(eventResult.error, 'No se pudo cargar el detalle de los eventos');
	assertQuery(participantResult.error, 'No se pudieron cargar los participantes');
	assertQuery(reminderResult.error, 'No se pudieron cargar los recordatorios');

	const participantsByEvent = new Map<string, string[]>();
	for (const participant of participantResult.data ?? []) {
		const current = participantsByEvent.get(participant.event_id) ?? [];
		current.push(participant.user_id);
		participantsByEvent.set(participant.event_id, current);
	}
	const reminderByEvent = new Map<string, number>();
	for (const reminder of reminderResult.data ?? []) {
		if (!reminderByEvent.has(reminder.event_id))
			reminderByEvent.set(reminder.event_id, reminder.minutes_before);
	}

	const events: CalendarEventRecord[] = (eventResult.data ?? []).map((event) => ({
		...event,
		participantIds: participantsByEvent.get(event.id) ?? [],
		reminderMinutes: reminderByEvent.get(event.id) ?? null,
		canManage: event.created_by === userId || userRole === 'owner' || userRole === 'admin'
	}));

	const occurrences: CalendarOccurrence[] = occurrenceRows.map((occurrence) => ({
		eventId: occurrence.event_id,
		title: occurrence.title,
		description: occurrence.description,
		start: occurrence.occurrence_start,
		end: occurrence.occurrence_end,
		index: occurrence.occurrence_index,
		timezone: occurrence.timezone,
		allDay: occurrence.all_day,
		visibility: occurrence.visibility as CalendarVisibility,
		createdBy: occurrence.created_by,
		creatorName: profileMap.get(occurrence.created_by)?.displayName ?? 'Usuario',
		wishlistCategoryId: occurrence.wishlist_category_id,
		version: occurrence.version,
		participantIds: occurrence.participant_ids ?? []
	}));

	return {
		query,
		members,
		categories: (categoriesResult.data ?? []).map((category) => ({
			id: category.id,
			name: category.name,
			icon: category.icon,
			color: category.color
		})),
		occurrences,
		events
	};
}
