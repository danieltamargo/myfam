import { describe, expect, it } from 'vitest';
import { isValidBirthday, upcomingBirthdays } from './upcoming';

const member = (month: number | null, day: number | null, userId = 'member') => ({
	userId,
	displayName: 'Ángela',
	month,
	day
});

describe('upcoming birthdays', () => {
	it('includes today and day 14, excludes day 15, and links the actual wishlist member filter', () => {
		const alerts = upcomingBirthdays(
			[member(11, 16, 'outside'), member(11, 15, 'boundary'), member(11, 1, 'today')],
			'family',
			new Date('2026-11-01T12:00:00Z')
		);
		expect(alerts.map((alert) => [alert.userId, alert.daysUntil])).toEqual([
			['today', 0],
			['boundary', 14]
		]);
		expect(alerts[0].wishlistHref).toBe('/family/family/wishlist?member=today');
	});
	it('uses Madrid civil dates rather than UTC or server timezone', () => {
		const [alert] = upcomingBirthdays([member(11, 2)], 'family', new Date('2026-11-01T23:30:00Z'));
		expect(alert.daysUntil).toBe(0);
		expect(alert.date).toBe('2026-11-02');
	});
	it('crosses the year boundary and skips birthdays already past', () => {
		const alerts = upcomingBirthdays(
			[member(1, 1), member(12, 24, 'past')],
			'family',
			new Date('2026-12-25T12:00:00Z')
		);
		expect(alerts).toHaveLength(1);
		expect(alerts[0]).toMatchObject({ date: '2027-01-01', daysUntil: 7 });
	});
	it('observes leap birthdays on February 28 only in non-leap years', () => {
		expect(
			upcomingBirthdays([member(2, 29)], 'family', new Date('2027-02-28T12:00:00Z'))[0]
		).toMatchObject({ date: '2027-02-28', daysUntil: 0 });
		expect(
			upcomingBirthdays([member(2, 29)], 'family', new Date('2028-02-28T12:00:00Z'))[0]
		).toMatchObject({ date: '2028-02-29', daysUntil: 1 });
	});
	it('ignores unset or impossible dates and handles DST as whole calendar days', () => {
		expect(
			upcomingBirthdays(
				[member(null, null), member(2, 30), member(0, 1)],
				'family',
				new Date('2026-03-28T12:00:00Z')
			)
		).toEqual([]);
		expect(
			upcomingBirthdays([member(3, 30)], 'family', new Date('2026-03-28T12:00:00Z'))[0].daysUntil
		).toBe(2);
		expect(isValidBirthday(2, 29)).toBe(true);
		expect(isValidBirthday(4, 31)).toBe(false);
		expect(isValidBirthday(1.5, 2)).toBe(false);
	});
});
