import { env } from '$env/dynamic/private';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';
import type { CalendarTokenKeys } from '../google/crypto';
import type { MicrosoftOAuthConfig } from './provider';

export interface MicrosoftCalendarConfig extends MicrosoftOAuthConfig {
	keys: CalendarTokenKeys;
	databaseUrl: string;
	databaseSecret: string;
}

export function microsoftCalendarConfigured(): boolean {
	return Boolean(
		env.MICROSOFT_CALENDAR_CLIENT_ID &&
		env.MICROSOFT_CALENDAR_CLIENT_SECRET &&
		env.MICROSOFT_CALENDAR_ORIGIN &&
		env.CALENDAR_TOKEN_KEYS &&
		env.CALENDAR_TOKEN_ACTIVE_KEY &&
		env.SUPABASE_SECRET_KEY &&
		env.SUPABASE_PROJECT_URL
	);
}

export function microsoftCalendarConfig(): MicrosoftCalendarConfig {
	if (!microsoftCalendarConfigured()) throw new Error('Microsoft Calendar is not configured');
	const origin = new URL(env.MICROSOFT_CALENDAR_ORIGIN!);
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
		clientId: env.MICROSOFT_CALENDAR_CLIENT_ID!,
		clientSecret: env.MICROSOFT_CALENDAR_CLIENT_SECRET!,
		redirectUri: `${origin.origin}/calendar/microsoft/callback`,
		keys: { activeId: env.CALENDAR_TOKEN_ACTIVE_KEY!, keys: keys as Record<string, string> },
		databaseUrl: env.SUPABASE_PROJECT_URL!,
		databaseSecret: env.SUPABASE_SECRET_KEY!
	};
}

export function calendarServiceClient(config = microsoftCalendarConfig()) {
	return createClient<Database>(config.databaseUrl, config.databaseSecret, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
}
