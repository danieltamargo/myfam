import { describe, expect, it } from 'vitest';
import { habitWeek, parseHabitCompletion, parseHabitForm } from './schemas';

const ownerId = '10000000-0000-4000-8000-000000000001';
const memberId = '10000000-0000-4000-8000-000000000002';

describe('habit schemas', () => {
	it('mantiene el hábito privado por defecto y descarta audiencia', () => {
		const form = new FormData();
		form.set('title', '  Leer  ');
		form.set('visibility', 'private');
		form.set('start_on', '2026-08-05');
		form.set('member_ids', memberId);
		expect(
			parseHabitForm(form, new Set([ownerId, memberId]), ownerId, new Date('2026-08-05T12:00:00Z'))
		).toMatchObject({
			success: true,
			data: { title: 'Leer', visibility: 'private', memberIds: [] }
		});
	});

	it('exige una audiencia válida para compartir', () => {
		const form = new FormData();
		form.set('title', 'Caminar');
		form.set('visibility', 'selected_members');
		form.set('start_on', '2026-08-05');
		expect(
			parseHabitForm(form, new Set([ownerId]), ownerId, new Date('2026-08-05T12:00:00Z')).success
		).toBe(false);
	});

	it('impide registrar el futuro y devuelve una ventana de siete días', () => {
		const form = new FormData();
		form.set('habit_id', ownerId);
		form.set('completed_on', '2026-08-06');
		form.set('completed', 'true');
		expect(parseHabitCompletion(form, new Date('2026-08-05T12:00:00Z')).success).toBe(false);
		expect(habitWeek(new Date('2026-08-05T12:00:00Z'))).toEqual([
			'2026-07-30',
			'2026-07-31',
			'2026-08-01',
			'2026-08-02',
			'2026-08-03',
			'2026-08-04',
			'2026-08-05'
		]);
	});
});
