import { describe, expect, it } from 'vitest';
import { MAX_SETTLEMENT_CENTS, suggestSettlements } from './settlements';

describe('settlement suggestions', () => {
	it('clears every balance exactly, including unequal cent splits', () => {
		const balances = [
			{ userId: 'a', balanceCents: 667 },
			{ userId: 'b', balanceCents: -334 },
			{ userId: 'c', balanceCents: -333 }
		];
		const suggestions = suggestSettlements(balances);
		expect(suggestions).toEqual([
			{ fromUserId: 'b', toUserId: 'a', amountCents: 334 },
			{ fromUserId: 'c', toUserId: 'a', amountCents: 333 }
		]);
		const remaining = new Map(balances.map((b) => [b.userId, b.balanceCents]));
		for (const transfer of suggestions) {
			remaining.set(
				transfer.fromUserId,
				remaining.get(transfer.fromUserId)! + transfer.amountCents
			);
			remaining.set(transfer.toUserId, remaining.get(transfer.toUserId)! - transfer.amountCents);
		}
		expect([...remaining.values()]).toEqual([0, 0, 0]);
		expect(balances[0].balanceCents).toBe(667);
	});

	it('is deterministic and includes historic participants without requiring active membership', () => {
		const balances = [
			{ userId: 'removed-member', balanceCents: -1 },
			{ userId: 'creditor-b', balanceCents: 2 },
			{ userId: 'creditor-a', balanceCents: 3 },
			{ userId: 'active-debtor', balanceCents: -4 }
		];
		expect(suggestSettlements(balances)).toEqual(suggestSettlements([...balances].reverse()));
		expect(suggestSettlements(balances).some((s) => s.fromUserId === 'removed-member')).toBe(true);
	});

	it('returns no transfers for an empty or settled collection', () => {
		expect(suggestSettlements([])).toEqual([]);
		expect(suggestSettlements([{ userId: 'a', balanceCents: 0 }])).toEqual([]);
	});

	it('splits large aggregated balances into valid individual records without losing cents', () => {
		const amount = MAX_SETTLEMENT_CENTS * 2 + 2;
		const suggestions = suggestSettlements([
			{ userId: 'a', balanceCents: amount },
			{ userId: 'b', balanceCents: -amount }
		]);
		expect(suggestions.map((row) => row.amountCents)).toEqual([
			MAX_SETTLEMENT_CENTS,
			MAX_SETTLEMENT_CENTS,
			2
		]);
		expect(suggestions.reduce((sum, row) => sum + row.amountCents, 0)).toBe(amount);
	});

	it.each([
		[{ userId: 'a', balanceCents: 1 }],
		[{ userId: 'a', balanceCents: 0.1 }],
		[{ userId: 'a', balanceCents: Number.MAX_SAFE_INTEGER + 1 }],
		[
			{ userId: 'a', balanceCents: 0 },
			{ userId: 'a', balanceCents: 0 }
		]
	])('rejects unbalanced or imprecise inputs instead of rounding silently', (...balances) => {
		expect(() => suggestSettlements(balances)).toThrow();
	});
});
