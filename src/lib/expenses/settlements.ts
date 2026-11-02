export interface SettlementBalance {
	userId: string;
	balanceCents: number;
}

export const MAX_SETTLEMENT_CENTS = 999_999_999_999;

export interface SuggestedSettlement {
	fromUserId: string;
	toUserId: string;
	amountCents: number;
}

export function suggestSettlements(balances: readonly SettlementBalance[]): SuggestedSettlement[] {
	const seen = new Set<string>();
	let total = 0n;
	for (const balance of balances) {
		if (!balance.userId || seen.has(balance.userId) || !Number.isSafeInteger(balance.balanceCents))
			throw new Error('Invalid settlement balance');
		seen.add(balance.userId);
		total += BigInt(balance.balanceCents);
	}
	if (total !== 0n) throw new Error('Settlement balances do not sum to zero');
	const ordered = [...balances].sort((a, b) => a.userId.localeCompare(b.userId));
	const debtors = ordered.filter((b) => b.balanceCents < 0).map((b) => ({ ...b }));
	const creditors = ordered.filter((b) => b.balanceCents > 0).map((b) => ({ ...b }));
	const suggestions: SuggestedSettlement[] = [];
	let creditorIndex = 0;
	for (const debtor of debtors) {
		while (debtor.balanceCents < 0) {
			const creditor = creditors[creditorIndex];
			const amountCents = Math.min(
				-debtor.balanceCents,
				creditor.balanceCents,
				MAX_SETTLEMENT_CENTS
			);
			suggestions.push({ fromUserId: debtor.userId, toUserId: creditor.userId, amountCents });
			debtor.balanceCents += amountCents;
			creditor.balanceCents -= amountCents;
			if (creditor.balanceCents === 0) creditorIndex += 1;
		}
	}
	return suggestions;
}
