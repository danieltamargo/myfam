import { createHash } from 'node:crypto';
import {
	GoogleCalendarError,
	normalizeGoogleEvent,
	type GoogleEvent,
	type GoogleEventInput,
	type GoogleOAuthConfig,
	type GoogleTokens,
	type GoogleCalendarOption
} from '../google/provider';
export { GoogleCalendarError as MicrosoftCalendarError } from '../google/provider';
export type MicrosoftOAuthConfig = GoogleOAuthConfig;
const GRAPH = 'https://graph.microsoft.com/v1.0';
const AUTH = 'https://login.microsoftonline.com/common/oauth2/v2.0';
export const MICROSOFT_CALENDAR_SCOPES = [
	'https://graph.microsoft.com/Calendars.ReadWrite',
	'offline_access'
] as const;
const PROPERTY = 'String {69074a38-9b73-4e7f-8a8f-d7ce2fd64e4d} Name MyFamilyCalendar';
const IDENTITY_PROPERTY = 'String {69074a38-9b73-4e7f-8a8f-d7ce2fd64e4d} Name MyFamilyIdentity';
interface GraphEvent {
	id: string;
	'@odata.etag': string;
	subject?: string;
	body?: { contentType?: string; content?: string };
	start?: { dateTime: string; timeZone: string };
	end?: { dateTime: string; timeZone: string };
	isAllDay?: boolean;
	isCancelled?: boolean;
	singleValueExtendedProperties?: { id: string; value: string }[];
}
function graphUrl(value: string) {
	const url = new URL(value);
	if (
		url.origin !== 'https://graph.microsoft.com' ||
		!url.pathname.startsWith('/v1.0/') ||
		url.username ||
		url.password ||
		url.hash
	)
		throw new GoogleCalendarError(502);
	return url.href;
}
async function request<T>(
	url: string,
	init: RequestInit,
	fetcher: typeof fetch = fetch
): Promise<T> {
	const response = await fetcher(url, {
		...init,
		redirect: 'error',
		signal: AbortSignal.timeout(15_000)
	});
	if (!response.ok)
		throw new GoogleCalendarError(
			response.status,
			response.status === 412
				? 'conflict'
				: response.status === 401 || response.status === 403
					? 'authorization'
					: 'request'
		);
	return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}
