import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { requireAal2 } from '$lib/server/auth/authorization';

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function superAdminIds(value = env.SUPER_ADMIN_USER_IDS): Set<string> {
	if (!value?.trim()) return new Set();
	const ids = value.split(',').map((id) => id.trim().toLowerCase());
	if (ids.some((id) => !UUID_PATTERN.test(id))) return new Set();
	return new Set(ids);
}

export function isSuperAdmin(id: string): boolean {
	return superAdminIds().has(id.toLowerCase());
}

export async function requireSuperAdmin(locals: Pick<App.Locals, 'supabase'>) {
	const { data, error: identityError } = await locals.supabase.auth.getUser();
	if (identityError || !data.user) throw error(401, 'Autenticación requerida.');
	if (!isSuperAdmin(data.user.id)) throw error(403, 'No tienes acceso a la administración.');
	await requireAal2(locals.supabase);
	const { data: profile, error: profileError } = await locals.supabase
		.rpc('get_my_profile')
		.maybeSingle();
	if (profileError || !profile) throw error(403, 'La cuenta no tiene acceso a la administración.');
	return data.user;
}
