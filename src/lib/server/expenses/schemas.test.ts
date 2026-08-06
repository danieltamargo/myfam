import { describe, expect, it } from 'vitest';
import {
	canCreateExpense,
	canManageExpenseCollection,
	canMutateExpense,
	parseExpenseCollectionForm,
	parseExpenseForm
} from './schemas';

const collectionId = '30000000-0000-4000-8000-000000000001';
const payerId = '30000000-0000-4000-8000-000000000002';

function validExpenseForm(): FormData {
	const form = new FormData();
	form.set('description', 'Compra semanal');
	form.set('amount', '42,75');
	form.set('occurred_on', '2026-08-06');
	form.set('paid_by', payerId);
	return form;
}

describe('expense validation', () => {
	it('normalizes a lowercase ISO currency code', () => {
		const form = new FormData();
		form.set('name', 'Casa');
		form.set('currency', 'eur');
		expect(parseExpenseCollectionForm(form)).toEqual({
			success: true,
			data: { name: 'Casa', description: null, currency: 'EUR' }
		});
	});

	it.each(['0', '-1', '12.345', '1e3', '10000000000'])('rejects invalid amount %s', (amount) => {
		const form = validExpenseForm();
		form.set('amount', amount);
		const result = parseExpenseForm(form, {
			collectionId,
			activeUserIds: new Set([payerId])
		});
		expect(result.success).toBe(false);
		if (!result.success) expect(result.errors.amount).toBeDefined();
	});

	it('accepts comma decimals without converting the DATE to an instant', () => {
		const result = parseExpenseForm(validExpenseForm(), {
			collectionId,
			activeUserIds: new Set([payerId])
		});
		expect(result).toMatchObject({
			success: true,
			data: { amount: 42.75, occurredOn: '2026-08-06', paidBy: payerId }
		});
	});

	it.each(['2025-02-29', '2026-13-01', '06/08/2026'])('rejects invalid local date %s', (date) => {
		const form = validExpenseForm();
		form.set('occurred_on', date);
		const result = parseExpenseForm(form, {
			collectionId,
			activeUserIds: new Set([payerId])
		});
		expect(result.success).toBe(false);
		if (!result.success) expect(result.errors.occurred_on).toBeDefined();
	});

	it('rejects a payer who is not an active participant', () => {
		const result = parseExpenseForm(validExpenseForm(), {
			collectionId,
			activeUserIds: new Set()
		});
		expect(result.success).toBe(false);
		if (!result.success) expect(result.errors.paid_by).toBeDefined();
	});
});

describe('expense permissions', () => {
	it('restricts collection management to owner and manager', () => {
		expect(canManageExpenseCollection('owner')).toBe(true);
		expect(canManageExpenseCollection('manager')).toBe(true);
		expect(canManageExpenseCollection('contributor')).toBe(false);
		expect(canManageExpenseCollection('viewer')).toBe(false);
	});

	it('allows contributors to create and mutate only their own expenses', () => {
		expect(canCreateExpense('contributor')).toBe(true);
		expect(canMutateExpense('contributor', payerId, payerId)).toBe(true);
		expect(canMutateExpense('contributor', payerId, crypto.randomUUID())).toBe(false);
	});

	it('keeps viewers read-only while managers can mutate every expense', () => {
		expect(canCreateExpense('viewer')).toBe(false);
		expect(canMutateExpense('viewer', payerId, payerId)).toBe(false);
		expect(canMutateExpense('manager', payerId, crypto.randomUUID())).toBe(true);
	});
});
