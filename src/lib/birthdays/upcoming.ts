export const BIRTHDAY_LOOKAHEAD_DAYS = 14;
export const BIRTHDAY_TIMEZONE = 'Europe/Madrid';

export interface BirthdayMember {
	userId: string;
	displayName: string;
	month: number | null;
	day: number | null;
}

export interface BirthdayAlert {
	userId: string;
	displayName: string;
	date: string;
	daysUntil: number;
	wishlistHref: string;
}

export function isValidBirthday(month: number, day: number): boolean {
	if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1)
		return false;
	return day <= new Date(Date.UTC(2000, month, 0)).getUTCDate();
}

export function upcomingBirthdays(
	members: readonly BirthdayMember[],
	familyId: string,
	now = new Date()
): BirthdayAlert[] {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: BIRTHDAY_TIMEZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(now);
	const part = (name: string) => Number(parts.find((value) => value.type === name)?.value);
	const year = part('year');
	const today = Date.UTC(year, part('month') - 1, part('day'));
	const alerts: BirthdayAlert[] = [];
	for (const member of members) {
		if (member.month === null || member.day === null || !isValidBirthday(member.month, member.day))
			continue;
		const occurrence = (occurrenceYear: number) => {
			// In a non-leap year, a 29 February birthday is observed on 28 February.
			const day = Math.min(
				member.day!,
				new Date(Date.UTC(occurrenceYear, member.month!, 0)).getUTCDate()
			);
			return Date.UTC(occurrenceYear, member.month! - 1, day);
		};
		let next = occurrence(year);
		if (next < today) next = occurrence(year + 1);
		const daysUntil = (next - today) / 86_400_000;
		if (daysUntil > BIRTHDAY_LOOKAHEAD_DAYS) continue;
		alerts.push({
			userId: member.userId,
			displayName: member.displayName,
			date: new Date(next).toISOString().slice(0, 10),
			daysUntil,
			wishlistHref: `/family/${encodeURIComponent(familyId)}/wishlist?member=${encodeURIComponent(member.userId)}`
		});
	}
	return alerts.sort(
		(a, b) => a.daysUntil - b.daysUntil || a.displayName.localeCompare(b.displayName, 'es')
	);
}
