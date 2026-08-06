export interface ExpenseSplitValue {
	userId: string;
	amount: number;
}

export function moneyToCents(value: number | string): number | null {
	const normalized = typeof value === 'number' ? String(value) : value.trim().replace(',', '.');
	if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
	const [units, fraction = ''] = normalized.split('.');
	const cents = Number(units) * 100 + Number(fraction.padEnd(2, '0'));
	return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export function centsToAmount(cents: number): number {
	return Number((cents / 100).toFixed(2));
}

export function splitExpenseEqually(
	amount: number | string,
	userIds: readonly string[]
): ExpenseSplitValue[] {
	const cents = moneyToCents(amount);
	const participants = [...new Set(userIds.filter(Boolean))];
	if (cents === null || participants.length === 0) return [];
	const base = Math.floor(cents / participants.length);
	const remainder = cents % participants.length;
	return participants.map((userId, index) => ({
		userId,
		amount: centsToAmount(base + (index < remainder ? 1 : 0))
	}));
}

export function splitTotalInCents(splits: readonly ExpenseSplitValue[]): number | null {
	let total = 0;
	for (const split of splits) {
		const cents = moneyToCents(split.amount);
		if (cents === null) return null;
		total += cents;
	}
	return total;
}
