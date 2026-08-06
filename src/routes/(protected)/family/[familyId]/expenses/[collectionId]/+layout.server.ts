import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { loadExpenseCollectionShell, ExpenseQueryError } from '$lib/server/expenses/queries';

export const load: LayoutServerLoad = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) throw error(401, 'Unauthorized');
	try {
		const expenseCollection = await loadExpenseCollectionShell(
			supabase,
			params.familyId,
			params.collectionId
		);
		if (!expenseCollection) throw error(404, 'Colección de gastos no encontrada.');
		return { expenseCollection, currentUserId: user.id };
	} catch (caught) {
		if (caught instanceof ExpenseQueryError) {
			console.error(caught.message);
			throw error(500, 'No se pudo cargar la colección de gastos.');
		}
		throw caught;
	}
};
