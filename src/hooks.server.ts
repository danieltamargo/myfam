import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '$lib/types/database';
import { paraglideMiddleware } from '$lib/paraglide/server.js';
import { handleProtectedRoutes } from '$lib/server/auth/protected';
import { handleSecurityHeaders } from '$lib/server/security/headers';
import {
	handleMutationRateLimit,
	handleIdentityMutationRateLimit
} from '$lib/server/security/rate-limit';
import { createSafeSessionReader } from '$lib/server/auth/session';

// Handle 1: Paraglide i18n
const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		event.request = request;

		return resolve(event, {
			transformPageChunk: ({ html }) => html.replace('%paraglide.lang%', locale)
		});
	});

// Handle 2: Supabase auth
const handleSupabase: Handle = async ({ event, resolve }) => {
	event.locals.supabase = createServerClient<Database>(
		import.meta.env.VITE_SUPABASE_URL,
		import.meta.env.VITE_SUPABASE_ANON_KEY,
		{
			cookies: {
				getAll: () => event.cookies.getAll(),
				setAll: (cookiesToSet) => {
					cookiesToSet.forEach(({ name, value, options }) => {
						event.cookies.set(name, value, { ...options, path: '/' });
					});
				}
			},
			auth: {
				flowType: 'pkce'
			}
		}
	);

	event.locals.safeGetSession = createSafeSessionReader(event.locals.supabase);

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});
};

// Sequence the handles
export const handle = sequence(
	handleSecurityHeaders,
	handleMutationRateLimit,
	handleParaglide,
	handleSupabase,
	handleIdentityMutationRateLimit,
	handleProtectedRoutes
);
