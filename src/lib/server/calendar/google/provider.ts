import { createHash } from 'node:crypto';
import { isValidIanaTimezone, localDateTimeToIso } from '../schemas';

export const GOOGLE_CALENDAR_SCOPES = [
	'https://www.googleapis.com/auth/calendar.events.owned',
	'https://www.googleapis.com/auth/calendar.calendarlist.readonly'
] as const;

export class GoogleCalendarError extends Error {
	constructor(
		public readonly status: number,
		public readonly reason: 'request' | 'authorization' | 'conflict' | 'limit' = 'request'
	) {
		super('Google Calendar request failed');
	}
}

export interface GoogleTokens {
	access_token: string;
	refresh_token?: string;
	expires_in: number;
	scope?: string;
}
export interface GoogleCalendarOption {
	id: string;
	label: string;
	timezone: string;
}
export interface GoogleEvent {
	id: string;
	etag: string;
	status?: string;
	summary?: string;
	description?: string;
	start?: { dateTime?: string; date?: string; timeZone?: string };
	end?: { dateTime?: string; date?: string; timeZone?: string };
	extendedProperties?: { private?: Record<string, string> };
}
export interface GoogleEventInput {
	title: string;
	description: string | null;
	startsAt: string;
	endsAt: string;
	timezone: string;
	allDay: boolean;
}
export interface GoogleOAuthConfig {
	clientId: string;
	clientSecret: string;
	redirectUri: string;
}

