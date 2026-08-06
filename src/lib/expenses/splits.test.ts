import { describe, expect, it } from 'vitest';
import { moneyToCents, splitExpenseEqually, splitTotalInCents } from './splits';

describe('expense split arithmetic', () => {
	it('parses decimal money without floating-point multiplication', () => {
		expect(moneyToCents('10,01')).toBe(1001);
		expect(moneyToCents('0.009')).toBeNull();
	});

	it('assigns remainder cents deterministically', () => {
		expect(splitExpenseEqually('10.01', ['a', 'b'])).toEqual([
			{ userId: 'a', amount: 5.01 },
			{ userId: 'b', amount: 5 }
		]);
	});

	it('keeps the exact total across three participants', () => {
		const splits = splitExpenseEqually('100.00', ['a', 'b', 'c']);
		expect(splits).toEqual([
			{ userId: 'a', amount: 33.34 },
			{ userId: 'b', amount: 33.33 },
			{ userId: 'c', amount: 33.33 }
		]);
		expect(splitTotalInCents(splits)).toBe(10_000);
	});

	it('removes duplicate participant identifiers', () => {
		expect(splitExpenseEqually('2.00', ['a', 'a', 'b'])).toHaveLength(2);
	});
});
