import { redirect, type Handle } from '@sveltejs/kit';
import { enforceMfaForProtectedRoute } from './mfa';

export const handleProtectedRoutes: Handle = async ({ event, resolve }) => {
	const routeId = event.route.id;
	if (routeId === '/(protected)' || routeId?.startsWith('/(protected)/')) {
		const { user, session } = await event.locals.safeGetSession();
		if (!user || !session) throw redirect(303, '/login');
		await enforceMfaForProtectedRoute(event.locals.supabase, event.url);
	}

	return resolve(event);
};
