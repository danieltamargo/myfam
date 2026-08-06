import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';
import type { ExpenseSplitValue } from '$lib/expenses/splits';
import type {
	AssignableExpenseCollectionRole,
	ExpenseCollectionInput,
	ExpenseInput,
	RecurringExpenseInput
} from './schemas';

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
	if (error.code === '40001')
		throw new ExpenseCommandError(
			409,
			'El gasto cambió mientras lo editabas. Recarga la página e inténtalo de nuevo.'
		);
	if (error.code === '23505')
		throw new ExpenseCommandError(
			409,
			'El miembro ya pertenece a la colección o tiene una invitación.'
		);
	if (error.code === '23514' || error.code === '22023')
		throw new ExpenseCommandError(400, error.message || fallback);
	throw new ExpenseCommandError(500, fallback);
}

// PostgreSQL accepts NULL for these RPC arguments, although generated function argument types
// do not expose nullability unless an argument has a default.
function nullableRpcText(value: string | null): string {
	return value as string;
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

export async function updateExpenseCollection(
	supabase: SupabaseClient<Database>,
	collectionId: string,
	input: ExpenseCollectionInput
): Promise<void> {
	const { data, error } = await supabase
		.from('expense_collections')
		.update({ name: input.name, description: input.description, currency: input.currency })
		.eq('id', collectionId)
		.select('id')
		.maybeSingle();
	if (error) throwExpenseCommandError(error, 'No se pudo actualizar la colección.');
	if (!data) throw new ExpenseCommandError(404, 'La colección no existe o no puedes editarla.');
}

export async function setExpenseCollectionArchived(
	supabase: SupabaseClient<Database>,
	collectionId: string,
	archived: boolean
): Promise<void> {
	const { data, error } = await supabase
		.from('expense_collections')
		.update({ archived_at: archived ? new Date().toISOString() : null })
		.eq('id', collectionId)
		.select('id')
		.maybeSingle();
	if (error) throwExpenseCommandError(error, 'No se pudo cambiar el estado de la colección.');
	if (!data) throw new ExpenseCommandError(404, 'La colección no existe o no puedes editarla.');
}

export async function createExpenseCategory(
	supabase: SupabaseClient<Database>,
	collectionId: string,
	name: string,
	color: string | null
): Promise<void> {
	const { error } = await supabase
		.from('expense_categories')
		.insert({ collection_id: collectionId, name, color });
	if (error) throwExpenseCommandError(error, 'No se pudo crear la categoría.');
}

export async function deleteExpenseCategory(
	supabase: SupabaseClient<Database>,
	collectionId: string,
	categoryId: string
): Promise<void> {
	const { error } = await supabase
		.from('expense_categories')
		.delete()
		.eq('collection_id', collectionId)
		.eq('id', categoryId);
	if (error) throwExpenseCommandError(error, 'No se pudo eliminar la categoría.');
}

export async function createExpense(
	supabase: SupabaseClient<Database>,
	collectionId: string,
	input: ExpenseInput,
	splits: ExpenseSplitValue[]
): Promise<string> {
	const { data, error } = await supabase.rpc('create_expense_with_splits', {
		p_collection_id: collectionId,
		p_category_id: nullableRpcText(input.categoryId),
		p_paid_by: input.paidBy,
		p_description: input.description,
		p_amount: input.amount,
		p_occurred_on: input.occurredOn,
		p_notes: nullableRpcText(input.notes),
		p_receipt_path: nullableRpcText(input.receiptPath),
		p_splits: splits.map((split) => ({ user_id: split.userId, amount: split.amount }))
	});
	if (error) throwExpenseCommandError(error, 'No se pudo crear el gasto.');
	return data;
}

export async function updateExpense(
	supabase: SupabaseClient<Database>,
	collectionId: string,
	expenseId: string,
	version: number,
	input: ExpenseInput,
	splits: ExpenseSplitValue[]
): Promise<void> {
	const { error } = await supabase.rpc('update_expense_with_splits', {
		p_collection_id: collectionId,
		p_expense_id: expenseId,
		p_version: version,
		p_category_id: nullableRpcText(input.categoryId),
		p_paid_by: input.paidBy,
		p_description: input.description,
		p_amount: input.amount,
		p_occurred_on: input.occurredOn,
		p_notes: nullableRpcText(input.notes),
		p_receipt_path: nullableRpcText(input.receiptPath),
		p_splits: splits.map((split) => ({ user_id: split.userId, amount: split.amount }))
	});
	if (error) throwExpenseCommandError(error, 'No se pudo actualizar el gasto.');
}

export async function createRecurringExpenseRule(
	supabase: SupabaseClient<Database>,
	collectionId: string,
	input: RecurringExpenseInput,
	splits: ExpenseSplitValue[]
): Promise<string> {
	const { data, error } = await supabase.rpc('create_recurring_expense_rule', {
		p_collection_id: collectionId,
		p_category_id: nullableRpcText(input.categoryId),
		p_paid_by: input.paidBy,
		p_description: input.description,
		p_amount: input.amount,
		p_notes: nullableRpcText(input.notes),
		p_frequency: input.frequency,
		p_next_run: input.nextRun,
		p_splits: splits.map((split) => ({ user_id: split.userId, amount: split.amount }))
	});
	if (error) throwExpenseCommandError(error, 'No se pudo crear el gasto recurrente.');
	return data;
}

export async function setRecurringExpenseRuleActive(
	supabase: SupabaseClient<Database>,
	collectionId: string,
	ruleId: string,
	active: boolean
): Promise<void> {
	const { error } = await supabase.rpc('set_recurring_expense_rule_active', {
		p_collection_id: collectionId,
		p_rule_id: ruleId,
		p_active: active
	});
	if (error) throwExpenseCommandError(error, 'No se pudo cambiar el gasto recurrente.');
}

export async function deleteExpense(
	supabase: SupabaseClient<Database>,
	collectionId: string,
	expenseId: string,
	version: number
): Promise<string | null> {
	const { data, error } = await supabase
		.from('expenses')
		.delete()
		.eq('collection_id', collectionId)
		.eq('id', expenseId)
		.eq('version', version)
		.select('receipt_path')
		.maybeSingle();
	if (error) throwExpenseCommandError(error, 'No se pudo eliminar el gasto.');
	if (!data) throw new ExpenseCommandError(409, 'El gasto ya cambió o dejó de estar disponible.');
	return data.receipt_path;
}
