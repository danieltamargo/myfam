export type ExpensePeriod =
	| { preset: 'month'; anchor: string }
	| { preset: 'quarter'; anchor: string }
	| { preset: 'year'; anchor: string }
	| { preset: 'custom'; from: string; to: string };

export interface ExpenseFilterState {
	period: ExpensePeriod;
	from: string;
	to: string;
	previousFrom: string;
	previousTo: string;
	paidBy: string | null;
	categoryId: string | null;
	granularity: 'day' | 'month';
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_CUSTOM_DAYS = 731;

interface CalendarDate {
	year: number;
	month: number;
	day: number;
}

function isLeapYear(year: number): boolean {
	return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
	if (month === 2) return isLeapYear(year) ? 29 : 28;
	return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function parseDate(value: string): CalendarDate | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return null;
	const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
	if (
		date.year < 1 ||
		date.year > 9999 ||
		date.month < 1 ||
		date.month > 12 ||
		date.day < 1 ||
		date.day > daysInMonth(date.year, date.month)
	)
		return null;
	return date;
}

function formatDate(date: CalendarDate): string {
	return `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

function addOneDay(date: CalendarDate, direction: 1 | -1): CalendarDate {
	let { year, month, day } = date;
	day += direction;
	if (direction === 1 && day > daysInMonth(year, month)) {
		day = 1;
		month += 1;
		if (month > 12) {
			month = 1;
			year += 1;
		}
	} else if (direction === -1 && day < 1) {
		month -= 1;
		if (month < 1) {
			month = 12;
			year -= 1;
		}
		day = daysInMonth(year, month);
	}
	return { year, month, day };
}

export function addCalendarDays(value: string, amount: number): string {
	const parsed = parseDate(value);
	if (!parsed || !Number.isSafeInteger(amount)) throw new Error('Invalid calendar date operation');
	let current = parsed;
	const direction: 1 | -1 = amount >= 0 ? 1 : -1;
	for (let index = 0; index < Math.abs(amount); index += 1) current = addOneDay(current, direction);
	return formatDate(current);
}

export function inclusiveCalendarDays(from: string, to: string): number {
	if (!parseDate(from) || !parseDate(to) || from > to) throw new Error('Invalid calendar range');
	let days = 1;
	let current = from;
	while (current < to) {
		current = addCalendarDays(current, 1);
		days += 1;
		if (days > MAX_CUSTOM_DAYS) throw new Error('Calendar range is too large');
	}
	return days;
}

function defaultAnchor(): string {
	const now = new Date();
	return [now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate()]
		.map((part, index) => String(part).padStart(index === 0 ? 4 : 2, '0'))
		.join('-');
}

function presetRange(
	preset: Exclude<ExpensePeriod['preset'], 'custom'>,
	anchor: string
): { from: string; to: string } {
	const date = parseDate(anchor);
	if (!date) throw new Error('Invalid anchor date');
	if (preset === 'year') return { from: `${date.year}-01-01`, to: `${date.year}-12-31` };
	const startMonth = preset === 'quarter' ? Math.floor((date.month - 1) / 3) * 3 + 1 : date.month;
	const endMonth = preset === 'quarter' ? startMonth + 2 : startMonth;
	return {
		from: formatDate({ year: date.year, month: startMonth, day: 1 }),
		to: formatDate({
			year: date.year,
			month: endMonth,
			day: daysInMonth(date.year, endMonth)
		})
	};
}

export function parseExpenseFilters(searchParams: URLSearchParams): ExpenseFilterState {
	const requestedPreset = searchParams.get('period');
	const preset = ['month', 'quarter', 'year', 'custom'].includes(requestedPreset ?? '')
		? (requestedPreset as ExpensePeriod['preset'])
		: 'month';
	const requestedAnchor = searchParams.get('anchor') ?? defaultAnchor();
	const anchor = parseDate(requestedAnchor) ? requestedAnchor : defaultAnchor();
	let period: ExpensePeriod;
	let from: string;
	let to: string;

	if (preset === 'custom') {
		const requestedFrom = searchParams.get('from') ?? anchor;
		const requestedTo = searchParams.get('to') ?? anchor;
		if (!parseDate(requestedFrom) || !parseDate(requestedTo) || requestedFrom > requestedTo)
			throw new Error('El intervalo personalizado no es válido.');
		from = requestedFrom;
		to = requestedTo;
		period = { preset, from, to };
	} else {
		period = { preset, anchor };
		({ from, to } = presetRange(preset, anchor));
	}

	const days = inclusiveCalendarDays(from, to);
	let previousFrom: string;
	let previousTo: string;
	if (preset === 'custom') {
		previousTo = addCalendarDays(from, -1);
		previousFrom = addCalendarDays(previousTo, -(days - 1));
	} else {
		const previousAnchor = addCalendarDays(from, -1);
		({ from: previousFrom, to: previousTo } = presetRange(preset, previousAnchor));
	}
	const paidByValue = searchParams.get('paid_by');
	const categoryValue = searchParams.get('category');
	return {
		period,
		from,
		to,
		previousFrom,
		previousTo,
		paidBy: paidByValue && UUID_PATTERN.test(paidByValue) ? paidByValue : null,
		categoryId: categoryValue && UUID_PATTERN.test(categoryValue) ? categoryValue : null,
		granularity: days > 93 ? 'month' : 'day'
	};
}
