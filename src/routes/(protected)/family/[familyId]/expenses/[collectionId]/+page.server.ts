import { error, fail } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Actions, PageServerLoad } from './$types';
import type { Database } from '$lib/types/database';
import { parseExpenseFilters } from '$lib/server/expenses/filters';
import {
	createExpense,
	createRecurringExpenseRule,
	deleteExpense,
	ExpenseCommandError,
	setRecurringExpenseRuleActive,
	updateExpense
} from '$lib/server/expenses/commands';
import {
	ExpenseQueryError,
	loadExpenseCollectionPage,
	loadExpenseCollectionShell,
	type ExpenseCollectionSummary
} from '$lib/server/expenses/queries';
import {
	finalizeExpenseReceipt,
	prepareExpenseReceipt,
	removeExpenseReceipt,
	rollbackExpenseReceipt,
	uploadExpenseReceipt,
	ExpenseReceiptError,
	type PreparedExpenseReceipt
} from '$lib/server/expenses/receipts';
import {
	canCreateExpense,
	canMutateExpense,
	parseExpenseForm,
	parseExpenseMutationIdentity,
	parseExpenseSplits,
	parseExpenseUuidField,
	parseRecurringExpenseForm,
	type ExpenseValidationErrors
} from '$lib/server/expenses/schemas';

function invalidForm(errors: ExpenseValidationErrors) {
	return fail(400, {
		error: Object.values(errors)[0] ?? 'Los datos enviados no son válidos.',
		fieldErrors: errors
	});
}

function commandFailure(caught: unknown, fallback: string) {
	if (caught instanceof ExpenseCommandError || caught instanceof ExpenseReceiptError)
		return fail(caught.status, { error: caught.message });
	console.error(fallback, caught);
	return fail(500, { error: fallback });
}

async function rollbackAfterFailure(
	supabase: SupabaseClient<Database>,
	prepared: PreparedExpenseReceipt,
	caught: unknown,
	fallback: string
) {
	await rollbackExpenseReceipt(supabase, prepared);
	return commandFailure(caught, fallback);
}

async function loadActionContext(
	supabase: SupabaseClient<Database>,
	familyId: string,
	collectionId: string,
	userId: string
): Promise<{
	collection: ExpenseCollectionSummary;
	activeUserIds: Set<string>;
}> {
	const collection = await loadExpenseCollectionShell(supabase, familyId, collectionId, userId);
	if (!collection) throw new ExpenseCommandError(404, 'La colección no está disponible.');
	const { data, error: membersError } = await supabase
		.from('expense_collection_members')
		.select('user_id')
		.eq('collection_id', collectionId)
		.eq('status', 'active');
	if (membersError) throw new ExpenseCommandError(500, 'No se pudieron validar los participantes.');
	return { collection, activeUserIds: new Set((data ?? []).map((member) => member.user_id)) };
}

export const load: PageServerLoad = async ({
	parent,
	url,
	locals: { supabase, safeGetSession }
}) => {
	const { user } = await safeGetSession();
	if (!user) throw error(401, 'Unauthorized');
	const { expenseCollection } = await parent();
	let filters;
	try {
		filters = parseExpenseFilters(url.searchParams);
	} catch {
		throw error(400, 'El intervalo de gastos no es válido.');
	}
	try {
		return await loadExpenseCollectionPage(
			supabase,
			expenseCollection,
			user.id,
			filters,
			url.searchParams.get('cursor')
		);
	} catch (caught) {
		if (caught instanceof ExpenseQueryError || caught instanceof ExpenseReceiptError)
			console.error(caught.message);
		else console.error('Unexpected expense query failure', caught);
		throw error(500, 'No se pudieron cargar los gastos.');
	}
};

