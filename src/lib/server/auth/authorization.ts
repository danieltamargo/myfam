import { error } from '@sveltejs/kit';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';

export type FamilyRole = 'owner' | 'admin' | 'member';

type AuthLocals = Pick<App.Locals, 'safeGetSession' | 'supabase'>;

export async function requireAuthenticated(locals: AuthLocals): Promise<User> {
	const { user } = await locals.safeGetSession();

	if (!user) {
		throw error(401, 'Autenticación requerida');
	}

	return user;
}

export async function requireFamilyRole(
	locals: AuthLocals,
	familyId: string,
	allowedRoles: readonly FamilyRole[]
): Promise<{ user: User; role: FamilyRole }> {
	const user = await requireAuthenticated(locals);
	const { data: membership, error: membershipError } = await locals.supabase
		.from('family_members')
		.select('role')
		.eq('family_id', familyId)
		.eq('user_id', user.id)
		.maybeSingle();

	if (membershipError) {
		throw error(500, 'No se pudo comprobar la autorización familiar');
	}

	const role = membership?.role as FamilyRole | undefined;
	if (!role || !allowedRoles.includes(role)) {
		throw error(403, 'No tienes permisos para realizar esta operación');
	}

	return { user, role };
}

export async function requireAal2(supabase: SupabaseClient<Database>): Promise<'aal2'> {
	const { data, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

	if (assuranceError) {
		throw error(401, 'No se pudo verificar el segundo factor');
	}

	if (data.currentLevel !== 'aal2') {
		throw error(403, 'Esta operación requiere verificación en dos pasos');
	}

	return 'aal2';
}
