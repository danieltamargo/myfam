import { describe, expect, it } from 'vitest';
import { addCalendarDays, inclusiveCalendarDays, parseExpenseFilters } from './filters';

describe('expense period filters', () => {
	it('calculates calendar months and an equivalent previous period', () => {
		const filters = parseExpenseFilters(new URLSearchParams('period=month&anchor=2026-08-19'));
		expect(filters).toMatchObject({
			from: '2026-08-01',
			to: '2026-08-31',
			previousFrom: '2026-07-01',
			previousTo: '2026-07-31',
			granularity: 'day'
		});
	});

	it('calculates quarter boundaries across the first quarter', () => {
		const filters = parseExpenseFilters(new URLSearchParams('period=quarter&anchor=2026-02-15'));
		expect(filters).toMatchObject({
			from: '2026-01-01',
			to: '2026-03-31',
			previousFrom: '2025-10-01',
			previousTo: '2025-12-31'
		});
	});

	it('keeps leap-day year boundaries as local DATE values', () => {
		const filters = parseExpenseFilters(new URLSearchParams('period=year&anchor=2024-02-29'));
		expect(filters.from).toBe('2024-01-01');
		expect(filters.to).toBe('2024-12-31');
		expect(filters.previousFrom).toBe('2023-01-01');
		expect(filters.previousTo).toBe('2023-12-31');
		expect(inclusiveCalendarDays(filters.from, filters.to)).toBe(366);
	});

	it('supports a custom range and rejects ranges longer than two years', () => {
		const filters = parseExpenseFilters(
			new URLSearchParams('period=custom&from=2026-02-27&to=2026-03-02')
		);
		expect(filters).toMatchObject({
			from: '2026-02-27',
			to: '2026-03-02',
			previousFrom: '2026-02-23',
			previousTo: '2026-02-26'
		});
		expect(() =>
			parseExpenseFilters(new URLSearchParams('period=custom&from=2020-01-01&to=2026-01-01'))
		).toThrow('Calendar range is too large');
	});

	it('crosses month and leap-year boundaries without local-time conversion', () => {
		expect(addCalendarDays('2024-02-28', 1)).toBe('2024-02-29');
		expect(addCalendarDays('2024-03-01', -1)).toBe('2024-02-29');
		expect(addCalendarDays('2025-01-01', -1)).toBe('2024-12-31');
	});
});
