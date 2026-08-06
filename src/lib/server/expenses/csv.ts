import type { ExpenseExportRow } from './queries';

function csvCell(value: string | number): string {
	let text = String(value);
	if (/^[=+\-@]/.test(text)) text = `'${text}`;
	return `"${text.replaceAll('"', '""')}"`;
}

export function createExpenseCsv(rows: ExpenseExportRow[]): string {
	const header = [
		'Fecha',
		'Concepto',
		'Importe',
		'Moneda',
		'Categoría',
		'Pagó',
		'Notas',
		'Tiene recibo'
	];
	const lines = rows.map((row) =>
		[
			row.occurredOn,
			row.description,
			row.amount.toFixed(2),
			row.currency,
			row.category,
			row.payer,
			row.notes,
			row.hasReceipt ? 'Sí' : 'No'
		]
			.map(csvCell)
			.join(',')
	);
	return `\uFEFF${[header.map(csvCell).join(','), ...lines].join('\r\n')}\r\n`;
}
