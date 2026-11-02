import { describe, expect, it } from 'vitest';
import { parseMemberFilter } from './schemas';
import { parseTaskForm, parseTaskStatus, parseTaskView } from './schemas';

const memberId = '10000000-0000-4000-8000-000000000001';
const groupId = '10000000-0000-4000-8000-000000000002';

function validTaskForm(): FormData {
	const form = new FormData();
	form.set('title', 'Comprar pan');
	form.set('due_on', '2026-08-08');
	form.set('priority', 'high');
	form.set('assignee_ids', memberId);
	form.set('recurrence_frequency', 'weekly');
	form.set('recurrence_interval', '1');
	form.set('recurrence_until', '2026-09-08');
	form.set('group_id', groupId);
	return form;
}

describe('task schemas', () => {
	it('normaliza una tarea recurrente válida', () => {
		const result = parseTaskForm(validTaskForm(), new Set([memberId]), new Set([groupId]));
		expect(result).toMatchObject({
			success: true,
			data: { title: 'Comprar pan', recurrenceFrequency: 'weekly', assigneeIds: [memberId] }
		});
	});

	it('rechaza miembros externos y recurrencia sin fin', () => {
		const form = validTaskForm();
		form.set('assignee_ids', '20000000-0000-4000-8000-000000000001');
		form.delete('recurrence_until');
		const result = parseTaskForm(form, new Set([memberId]), new Set([groupId]));
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.errors.assignee_ids).toBeTruthy();
			expect(result.errors.recurrence_until).toBeTruthy();
		}
	});

	it('limita las vistas a los cuatro filtros admitidos', () => {
		expect(parseTaskView(new URLSearchParams('view=overdue'))).toBe('overdue');
		expect(parseTaskView(new URLSearchParams('view=unknown'))).toBe('mine');
	});

	it('valida versión y estado al cambiar una tarea', () => {
		const form = new FormData();
		form.set('task_id', memberId);
		form.set('version', '2');
		form.set('status', 'completed');
		expect(parseTaskStatus(form)).toMatchObject({
			success: true,
			data: { version: 2, status: 'completed' }
		});
	});
});

it('acepta una persona válida e ignora filtros malformados', () => {
	expect(parseMemberFilter(new URLSearchParams({ member: memberId }))).toBe(memberId);
	for (const member of ['', 'invalid', 'or=(id.gt.0)']) {
		expect(parseMemberFilter(new URLSearchParams({ member }))).toBe('');
	}
});
