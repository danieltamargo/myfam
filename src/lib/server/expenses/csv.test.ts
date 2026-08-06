import { describe, expect, it } from 'vitest';
import { createExpenseCsv } from './csv';

describe('expense CSV export', () => {
	it('quotes fields, keeps UTF-8 and neutralizes spreadsheet formulas', () => {
		const csv = createExpenseCsv([
			{
				occurredOn: '2026-08-06',
				description: '=HYPERLINK("bad")',
				amount: 12.5,
				currency: 'EUR',
				category: 'Alimentación',
				payer: 'María, José',
				notes: 'Línea "segura"',
				hasReceipt: true
			}
		]);
		expect(csv.startsWith('\uFEFF')).toBe(true);
		expect(csv).toContain('"\'=HYPERLINK(""bad"")"');
		expect(csv).toContain('"María, José"');
		expect(csv).toContain('"12.50"');
	});
});