function headers(token: string) {
	return {
		Authorization: `Bearer ${token}`,
		Prefer: 'outlook.timezone="UTC", outlook.body-content-type="text", IdType="ImmutableId"'
	};
}
function adapted(event: GraphEvent): GoogleEvent {
	let markers: Record<string, string> | undefined;
	const raw = event.singleValueExtendedProperties?.find((item) => item.id === PROPERTY)?.value;
	if (raw) {
		try {
			const value: unknown = JSON.parse(raw);
			if (
				value &&
				typeof value === 'object' &&
				!Array.isArray(value) &&
				Object.values(value).every((item) => typeof item === 'string')
			)
				markers = value as Record<string, string>;
		} catch {
			throw new GoogleCalendarError(422);
		}
	}
	const date = (value: GraphEvent['start']) => {
		if (!value) return undefined;
		if (value.timeZone !== 'UTC' && value.timeZone !== 'Etc/UTC')
			throw new GoogleCalendarError(422);
		const iso = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value.dateTime)
			? value.dateTime
			: `${value.dateTime}Z`;
		return event.isAllDay
			? { date: iso.slice(0, 10), timeZone: 'UTC' }
			: { dateTime: iso, timeZone: 'UTC' };
	};
	return {
		id: event.id,
		etag: event['@odata.etag'],
		status: event.isCancelled ? 'cancelled' : 'confirmed',
		summary: event.subject || 'Evento Outlook',
		description: event.body?.contentType?.toLowerCase() === 'text' ? event.body.content : undefined,
		start: date(event.start),
		end: date(event.end),
		extendedProperties: markers ? { private: markers } : undefined
	};
}
export function microsoftAuthorizationUrl(
	config: GoogleOAuthConfig,
	state: string,
	verifier: string
) {
	return `${AUTH}/authorize?${new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: 'code', response_mode: 'query', scope: MICROSOFT_CALENDAR_SCOPES.join(' '), state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', prompt: 'select_account' })}`;
}
async function tokens(
	config: GoogleOAuthConfig,
	fields: Record<string, string>,
	fetcher: typeof fetch
) {
	const value = await request<GoogleTokens>(
		`${AUTH}/token`,
		{
			method: 'POST',
			body: new URLSearchParams({
				client_id: config.clientId,
				client_secret: config.clientSecret,
				scope: MICROSOFT_CALENDAR_SCOPES.join(' '),
				...fields
			})
		},
		fetcher
	);
	if (!value.access_token || !Number.isFinite(value.expires_in) || value.expires_in <= 0)
		throw new GoogleCalendarError(502);
	const scopes = value.scope?.toLowerCase().split(' ') ?? [];
	if (
		!scopes.some(
			(scope) =>
				scope === 'calendars.readwrite' ||
				scope === 'https://graph.microsoft.com/calendars.readwrite'
		)
	)
		throw new GoogleCalendarError(403, 'authorization');
	return value;
}
export async function exchangeMicrosoftCode(
	config: GoogleOAuthConfig,
	code: string,
	verifier: string,
	fetcher: typeof fetch = fetch
) {
	const value = await tokens(
		config,
		{
			grant_type: 'authorization_code',
			code,
			code_verifier: verifier,
			redirect_uri: config.redirectUri
		},
		fetcher
	);
	if (!value.refresh_token) throw new GoogleCalendarError(403, 'authorization');
	return value;
}
export function refreshMicrosoftTokens(
	config: GoogleOAuthConfig,
	refreshToken: string,
	fetcher: typeof fetch = fetch
) {
	return tokens(config, { grant_type: 'refresh_token', refresh_token: refreshToken }, fetcher);
}
async function pages<T>(initial: string, token: string, fetcher: typeof fetch) {
	const values: T[] = [];
	let url: string | undefined = initial;
	for (let page = 0; page < 20; page++) {
		const result: { value?: T[]; '@odata.nextLink'?: string } = await request(
			graphUrl(url),
			{ headers: headers(token) },
			fetcher
		);
		if (!Array.isArray(result.value)) throw new GoogleCalendarError(502);
		values.push(...result.value);
		url = result['@odata.nextLink'];
		if (!url) return values;
	}
	throw new GoogleCalendarError(413, 'limit');
}
export async function listOwnedMicrosoftCalendars(
	token: string,
	fetcher: typeof fetch = fetch
): Promise<GoogleCalendarOption[]> {
	const calendars = await pages<{
		id: string;
		name?: string;
		canEdit?: boolean;
		canShare?: boolean;
	}>(`${GRAPH}/me/calendars?$select=id,name,canEdit,canShare&$top=100`, token, fetcher);
	// Shared calendars do not expose canShare to their recipient.
	return calendars
		.filter((item) => item.id && item.canEdit && item.canShare)
		.map((item) => ({
			id: item.id,
			label: (item.name || 'Calendario Outlook').slice(0, 160),
			timezone: 'UTC'
		}));
}
export function microsoftEventUrl(calendarId: string, eventId?: string) {
	return `${GRAPH}/me/calendars/${encodeURIComponent(calendarId)}/events${eventId ? `/${encodeURIComponent(eventId)}` : ''}`;
}
export async function listMicrosoftEvents(
	token: string,
	calendarId: string,
	from: string,
	to: string,
	fetcher: typeof fetch = fetch
) {
	const params = new URLSearchParams({
		startDateTime: from,
		endDateTime: to,
		$top: '250',
		$expand: `singleValueExtendedProperties($filter=id eq '${PROPERTY}')`
	});
	return (
		await pages<GraphEvent>(
			`${GRAPH}/me/calendars/${encodeURIComponent(calendarId)}/calendarView?${params}`,
			token,
			fetcher
		)
	).map(adapted);
}
export function normalizeMicrosoftEvent(event: GoogleEvent, timezone: string) {
	return normalizeGoogleEvent(event, timezone);
}
export function microsoftEventBody(event: GoogleEventInput): object {
	const at = (value: string) => {
		if (!event.allDay) return new Date(value).toISOString().replace(/Z$/, '');
		const parts = new Intl.DateTimeFormat('en-CA', {
			timeZone: event.timezone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		}).formatToParts(new Date(value));
		return `${['year', 'month', 'day'].map((type) => parts.find((part) => part.type === type)?.value).join('-')}T00:00:00`;
	};
	return {
		subject: event.title,
		body: { contentType: 'text', content: event.description ?? '' },
		sensitivity: 'private',
		isAllDay: event.allDay,
		start: { dateTime: at(event.startsAt), timeZone: 'UTC' },
		end: { dateTime: at(event.endsAt), timeZone: 'UTC' }
	};
}
export async function microsoftRequest<T>(
	url: string,
	init: RequestInit,
	fetcher: typeof fetch = fetch
): Promise<T> {
	const input = new Headers(init.headers);
	input.set(
		'Prefer',
		'outlook.timezone="UTC", outlook.body-content-type="text", IdType="ImmutableId"'
	);
	const target = new URL(graphUrl(url));
	if (!init.method || init.method === 'GET')
		target.searchParams.set(
			'$expand',
			`singleValueExtendedProperties($filter=id eq '${PROPERTY}')`
		);
	const value = await request<GraphEvent | undefined>(
		target.href,
		{ ...init, headers: input },
		fetcher
	);
	return (value ? adapted(value) : undefined) as T;
}
export async function exportMicrosoftEvent(
	token: string,
	calendarId: string,
	connectionId: string,
	eventId: string,
	version: number,
	event: GoogleEventInput
): Promise<GoogleEvent> {
	const identity = createHash('sha256').update(`${connectionId}:${eventId}`).digest('hex');
	const marker = {
		myfamilyConnectionId: connectionId,
		myfamilyEventId: eventId,
		myfamilyVersion: String(version),
		identity
	};
	const filter = `singleValueExtendedProperties/Any(ep: ep/id eq '${IDENTITY_PROPERTY}' and ep/value eq '${identity}')`;
	const existing = await pages<GraphEvent>(
		`${microsoftEventUrl(calendarId)}?${new URLSearchParams({ $filter: filter, $expand: `singleValueExtendedProperties($filter=id eq '${PROPERTY}')`, $top: '2' })}`,
		token,
		fetch
	);
	if (existing.length > 1) throw new GoogleCalendarError(409, 'conflict');
	if (existing[0]) {
		const recovered = adapted(existing[0]);
		if (
			recovered.extendedProperties?.private?.myfamilyConnectionId !== connectionId ||
			recovered.extendedProperties.private.myfamilyEventId !== eventId
		)
			throw new GoogleCalendarError(409, 'conflict');
		return recovered;
	}
	const created = await microsoftRequest<GoogleEvent>(microsoftEventUrl(calendarId), {
		method: 'POST',
		headers: { ...headers(token), 'Content-Type': 'application/json' },
		body: JSON.stringify({
			...microsoftEventBody(event),
			transactionId: identity,
			singleValueExtendedProperties: [
				{ id: PROPERTY, value: JSON.stringify(marker) },
				{ id: IDENTITY_PROPERTY, value: identity }
			]
		})
	});
	return { ...created, extendedProperties: { private: marker } };
}

export type { GoogleEvent as MicrosoftEvent } from '../google/provider';
