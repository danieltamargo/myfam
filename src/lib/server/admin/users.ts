import { randomUUID } from 'node:crypto';
import { error } from '@sveltejs/kit';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';
import { isSuperAdmin, UUID_PATTERN } from './access';

export const PAGE_SIZE = 25;
export function pageNumber(value: string | null): number {
	return value && /^[1-9]\d{0,3}$/.test(value) ? Number(value) : 1;
}

export function parseNewUser(form: FormData) {
	const email = String(form.get('email') ?? '')
		.trim()
		.toLowerCase();
	const name = String(form.get('name') ?? '').trim();
	if (
		email.length > 254 ||
		!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
		name.length < 1 ||
		name.length > 100 ||
		[...name].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
	) {
		throw error(400, 'Introduce un nombre de hasta 100 caracteres y un correo válido.');
	}
	return { email, name };
}

type ManagedUser = User & { banned_until?: string };

export function publicUser(user: ManagedUser) {
	return {
		id: user.id,
		email: user.email ?? '',
		createdAt: user.created_at,
		lastSignIn: user.last_sign_in_at ?? null,
		disabled: Boolean(user.banned_until && new Date(user.banned_until).getTime() > Date.now()),
		superAdmin: isSuperAdmin(user.id)
	};
}

type AdminDatabase = Omit<Database, 'public'> & {
	public: Omit<Database['public'], 'Functions'> & {
		Functions: Database['public']['Functions'] & {
			admin_record_user_operation: {
				Args: {
					p_actor: string;
					p_target: string | null;
					p_action: string;
					p_status: string;
					p_operation: string;
				};
				Returns: undefined;
			};
			admin_auth_events: {
				Args: { p_limit: number; p_offset: number };
				Returns: { id: string; created_at: string; actor_id: string | null; action: string }[];
			};
		};
	};
};

export function adminRpc(client: SupabaseClient<Database>) {
	return client as unknown as SupabaseClient<AdminDatabase>;
}

export async function runAuditedOperation<T>(
	client: SupabaseClient<Database>,
	actor: string,
	target: string | null,
	action: string,
	operation: () => Promise<T>,
	successTarget?: (result: T) => string
): Promise<T> {
	const operationId = randomUUID();
	async function record(status: string, targetId = target) {
		const { error: auditError } = await adminRpc(client).rpc('admin_record_user_operation', {
			p_actor: actor,
			p_target: targetId,
			p_action: action,
			p_status: status,
			p_operation: operationId
		});
		if (auditError)
			throw error(
				503,
				status === 'pending'
					? 'No se pudo registrar la operación. No se ha realizado ningún cambio.'
					: 'La operación puede haberse realizado, pero no se pudo confirmar la auditoría. Revisa el estado antes de repetirla.'
			);
	}
	await record('pending');
	let result: T;
	try {
		result = await operation();
	} catch (cause) {
		await record('failed');
		throw cause;
	}
	await record('succeeded', successTarget?.(result) ?? target);
	return result;
}

export async function getTargetUser(
	client: SupabaseClient<Database>,
	value: FormDataEntryValue | null
) {
	if (typeof value !== 'string' || !UUID_PATTERN.test(value))
		throw error(400, 'El usuario no es válido.');
	const { data, error: targetError } = await client.auth.admin.getUserById(value);
	if (targetError || !data.user) throw error(404, 'No se pudo localizar al usuario.');
	return data.user;
}

export async function setUserEnabled(
	client: SupabaseClient<Database>,
	actor: string,
	target: User,
	enabled: boolean
) {
	if (!enabled && (target.id === actor || isSuperAdmin(target.id))) {
		throw error(400, 'No puedes deshabilitar tu cuenta ni la de otro superadministrador.');
	}
	await runAuditedOperation(
		client,
		actor,
		target.id,
		enabled ? 'user_enabled' : 'user_disabled',
		async () => {
			const { error: updateError } = await client.auth.admin.updateUserById(target.id, {
				ban_duration: enabled ? 'none' : '876000h'
			});
			if (updateError) throw error(503, 'No se pudo cambiar el acceso del usuario.');
		}
	);
}
