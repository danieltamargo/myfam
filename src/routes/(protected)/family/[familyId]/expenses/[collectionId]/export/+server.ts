import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createExpenseCsv } from '$lib/server/expenses/csv';
import { parseExpenseFilters } from '$lib/server/expenses/filters';
import {
	ExpenseQueryError,
	loadExpenseCollectionShell,
	loadExpenseExportRows
} from '$lib/server/expenses/queries';

export const GET: RequestHandler = async ({
	params,
	url,
	locals: { supabase, safeGetSession }
}) => {
	const { user } = await safeGetSession();
	if (!user) throw error(401, 'Unauthorized');
	let filters;
	try {
		filters = parseExpenseFilters(url.searchParams);
	} catch {
		throw error(400, 'El intervalo de exportación no es válido.');
	}
	try {
		const collection = await loadExpenseCollectionShell(
			supabase,
			params.familyId,
			params.collectionId,
			user.id
		);
		if (!collection) throw error(404, 'Colección de gastos no encontrada.');
		const rows = await loadExpenseExportRows(supabase, collection, filters);
		const filename = `gastos-${filters.from}-${filters.to}.csv`;
		return new Response(createExpenseCsv(rows), {
			headers: {
				'content-type': 'text/csv; charset=utf-8',
				'content-disposition': `attachment; filename="${filename}"`,
				'cache-control': 'private, no-store'
			}
		});
	} catch (caught) {
		if (caught instanceof ExpenseQueryError) {
			console.error(caught.message);
			throw error(500, 'No se pudo generar la exportación.');
		}
		throw caught;
	}
};
