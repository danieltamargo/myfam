import { describe, expect, it, vi } from 'vitest';
import { parseExpenseSettlementForm } from './schemas';
import { loadExpenseSettlementBalances } from './queries';

function form(amount = '334') {
	const data = new FormData();
	data.set('from_user_id', '30000000-0000-4000-8000-000000000001');
	data.set('to_user_id', '30000000-0000-4000-8000-000000000002');
	data.set('idempotency_key', '30000000-0000-4000-8000-000000000003');
	data.set('amount_cents', amount);
	return data;
}

describe('settlement input', () => {
	it('accepts positive integer cents with a request identity', () => {
		expect(parseExpenseSettlementForm(form())).toMatchObject({
			success: true,
			data: { amountCents: 334 }
		});
	});
	it.each(['0', '-1', '3.34', '1e3', '999999999999999999999', '1000000000000'])(
		'rejects invalid amount %s',
		(amount) => {
			expect(parseExpenseSettlementForm(form(amount)).success).toBe(false);
		}
	);
	it('rejects self-payments and missing idempotency keys', () => {
		const data = form();
		data.set('to_user_id', data.get('from_user_id') as string);
		data.delete('idempotency_key');
		expect(parseExpenseSettlementForm(data)).toMatchObject({
			success: false,
			errors: { participants: expect.any(String), idempotency_key: expect.any(String) }
		});
	});
});

describe('settlement balances query', () => {
	it('keeps legacy collections readable but blocks suggestions for incomplete splits', async () => {
		const supabase = {
			rpc: vi.fn().mockResolvedValue({
				data: null,
				error: { code: '22023', message: 'Expense splits are incomplete' }
			})
		};
		await expect(loadExpenseSettlementBalances(supabase as never, 'collection')).resolves.toEqual({
			balances: [],
			warning: expect.stringContaining('repartos incompletos')
		});
	});
	it('does not disguise authorization or database failures as an empty settled collection', async () => {
		const supabase = {
			rpc: vi.fn().mockResolvedValue({
				data: null,
				error: { code: '42501', message: 'Collection access required' }
			})
		};
		await expect(loadExpenseSettlementBalances(supabase as never, 'collection')).rejects.toThrow();
	});
	it('preserves complete balances in integer cents', async () => {
		const balances = [
			{ user_id: 'a', balance_cents: 334 },
			{ user_id: 'b', balance_cents: -334 }
		];
		const supabase = { rpc: vi.fn().mockResolvedValue({ data: balances, error: null }) };
		await expect(loadExpenseSettlementBalances(supabase as never, 'collection')).resolves.toEqual({
			balances,
			warning: null
		});
	});
});
