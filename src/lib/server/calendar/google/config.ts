import { env } from '$env/dynamic/private';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';
import type { CalendarTokenKeys } from './crypto';
import type { GoogleOAuthConfig } from './provider';

export interface GoogleCalendarConfig extends GoogleOAuthConfig {
	keys: CalendarTokenKeys;
	databaseUrl: string;
	databaseSecret: string;
}

export function googleCalendarConfigured(): boolean {
	return Boolean(
		env.GOOGLE_CALENDAR_CLIENT_ID &&
		env.GOOGLE_CALENDAR_CLIENT_SECRET &&
		env.GOOGLE_CALENDAR_ORIGIN &&
		env.CALENDAR_TOKEN_KEYS &&
		env.CALENDAR_TOKEN_ACTIVE_KEY &&
		env.SUPABASE_SECRET_KEY &&
		env.SUPABASE_PROJECT_URL
	);
}

export function googleCalendarConfig(): GoogleCalendarConfig {
	if (!googleCalendarConfigured()) throw new Error('Google Calendar is not configured');
	const origin = new URL(env.GOOGLE_CALENDAR_ORIGIN!);
	if (
		origin.protocol !== 'https:' &&
		!(origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname))
	)
		throw new Error('Calendar origin must use HTTPS');
	const keys: unknown = JSON.parse(env.CALENDAR_TOKEN_KEYS!);
	if (
		!keys ||
		typeof keys !== 'object' ||
		Array.isArray(keys) ||
		!Object.values(keys).every((key) => typeof key === 'string')
	)
		throw new Error('Invalid calendar encryption keys');
	return {
		clientId: env.GOOGLE_CALENDAR_CLIENT_ID!,
		clientSecret: env.GOOGLE_CALENDAR_CLIENT_SECRET!,
		redirectUri: `${origin.origin}/calendar/google/callback`,
		keys: { activeId: env.CALENDAR_TOKEN_ACTIVE_KEY!, keys: keys as Record<string, string> },
		databaseUrl: env.SUPABASE_PROJECT_URL!,
		databaseSecret: env.SUPABASE_SECRET_KEY!
	};
}

export function calendarServiceClient(config = googleCalendarConfig()) {
	return createClient<Database>(config.databaseUrl, config.databaseSecret, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
}
