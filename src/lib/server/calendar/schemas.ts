export const CALENDAR_LIMITS = {
	title: 160,
	description: 4_000,
	maxParticipants: 100,
	maxOccurrences: 366,
	maxReminderMinutes: 10_080
} as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCAL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type CalendarVisibility = 'family' | 'selected_members';
export type CalendarRecurrence = 'none' | 'daily' | 'weekly' | 'monthly';
export type CalendarView = 'month' | 'agenda';
export type CalendarValidationErrors = Record<string, string>;
export type CalendarValidationResult<T> =
	| { success: true; data: T }
	| { success: false; errors: CalendarValidationErrors };

export interface CalendarEventInput {
	title: string;
	description: string | null;
	startsAt: string;
	endsAt: string;
	timezone: string;
	allDay: boolean;
	visibility: CalendarVisibility;
	participantIds: string[];
	recurrenceFrequency: CalendarRecurrence;
	recurrenceInterval: number;
	recurrenceUntil: string | null;
	recurrenceCount: number | null;
	wishlistCategoryId: string | null;
	reminderMinutes: number | null;
}

export interface CalendarEventIdentity {
	eventId: string;
	version: number;
}

export interface CalendarQueryState {
	view: CalendarView;
	anchor: string;
	participantId: string | null;
	from: string;
	to: string;
}

function textValue(formData: FormData, field: string): string {
	const value = formData.get(field);
	return typeof value === 'string' ? value.trim() : '';
}

function booleanValue(formData: FormData, field: string): boolean {
	return formData.get(field) === 'true' || formData.get(field) === 'on';
}

function isUuid(value: string): boolean {
	return UUID_PATTERN.test(value);
}

export function isValidIanaTimezone(timezone: string): boolean {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date(0));
		return !/^(posix|right)\//.test(timezone);
	} catch {
		return false;
	}
}

function localPartsAt(instant: number, timezone: string): string {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23'
	}).formatToParts(new Date(instant));
	const part = (type: Intl.DateTimeFormatPartTypes) =>
		parts.find((candidate) => candidate.type === type)?.value ?? '';
	return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

/** Converts a wall-clock value to an instant without relying on the server's timezone. */
export function localDateTimeToIso(localValue: string, timezone: string): string | null {
	const match = LOCAL_DATE_TIME_PATTERN.exec(localValue);
	if (!match || !isValidIanaTimezone(timezone)) return null;
	const [, yearText, monthText, dayText, hourText, minuteText] = match;
	const year = Number(yearText);
	const month = Number(monthText);
	const day = Number(dayText);
	const hour = Number(hourText);
	const minute = Number(minuteText);
	const nominal = Date.UTC(year, month - 1, day, hour, minute);
	const nominalDate = new Date(nominal);
	if (
		nominalDate.getUTCFullYear() !== year ||
		nominalDate.getUTCMonth() !== month - 1 ||
		nominalDate.getUTCDate() !== day ||
		hour > 23 ||
		minute > 59
	)
		return null;

	// All civil offsets are contained in ±14 hours. A 15-minute scan also covers
	// historical and current quarter-hour zones and identifies DST gaps exactly.
	for (let deltaMinutes = -14 * 60; deltaMinutes <= 14 * 60; deltaMinutes += 15) {
		const candidate = nominal + deltaMinutes * 60_000;
		if (localPartsAt(candidate, timezone) === localValue) return new Date(candidate).toISOString();
	}
	return null;
}

function isIsoDate(value: string): boolean {
	if (!ISO_DATE_PATTERN.test(value)) return false;
	const [year, month, day] = value.split('-').map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));
	return (
		date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
	);
}

function addUtcDays(date: Date, days: number): Date {
	const next = new Date(date);
	next.setUTCDate(next.getUTCDate() + days);
	return next;
}

function startOfIsoWeek(date: Date): Date {
	const day = date.getUTCDay() || 7;
	return addUtcDays(date, 1 - day);
}

