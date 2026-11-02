import { describe, expect, it } from 'vitest';
import { parseMemberFilter } from './schemas';
import { parseFamilyNoteForm, parseNoteFilter } from './schemas';

const ownerId = '10000000-0000-4000-8000-000000000001';
const memberId = '10000000-0000-4000-8000-000000000002';

describe('note schemas', () => {
	it('normaliza texto y lectores explícitos de una nota seleccionada', () => {
		const form = new FormData();
		form.set('title', '  Plan familiar  ');
		form.set('content', 'Primera línea\r\n<script>alert(1)</script>');
		form.set('visibility', 'selected_members');
		form.append('member_ids', ownerId);
		form.append('member_ids', memberId);
		expect(parseFamilyNoteForm(form, new Set([ownerId, memberId]), ownerId)).toEqual({
			success: true,
			data: {
				title: 'Plan familiar',
				content: 'Primera línea\n<script>alert(1)</script>',
				visibility: 'selected_members',
				memberIds: [memberId]
			}
		});
	});

	it('exige otra persona para la visibilidad seleccionada', () => {
		const form = new FormData();
		form.set('title', 'Plan');
		form.set('visibility', 'selected_members');
		form.set('member_ids', ownerId);
		expect(parseFamilyNoteForm(form, new Set([ownerId]), ownerId).success).toBe(false);
	});

	it('descarta lectores al guardar una nota privada', () => {
		const form = new FormData();
		form.set('title', 'Personal');
		form.set('visibility', 'private');
		form.set('member_ids', memberId);
		expect(parseFamilyNoteForm(form, new Set([ownerId, memberId]), ownerId)).toMatchObject({
			success: true,
			data: { memberIds: [], visibility: 'private' }
		});
	});

	it('limita búsqueda y normaliza filtros desconocidos', () => {
		const params = new URLSearchParams({ filter: 'other', search: `  ${'a'.repeat(120)}  ` });
		expect(parseNoteFilter(params)).toMatchObject({ filter: 'all', search: 'a'.repeat(100) });
	});
});

it('acepta una persona válida e ignora filtros malformados', () => {
	expect(parseMemberFilter(new URLSearchParams({ member: memberId }))).toBe(memberId);
	for (const member of ['', 'invalid', 'or=(id.gt.0)']) {
		expect(parseMemberFilter(new URLSearchParams({ member }))).toBe('');
	}
});