export async function googleRequest<T>(
	url: string,
	init: RequestInit,
	fetcher: typeof fetch = fetch
): Promise<T> {
	const response = await fetcher(url, {
		...init,
		signal: AbortSignal.timeout(15_000),
		redirect: 'error'
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
	if (response.status === 204) return undefined as T;
	return (await response.json()) as T;
}

export function googleAuthorizationUrl(
	config: GoogleOAuthConfig,
	state: string,
	verifier: string
): string {
	const params = new URLSearchParams({
		client_id: config.clientId,
		redirect_uri: config.redirectUri,
		response_type: 'code',
		scope: GOOGLE_CALENDAR_SCOPES.join(' '),
		state,
		access_type: 'offline',
		prompt: 'consent',
		code_challenge: createHash('sha256').update(verifier).digest('base64url'),
		code_challenge_method: 'S256'
	});
	return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeGoogleCode(
	config: GoogleOAuthConfig,
	code: string,
	verifier: string,
	fetcher: typeof fetch = fetch
): Promise<GoogleTokens> {
	const tokens = await googleRequest<GoogleTokens>(
		'https://oauth2.googleapis.com/token',
		{
			method: 'POST',
			body: new URLSearchParams({
				client_id: config.clientId,
				client_secret: config.clientSecret,
				redirect_uri: config.redirectUri,
				code,
				code_verifier: verifier,
				grant_type: 'authorization_code'
			})
		},
		fetcher
	);
	validateTokens(tokens);
	const scopes = new Set(tokens.scope?.split(' ') ?? []);
	if (!GOOGLE_CALENDAR_SCOPES.every((scope) => scopes.has(scope)) || !tokens.refresh_token) {
		await revokeGoogleToken(tokens.refresh_token || tokens.access_token, fetcher);
		throw new GoogleCalendarError(403, 'authorization');
	}
	return tokens;
}

function validateTokens(tokens: GoogleTokens) {
	if (!tokens.access_token || !Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0)
		throw new GoogleCalendarError(502);
}

export async function refreshGoogleTokens(
	config: GoogleOAuthConfig,
	refreshToken: string,
	fetcher: typeof fetch = fetch
): Promise<GoogleTokens> {
	const tokens = await googleRequest<GoogleTokens>(
		'https://oauth2.googleapis.com/token',
		{
			method: 'POST',
			body: new URLSearchParams({
				client_id: config.clientId,
				client_secret: config.clientSecret,
				refresh_token: refreshToken,
				grant_type: 'refresh_token'
			})
		},
		fetcher
	);
	validateTokens(tokens);
	return tokens;
}

export async function listOwnedGoogleCalendars(
	token: string,
	fetcher: typeof fetch = fetch
): Promise<GoogleCalendarOption[]> {
	const calendars: GoogleCalendarOption[] = [];
	let pageToken = '';
	for (let page = 0; page < 20; page++) {
		const params = new URLSearchParams({ maxResults: '250', ...(pageToken ? { pageToken } : {}) });
		const result = await googleRequest<{
			items?: { id: string; summary?: string; accessRole?: string; timeZone?: string }[];
			nextPageToken?: string;
		}>(
			`https://www.googleapis.com/calendar/v3/users/me/calendarList?${params}`,
			{ headers: { Authorization: `Bearer ${token}` } },
			fetcher
		);
		for (const calendar of result.items ?? [])
			if (calendar.accessRole === 'owner' && calendar.id)
				calendars.push({
					id: calendar.id,
					label: (calendar.summary || 'Calendario Google').slice(0, 160),
					timezone:
						calendar.timeZone && isValidIanaTimezone(calendar.timeZone) ? calendar.timeZone : 'UTC'
				});
		pageToken = result.nextPageToken ?? '';
		if (!pageToken) return calendars;
	}
	throw new GoogleCalendarError(413, 'limit');
}

export async function listGoogleEvents(
	token: string,
	calendarId: string,
	from: string,
	to: string,
	fetcher: typeof fetch = fetch
): Promise<GoogleEvent[]> {
	const events: GoogleEvent[] = [];
	let pageToken = '';
	for (let page = 0; page < 20; page++) {
		const params = new URLSearchParams({
			maxResults: '250',
			singleEvents: 'true',
			showDeleted: 'true',
			timeMin: from,
			timeMax: to,
			...(pageToken ? { pageToken } : {})
		});
		const result = await googleRequest<{ items?: GoogleEvent[]; nextPageToken?: string }>(
			`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
			{ headers: { Authorization: `Bearer ${token}` } },
			fetcher
		);
		events.push(...(result.items ?? []));
		pageToken = result.nextPageToken ?? '';
		if (!pageToken) return events;
	}
	throw new GoogleCalendarError(413, 'limit');
}

export function normalizeGoogleEvent(
	event: GoogleEvent,
	fallbackTimezone: string
): GoogleEventInput | null {
	if (event.status === 'cancelled') return null;
	const timezone = event.start?.timeZone || fallbackTimezone;
	if (!isValidIanaTimezone(timezone) || !event.id || !event.etag)
		throw new GoogleCalendarError(422);
	const allDay = Boolean(event.start?.date);
	const startsAt = allDay
		? localDateTimeToIso(`${event.start?.date}T00:00`, timezone)
		: event.start?.dateTime;
	const endsAt = allDay
		? localDateTimeToIso(`${event.end?.date}T00:00`, timezone)
		: event.end?.dateTime;
	if (
		!startsAt ||
		!endsAt ||
		!Number.isFinite(Date.parse(startsAt)) ||
		!Number.isFinite(Date.parse(endsAt)) ||
		Date.parse(endsAt) <= Date.parse(startsAt)
	)
		throw new GoogleCalendarError(422);
	return {
		title: (event.summary?.trim() || 'Evento Google').slice(0, 160),
		description: event.description?.slice(0, 4000) || null,
		startsAt: new Date(startsAt).toISOString(),
		endsAt: new Date(endsAt).toISOString(),
		timezone,
		allDay
	};
}

export function googleEventBody(event: GoogleEventInput): object {
	if (event.allDay) {
		const localDate = (value: string) => {
			const parts = new Intl.DateTimeFormat('en-CA', {
				timeZone: event.timezone,
				year: 'numeric',
				month: '2-digit',
				day: '2-digit'
			}).formatToParts(new Date(value));
			return ['year', 'month', 'day']
				.map((type) => parts.find((part) => part.type === type)?.value)
				.join('-');
		};
		return {
			summary: event.title,
			description: event.description ?? '',
			visibility: 'private',
			start: { date: localDate(event.startsAt) },
			end: { date: localDate(event.endsAt) }
		};
	}
	return {
		summary: event.title,
		description: event.description ?? '',
		visibility: 'private',
		start: { dateTime: event.startsAt, timeZone: event.timezone },
		end: { dateTime: event.endsAt, timeZone: event.timezone }
	};
}

export function remoteGoogleEventId(connectionId: string, eventId: string): string {
	return createHash('sha256').update(`${connectionId}:${eventId}`).digest('hex');
}

export function googleEventUrl(calendarId: string, eventId?: string): string {
	return `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events${eventId ? `/${encodeURIComponent(eventId)}` : ''}`;
}

export async function revokeGoogleToken(
	token: string,
	fetcher: typeof fetch = fetch
): Promise<void> {
	const response = await fetcher('https://oauth2.googleapis.com/revoke', {
		method: 'POST',
		body: new URLSearchParams({ token }),
		signal: AbortSignal.timeout(15_000),
		redirect: 'error'
	});
	if (response.status === 400) {
		const result = (await response.json().catch(() => null)) as { error?: string } | null;
		if (result?.error === 'invalid_token') return;
	}
	if (!response.ok) throw new GoogleCalendarError(response.status);
}