export function parseCalendarQuery(searchParams: URLSearchParams): CalendarQueryState {
	const requestedView = searchParams.get('view');
	const view: CalendarView = requestedView === 'agenda' ? 'agenda' : 'month';
	const requestedAnchor = searchParams.get('date') ?? '';
	const now = new Date();
	const fallbackAnchor = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
	const anchor = isIsoDate(requestedAnchor) ? requestedAnchor : fallbackAnchor;
	const [year, month, day] = anchor.split('-').map(Number);
	const anchorDate = new Date(Date.UTC(year, month - 1, day));
	let fromDate: Date;
	let toDate: Date;

	if (view === 'agenda') {
		fromDate = anchorDate;
		toDate = addUtcDays(anchorDate, 90);
	} else {
		fromDate = startOfIsoWeek(new Date(Date.UTC(year, month - 1, 1)));
		toDate = addUtcDays(fromDate, 42);
	}

	const participant = searchParams.get('participant');
	return {
		view,
		anchor,
		participantId: participant && isUuid(participant) ? participant : null,
		from: fromDate.toISOString(),
		to: toDate.toISOString()
	};
}

export function parseCalendarEventForm(
	formData: FormData,
	validMemberIds: ReadonlySet<string>,
	validWishlistCategoryIds: ReadonlySet<string>
): CalendarValidationResult<CalendarEventInput> {
	const errors: CalendarValidationErrors = {};
	const title = textValue(formData, 'title');
	const description = textValue(formData, 'description');
	const timezone = textValue(formData, 'timezone');
	const allDay = booleanValue(formData, 'all_day');
	let startLocal = textValue(formData, 'start_local');
	let endLocal = textValue(formData, 'end_local');
	const visibilityValue = textValue(formData, 'visibility');
	const recurrenceValue = textValue(formData, 'recurrence_frequency') || 'none';
	const recurrenceInterval = Number(textValue(formData, 'recurrence_interval') || '1');
	const recurrenceUntilLocal = textValue(formData, 'recurrence_until_local');
	const recurrenceCountText = textValue(formData, 'recurrence_count');
	const recurrenceCount = recurrenceCountText ? Number(recurrenceCountText) : null;
	const wishlistCategoryId = textValue(formData, 'wishlist_category_id');
	const reminderText = textValue(formData, 'reminder_minutes');
	const reminderMinutes = reminderText ? Number(reminderText) : null;
	const participantIds = [
		...new Set(
			formData
				.getAll('participant_ids')
				.filter((value): value is string => typeof value === 'string' && value.length > 0)
		)
	];

	if (!title) errors.title = 'El título es obligatorio.';
	else if (title.length > CALENDAR_LIMITS.title)
		errors.title = `El título no puede superar ${CALENDAR_LIMITS.title} caracteres.`;
	if (description.length > CALENDAR_LIMITS.description)
		errors.description = `La descripción no puede superar ${CALENDAR_LIMITS.description} caracteres.`;
	if (!isValidIanaTimezone(timezone)) errors.timezone = 'Selecciona una zona horaria IANA válida.';

	if (allDay) {
		if (/^\d{4}-\d{2}-\d{2}$/.test(startLocal)) startLocal += 'T00:00';
		if (/^\d{4}-\d{2}-\d{2}$/.test(endLocal)) endLocal += 'T00:00';
	}
	const startsAt = localDateTimeToIso(startLocal, timezone);
	const endsAt = localDateTimeToIso(endLocal, timezone);
	if (!startsAt) errors.start_local = 'La fecha y hora inicial no existen en esa zona horaria.';
	if (!endsAt) errors.end_local = 'La fecha y hora final no existen en esa zona horaria.';
	if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt))
		errors.end_local = 'El final debe ser posterior al inicio.';
	if (allDay && (!startLocal.endsWith('T00:00') || !endLocal.endsWith('T00:00')))
		errors.all_day = 'Los eventos de día completo deben comenzar y terminar a medianoche.';

	if (visibilityValue !== 'family' && visibilityValue !== 'selected_members')
		errors.visibility = 'La visibilidad seleccionada no es válida.';
	if (participantIds.length > CALENDAR_LIMITS.maxParticipants)
		errors.participant_ids = 'Se han seleccionado demasiados participantes.';
	else if (participantIds.some((id) => !isUuid(id) || !validMemberIds.has(id)))
		errors.participant_ids = 'Todos los participantes deben pertenecer a la familia.';

	if (!['none', 'daily', 'weekly', 'monthly'].includes(recurrenceValue))
		errors.recurrence_frequency = 'La repetición seleccionada no es válida.';
	if (!Number.isInteger(recurrenceInterval) || recurrenceInterval < 1 || recurrenceInterval > 30)
		errors.recurrence_interval = 'El intervalo debe estar entre 1 y 30.';

	let recurrenceUntil: string | null = null;
	if (recurrenceValue !== 'none') {
		const normalizedRecurrenceUntil =
			allDay && /^\d{4}-\d{2}-\d{2}$/.test(recurrenceUntilLocal)
				? `${recurrenceUntilLocal}T00:00`
				: recurrenceUntilLocal;
		recurrenceUntil = localDateTimeToIso(normalizedRecurrenceUntil, timezone);
		if (!recurrenceUntil)
			errors.recurrence_until_local = 'Indica hasta cuándo se repite el evento.';
		else if (startsAt && new Date(recurrenceUntil) < new Date(startsAt))
			errors.recurrence_until_local = 'La repetición no puede terminar antes del evento.';
		else if (
			startsAt &&
			new Date(recurrenceUntil) >
				new Date(new Date(startsAt).setUTCFullYear(new Date(startsAt).getUTCFullYear() + 2))
		)
			errors.recurrence_until_local = 'La repetición no puede superar dos años.';
		if (
			recurrenceCount !== null &&
			(!Number.isInteger(recurrenceCount) ||
				recurrenceCount < 1 ||
				recurrenceCount > CALENDAR_LIMITS.maxOccurrences)
		)
			errors.recurrence_count = `El número de repeticiones debe estar entre 1 y ${CALENDAR_LIMITS.maxOccurrences}.`;
	}

	if (wishlistCategoryId && !validWishlistCategoryIds.has(wishlistCategoryId))
		errors.wishlist_category_id = 'La categoría Wishlist no pertenece a esta familia.';
	if (
		reminderMinutes !== null &&
		(!Number.isInteger(reminderMinutes) ||
			reminderMinutes < 0 ||
			reminderMinutes > CALENDAR_LIMITS.maxReminderMinutes)
	)
		errors.reminder_minutes = 'El recordatorio debe estar entre el inicio y siete días antes.';

	if (Object.keys(errors).length > 0) return { success: false, errors };

	return {
		success: true,
		data: {
			title,
			description: description || null,
			startsAt: startsAt as string,
			endsAt: endsAt as string,
			timezone,
			allDay,
			visibility: visibilityValue as CalendarVisibility,
			participantIds,
			recurrenceFrequency: recurrenceValue as CalendarRecurrence,
			recurrenceInterval,
			recurrenceUntil,
			recurrenceCount: recurrenceValue === 'none' ? null : recurrenceCount,
			wishlistCategoryId: wishlistCategoryId || null,
			reminderMinutes
		}
	};
}

export function parseCalendarEventIdentity(
	formData: FormData
): CalendarValidationResult<CalendarEventIdentity> {
	const eventId = textValue(formData, 'event_id');
	const version = Number(textValue(formData, 'version'));
	const errors: CalendarValidationErrors = {};
	if (!isUuid(eventId)) errors.event_id = 'El evento seleccionado no es válido.';
	if (!Number.isSafeInteger(version) || version < 1)
		errors.version = 'La versión del evento no es válida.';
	return Object.keys(errors).length > 0
		? { success: false, errors }
		: { success: true, data: { eventId, version } };
}