export const actions: Actions = {
	createExpense: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		let context;
		try {
			context = await loadActionContext(supabase, params.familyId, params.collectionId, user.id);
			if (!canCreateExpense(context.collection.role) || context.collection.archivedAt)
				throw new ExpenseCommandError(403, 'No puedes añadir gastos a esta colección.');
		} catch (caught) {
			return commandFailure(caught, 'No se pudo validar la colección.');
		}
		const formData = await request.formData();
		let prepared: PreparedExpenseReceipt;
		try {
			prepared = prepareExpenseReceipt(formData, params.collectionId, user.id, null);
		} catch (caught) {
			return commandFailure(caught, 'No se pudo preparar el recibo.');
		}
		const parsed = parseExpenseForm(formData, {
			collectionId: params.collectionId,
			activeUserIds: context.activeUserIds
		});
		if (!parsed.success) return invalidForm(parsed.errors);
		const splits = parseExpenseSplits(formData, parsed.data.amount, context.activeUserIds);
		if (!splits.success) return invalidForm(splits.errors);
		try {
			await uploadExpenseReceipt(supabase, prepared);
			await createExpense(supabase, params.collectionId, parsed.data, splits.data);
			await finalizeExpenseReceipt(supabase, prepared);
			return { success: true, message: 'Gasto añadido.' };
		} catch (caught) {
			return rollbackAfterFailure(supabase, prepared, caught, 'No se pudo crear el gasto.');
		}
	},

	updateExpense: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		const formData = await request.formData();
		const identity = parseExpenseMutationIdentity(formData);
		if (!identity.success) return invalidForm(identity.errors);

		let context;
		let previousPath: string | null;
		try {
			context = await loadActionContext(supabase, params.familyId, params.collectionId, user.id);
			if (context.collection.archivedAt)
				throw new ExpenseCommandError(403, 'La colección está archivada.');
			const { data: current, error: currentError } = await supabase
				.from('expenses')
				.select('created_by, receipt_path')
				.eq('collection_id', params.collectionId)
				.eq('id', identity.data.expenseId)
				.maybeSingle();
			if (currentError || !current)
				throw new ExpenseCommandError(404, 'El gasto no está disponible.');
			if (!canMutateExpense(context.collection.role, user.id, current.created_by))
				throw new ExpenseCommandError(403, 'No puedes editar este gasto.');
			previousPath = current.receipt_path;
		} catch (caught) {
			return commandFailure(caught, 'No se pudo validar el gasto.');
		}

		let prepared: PreparedExpenseReceipt;
		try {
			prepared = prepareExpenseReceipt(formData, params.collectionId, user.id, previousPath);
		} catch (caught) {
			return commandFailure(caught, 'No se pudo preparar el recibo.');
		}
		const parsed = parseExpenseForm(formData, {
			collectionId: params.collectionId,
			activeUserIds: context.activeUserIds
		});
		if (!parsed.success) return invalidForm(parsed.errors);
		const splits = parseExpenseSplits(formData, parsed.data.amount, context.activeUserIds);
		if (!splits.success) return invalidForm(splits.errors);
		try {
			await uploadExpenseReceipt(supabase, prepared);
			await updateExpense(
				supabase,
				params.collectionId,
				identity.data.expenseId,
				identity.data.version,
				parsed.data,
				splits.data
			);
			await finalizeExpenseReceipt(supabase, prepared);
			return { success: true, message: 'Gasto actualizado.' };
		} catch (caught) {
			return rollbackAfterFailure(supabase, prepared, caught, 'No se pudo actualizar el gasto.');
		}
	},

	deleteExpense: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		const identity = parseExpenseMutationIdentity(await request.formData());
		if (!identity.success) return invalidForm(identity.errors);
		try {
			const context = await loadActionContext(
				supabase,
				params.familyId,
				params.collectionId,
				user.id
			);
			if (context.collection.archivedAt)
				throw new ExpenseCommandError(403, 'La colección está archivada.');
			const { data: current, error: currentError } = await supabase
				.from('expenses')
				.select('created_by')
				.eq('collection_id', params.collectionId)
				.eq('id', identity.data.expenseId)
				.maybeSingle();
			if (currentError || !current)
				throw new ExpenseCommandError(404, 'El gasto no está disponible.');
			if (!canMutateExpense(context.collection.role, user.id, current.created_by))
				throw new ExpenseCommandError(403, 'No puedes eliminar este gasto.');
			const receiptPath = await deleteExpense(
				supabase,
				params.collectionId,
				identity.data.expenseId,
				identity.data.version
			);
			await removeExpenseReceipt(supabase, receiptPath);
			return { success: true, message: 'Gasto eliminado.' };
		} catch (caught) {
			return commandFailure(caught, 'No se pudo eliminar el gasto.');
		}
	},

	createRecurring: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		let context;
		try {
			context = await loadActionContext(supabase, params.familyId, params.collectionId, user.id);
			if (!canCreateExpense(context.collection.role) || context.collection.archivedAt)
				throw new ExpenseCommandError(403, 'No puedes programar gastos en esta colección.');
		} catch (caught) {
			return commandFailure(caught, 'No se pudo validar la colección.');
		}
		const formData = await request.formData();
		const parsed = parseRecurringExpenseForm(formData, {
			collectionId: params.collectionId,
			activeUserIds: context.activeUserIds
		});
		if (!parsed.success) return invalidForm(parsed.errors);
		const splits = parseExpenseSplits(formData, parsed.data.amount, context.activeUserIds);
		if (!splits.success) return invalidForm(splits.errors);
		try {
			await createRecurringExpenseRule(supabase, params.collectionId, parsed.data, splits.data);
			return { success: true, message: 'Gasto recurrente programado.' };
		} catch (caught) {
			return commandFailure(caught, 'No se pudo programar el gasto recurrente.');
		}
	},

	setRecurringActive: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		const formData = await request.formData();
		const ruleId = parseExpenseUuidField(formData, 'rule_id', 'La regla recurrente no es válida.');
		if (!ruleId.success) return invalidForm(ruleId.errors);
		const activeValue = formData.get('active');
		if (activeValue !== 'true' && activeValue !== 'false')
			return invalidForm({ active: 'El estado de la regla no es válido.' });
		try {
			await setRecurringExpenseRuleActive(
				supabase,
				params.collectionId,
				ruleId.data,
				activeValue === 'true'
			);
			return {
				success: true,
				message: activeValue === 'true' ? 'Regla reactivada.' : 'Regla pausada.'
			};
		} catch (caught) {
			return commandFailure(caught, 'No se pudo cambiar la regla recurrente.');
		}
	}
};
