import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';
import type { AssignableExpenseCollectionRole, ExpenseCollectionInput } from './schemas';

export class ExpenseCommandError extends Error {
	constructor(
		public readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'ExpenseCommandError';
	}
}

function throwExpenseCommandError(error: PostgrestError, fallback: string): never {
	if (error.code === '42501')
		throw new ExpenseCommandError(403, 'No tienes permiso para realizar esta acción.');
	if (error.code === 'P0002')
		throw new ExpenseCommandError(404, 'La invitación ya no está disponible.');
	if (error.code === '23505')
		throw new ExpenseCommandError(
			409,
			'El miembro ya pertenece a la colección o tiene una invitación.'
		);
	if (error.code === '23514' || error.code === '22023')
		throw new ExpenseCommandError(400, error.message || fallback);
	throw new ExpenseCommandError(500, fallback);
}

export async function createExpenseCollection(
	supabase: SupabaseClient<Database>,
	familyId: string,
	input: ExpenseCollectionInput
): Promise<string> {
	const { data, error } = await supabase.rpc('create_expense_collection', {
		p_family_id: familyId,
		p_name: input.name,
		p_description: input.description ?? undefined,
		p_currency: input.currency
	});
	if (error) throwExpenseCommandError(error, 'No se pudo crear la colección de gastos.');
	return data;
}

export async function inviteExpenseCollectionMember(
	supabase: SupabaseClient<Database>,
	collectionId: string,
	userId: string,
	role: AssignableExpenseCollectionRole
): Promise<void> {
	const { error } = await supabase.rpc('invite_expense_collection_member', {
		p_collection_id: collectionId,
		p_user_id: userId,
		p_role: role
	});
	if (error) throwExpenseCommandError(error, 'No se pudo invitar al miembro.');
}

export async function acceptExpenseCollectionInvitation(
	supabase: SupabaseClient<Database>,
	collectionId: string
): Promise<void> {
	const { error } = await supabase.rpc('accept_expense_collection_invitation', {
		p_collection_id: collectionId
	});
	if (error) throwExpenseCommandError(error, 'No se pudo aceptar la invitación.');
}

export async function changeExpenseCollectionRole(
	supabase: SupabaseClient<Database>,
	collectionId: string,
	userId: string,
	role: AssignableExpenseCollectionRole
): Promise<void> {
	const { error } = await supabase.rpc('change_expense_collection_role', {
		p_collection_id: collectionId,
		p_user_id: userId,
		p_role: role
	});
	if (error) throwExpenseCommandError(error, 'No se pudo cambiar el rol del miembro.');
}

export async function transferExpenseCollectionOwnership(
	supabase: SupabaseClient<Database>,
	collectionId: string,
	newOwnerId: string
): Promise<void> {
	const { error } = await supabase.rpc('transfer_expense_collection_ownership', {
		p_collection_id: collectionId,
		p_new_owner_id: newOwnerId
	});
	if (error) throwExpenseCommandError(error, 'No se pudo transferir la colección.');
}

export async function revokeExpenseCollectionMember(
	supabase: SupabaseClient<Database>,
	collectionId: string,
	userId: string
): Promise<void> {
	const { error } = await supabase.rpc('revoke_expense_collection_member', {
		p_collection_id: collectionId,
		p_user_id: userId
	});
	if (error) throwExpenseCommandError(error, 'No se pudo revocar el acceso del miembro.');
}

export async function leaveExpenseCollection(
	supabase: SupabaseClient<Database>,
	collectionId: string
): Promise<void> {
	const { error } = await supabase.rpc('leave_expense_collection', {
		p_collection_id: collectionId
	});
	if (error) throwExpenseCommandError(error, 'No se pudo abandonar la colección.');
}
