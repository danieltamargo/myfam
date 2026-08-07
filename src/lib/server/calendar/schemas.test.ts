import { describe, expect, it, vi } from 'vitest';
import {
	isValidIanaTimezone,
	localDateTimeToIso,
	parseCalendarEventForm,
	parseCalendarQuery
} from './schemas';

const MEMBER_ID = '30000000-0000-4000-8000-000000000003';
const CATEGORY_ID = '30000000-2000-4000-8000-000000000001';

function validForm(): FormData {
	const form = new FormData();
	form.set('title', 'Comida familiar');
	form.set('description', 'En casa');
	form.set('timezone', 'Europe/Madrid');
	form.set('start_local', '2026-08-10T14:00');
	form.set('end_local', '2026-08-10T15:30');
	form.set('visibility', 'family');
	form.set('recurrence_frequency', 'none');
	form.set('recurrence_interval', '1');
	form.set('wishlist_category_id', CATEGORY_ID);
	form.set('reminder_minutes', '30');
	form.append('participant_ids', MEMBER_ID);
	return form;
}

describe('calendar timezone conversion', () => {
	it('accepts IANA zones and rejects invented zones', () => {
		expect(isValidIanaTimezone('Europe/Madrid')).toBe(true);
		expect(isValidIanaTimezone('Madrid/House')).toBe(false);
	});

	it('preserves local wall time across summer offset', () => {
		expect(localDateTimeToIso('2026-08-10T14:00', 'Europe/Madrid')).toBe(
			'2026-08-10T12:00:00.000Z'
		);
	});

	it('rejects a local time inside the DST spring gap', () => {
		expect(localDateTimeToIso('2026-03-29T02:30', 'Europe/Madrid')).toBeNull();
	});

	it('chooses a deterministic instant for an ambiguous autumn time', () => {
		expect(localDateTimeToIso('2026-10-25T02:30', 'Europe/Madrid')).toBe(
			'2026-10-25T00:30:00.000Z'
		);
	});
});

describe('calendar form validation', () => {
	it('parses a family event with explicit participants and wishlist link', () => {
		const parsed = parseCalendarEventForm(
			validForm(),
			new Set([MEMBER_ID]),
			new Set([CATEGORY_ID])
		);
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data.startsAt).toBe('2026-08-10T12:00:00.000Z');
			expect(parsed.data.participantIds).toEqual([MEMBER_ID]);
			expect(parsed.data.wishlistCategoryId).toBe(CATEGORY_ID);
		}
	});

	it('rejects non-family participants and unbounded recurrence', () => {
		const form = validForm();
		form.set('recurrence_frequency', 'daily');
		form.set('recurrence_until_local', '2029-08-10T14:00');
		const parsed = parseCalendarEventForm(form, new Set(), new Set([CATEGORY_ID]));
		expect(parsed.success).toBe(false);
		if (!parsed.success) {
			expect(parsed.errors.participant_ids).toBeTruthy();
			expect(parsed.errors.recurrence_until_local).toBeTruthy();
		}
	});

	it('accepts a 23-hour all-day interval across DST', () => {
		const form = validForm();
		form.set('all_day', 'true');
		form.set('start_local', '2026-03-29');
		form.set('end_local', '2026-03-30');
		const parsed = parseCalendarEventForm(form, new Set([MEMBER_ID]), new Set([CATEGORY_ID]));
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(
				new Date(parsed.data.endsAt).getTime() - new Date(parsed.data.startsAt).getTime()
			).toBe(23 * 60 * 60 * 1000);
		}
	});
});

describe('calendar query window', () => {
	it('builds a six-week monthly window from Monday', () => {
		const query = parseCalendarQuery(new URLSearchParams('view=month&date=2026-08-15'));
		expect(query.from).toBe('2026-07-27T00:00:00.000Z');
		expect(query.to).toBe('2026-09-07T00:00:00.000Z');
	});

	it('builds a bounded 90-day agenda window', () => {
		const query = parseCalendarQuery(new URLSearchParams('view=agenda&date=2026-08-15'));
		expect(query.from).toBe('2026-08-15T00:00:00.000Z');
		expect(query.to).toBe('2026-11-13T00:00:00.000Z');
	});

	it('falls back safely when date and participant are invalid', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-08-06T12:00:00Z'));
		const query = parseCalendarQuery(new URLSearchParams('date=not-a-date&participant=bad'));
		expect(query.anchor).toBe('2026-08-06');
		expect(query.participantId).toBeNull();
		vi.useRealTimers();
	});
});
