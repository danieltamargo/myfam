import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '$lib/types/database';
import { CalendarCommandError } from '../commands';
import { calendarServiceClient, microsoftCalendarConfig } from './config';
import { decryptCalendarSecret, encryptCalendarSecret } from '../google/crypto';
import {
	exchangeMicrosoftCode,
	microsoftAuthorizationUrl,
	listOwnedMicrosoftCalendars
} from './provider';
import { calendarTokenContext, requireCalendarMembership } from './service';

const COOKIE = 'myfamily_microsoft_calendar_oauth';
const COOKIE_PATH = '/calendar/microsoft/callback';
interface CalendarOAuthState {
	nonce: string;
	verifier: string;
	userId: string;
	familyId: string;
	expiresAt: number;
}

export function validateCalendarOAuthState(
	value: unknown,
	state: string,
	userId: string,
	now = Date.now()
): CalendarOAuthState {
	if (!value || typeof value !== 'object')
		throw new CalendarCommandError(400, 'La autorización de calendario no es válida.');
	const data = value as Partial<CalendarOAuthState>;
	const expected = typeof data.nonce === 'string' ? Buffer.from(data.nonce) : Buffer.alloc(0);
	const actual = Buffer.from(state);
	if (
		!expected.length ||
		actual.length !== expected.length ||
		!timingSafeEqual(actual, expected) ||
		data.userId !== userId ||
		typeof data.familyId !== 'string' ||
		typeof data.verifier !== 'string' ||
		typeof data.expiresAt !== 'number' ||
		data.expiresAt <= now
	)
		throw new CalendarCommandError(
			400,
			'La autorización caducó o pertenece a otra sesión. Conecta Microsoft de nuevo.'
		);
	return data as CalendarOAuthState;
}

export async function startMicrosoftCalendarOAuth(
	supabase: SupabaseClient<Database>,
	cookies: Cookies,
	familyId: string,
	userId: string
): Promise<string> {
	await requireCalendarMembership(supabase, familyId, userId);
	const config = microsoftCalendarConfig();
	const service = calendarServiceClient(config);
	const existing = await service
		.from('external_connections')
		.select('id')
		.eq('user_id', userId)
		.eq('family_id', familyId)
		.eq('provider', 'microsoft_calendar')
		.maybeSingle();
	if (existing.error)
		throw new CalendarCommandError(500, 'No se pudo comprobar la conexión actual.');
	if (existing.data)
		throw new CalendarCommandError(
			409,
			'Desconecta primero la conexión actual para autorizar otra cuenta.'
		);
	const nonce = randomBytes(32).toString('base64url');
	const state: CalendarOAuthState = {
		nonce,
		verifier: randomBytes(48).toString('base64url'),
		userId,
		familyId,
		expiresAt: Date.now() + 600_000
	};
	const stored = await service.from('calendar_oauth_states').insert({
		nonce_hash: createHash('sha256').update(nonce).digest('hex'),
		user_id: userId,
		family_id: familyId,
		expires_at: new Date(state.expiresAt).toISOString()
	});
	if (stored.error) throw new CalendarCommandError(500, 'No se pudo iniciar la autorización.');
	cookies.set(
		COOKIE,
		encryptCalendarSecret(JSON.stringify(state), 'microsoft-calendar-oauth-state', config.keys),
		{
			path: COOKIE_PATH,
			httpOnly: true,
			sameSite: 'lax',
			secure: new URL(config.redirectUri).protocol === 'https:',
			maxAge: 600
		}
	);
	return microsoftAuthorizationUrl(config, nonce, state.verifier);
}

export async function completeMicrosoftCalendarOAuth(
	supabase: SupabaseClient<Database>,
	cookies: Cookies,
	url: URL,
	userId: string
): Promise<string> {
	const encryptedState = cookies.get(COOKIE);
	cookies.delete(COOKIE, { path: COOKIE_PATH });
	if (!encryptedState) throw new CalendarCommandError(400, 'La autorización de calendario caducó.');
	const config = microsoftCalendarConfig();
	let decoded: unknown;
	try {
		decoded = JSON.parse(
			decryptCalendarSecret(encryptedState, 'microsoft-calendar-oauth-state', config.keys)
		);
	} catch {
		throw new CalendarCommandError(400, 'La autorización de calendario no es válida.');
	}
	const state = validateCalendarOAuthState(decoded, url.searchParams.get('state') ?? '', userId);
	await requireCalendarMembership(supabase, state.familyId, userId);
	const service = calendarServiceClient(config);
	const consumed = await service
		.from('calendar_oauth_states')
		.delete()
		.eq('nonce_hash', createHash('sha256').update(state.nonce).digest('hex'))
		.eq('user_id', userId)
		.eq('family_id', state.familyId)
		.gt('expires_at', new Date().toISOString())
		.select('nonce_hash')
		.maybeSingle();
	if (consumed.error || !consumed.data)
		throw new CalendarCommandError(400, 'La autorización caducó o ya se utilizó.');
	if (url.searchParams.has('error'))
		throw new CalendarCommandError(
			400,
			'Microsoft Calendar no se ha conectado. Puedes volver a intentarlo.'
		);
	const code = url.searchParams.get('code');
	if (!code)
		throw new CalendarCommandError(400, 'Microsoft no devolvió un código de autorización.');
	const tokens = await exchangeMicrosoftCode(config, code, state.verifier);
	{
		const calendars = await listOwnedMicrosoftCalendars(tokens.access_token);
		if (!calendars.length)
			throw new CalendarCommandError(400, 'No se encontró ningún calendario propio para conectar.');
		await requireCalendarMembership(supabase, state.familyId, userId);
		const connection = { id: randomUUID(), user_id: userId, family_id: state.familyId };
		const context = calendarTokenContext(connection);
		const saved = await service.from('external_connections').insert({
			...connection,
			provider: 'microsoft_calendar',
			access_token: encryptCalendarSecret(tokens.access_token, `${context}:access`, config.keys),
			refresh_token: encryptCalendarSecret(
				tokens.refresh_token!,
				`${context}:refresh`,
				config.keys
			),
			expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
			metadata: { calendars } as unknown as Json
		});
		if (saved.error)
			throw new CalendarCommandError(
				409,
				'No se pudo guardar la conexión. Comprueba si ya tienes otra conectada.'
			);
	}
	return state.familyId;
}
