import { describe, expect, it } from 'vitest';
import { parseFamilyListForm, parseFamilyListItemForm } from './schemas';

const memberId = '10000000-0000-4000-8000-000000000001';
const listId = '10000000-0000-4000-8000-000000000002';

describe('list schemas', () => {
	it('mantiene otros para formularios anteriores y rechaza tipos o fuentes inválidos', () => {
		const form = new FormData();
		form.set('title', 'Casa');
		form.set('visibility', 'private');
		expect(parseFamilyListForm(form, new Set())).toMatchObject({
			success: true,
			data: { listType: 'other', sourceListId: null }
		});
		form.set('list_type', 'inventado');
		form.set('source_list_id', 'invalid');
		expect(parseFamilyListForm(form, new Set())).toMatchObject({
			success: false,
			errors: { list_type: expect.any(String), source_list_id: expect.any(String) }
		});
	});
	it('conserva membresía explícita solo para una lista seleccionada', () => {
		const form = new FormData();
		form.set('title', 'Compra semanal');
		form.set('visibility', 'selected_members');
		form.set('member_ids', memberId);
		expect(parseFamilyListForm(form, new Set([memberId]))).toMatchObject({
			success: true,
			data: { memberIds: [memberId], visibility: 'selected_members' }
		});
	});

	it('descarta miembros en una lista privada', () => {
		const form = new FormData();
		form.set('title', 'Personal');
		form.set('visibility', 'private');
		form.set('member_ids', memberId);
		expect(parseFamilyListForm(form, new Set([memberId]))).toMatchObject({
			success: true,
			data: { memberIds: [] }
		});
	});

	it('normaliza un artículo con cantidad y unidad', () => {
		const form = new FormData();
		form.set('list_id', listId);
		form.set('title', 'Tomates');
		form.set('quantity', '2.5');
		form.set('unit', 'kg');
		expect(parseFamilyListItemForm(form)).toMatchObject({
			success: true,
			data: { item: { quantity: 2.5, unit: 'kg' } }
		});
	});

	it('rechaza cantidades no positivas', () => {
		const form = new FormData();
		form.set('list_id', listId);
		form.set('title', 'Leche');
		form.set('quantity', '0');
		expect(parseFamilyListItemForm(form).success).toBe(false);
	});
});
