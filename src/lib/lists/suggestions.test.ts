import { describe, expect, it } from 'vitest';
import {
	itemEmoji,
	normalizeListText,
	suggestListItems,
	suggestListTemplates,
	type ListHistory
} from './suggestions';

const history: ListHistory[] = [
	{
		id: 'private',
		title: 'Personal',
		list_type: 'shopping',
		visibility: 'private',
		items: [{ title: 'Café privado', quantity: 2, unit: 'kg' }]
	},
	{
		id: 'family',
		title: 'Semana',
		list_type: 'shopping',
		visibility: 'family',
		items: [
			{ title: 'Pan', quantity: 2, unit: 'barras' },
			{ title: 'Café', quantity: 0.5, unit: 'kg' }
		]
	},
	{
		id: 'related',
		title: 'Desayuno',
		list_type: 'shopping',
		visibility: 'family',
		items: [
			{ title: 'Pan', quantity: 1, unit: null },
			{ title: 'Leche', quantity: 3, unit: 'l' }
		]
	},
	{
		id: 'home',
		title: 'Casa',
		list_type: 'home',
		visibility: 'family',
		items: [{ title: 'Bombilla', quantity: 1, unit: null }]
	}
];

describe('list suggestions', () => {
	it('normaliza acentos y distingue palabras completas para iconos', () => {
		expect(normalizeListText('  CAFÉ  molido ')).toBe('cafe molido');
		expect(itemEmoji('Plátanos de Canarias')).toBe('🍌');
		expect(itemEmoji('CAFÉ molido')).toBe('☕');
		expect(itemEmoji('pantalla')).toBeNull();
		expect(itemEmoji('pendiente desconocido')).toBeNull();
	});
	it('filtra tipo y excluye plantillas vacías', () => {
		expect(
			suggestListTemplates([...history, { ...history[3], id: 'empty', items: [] }], 'home').map(
				({ id }) => id
			)
		).toEqual(['home']);
	});
	it('conserva cantidad y unidad, y excluye los elementos existentes', () => {
		const result = suggestListItems(
			history,
			{ id: 'new', list_type: 'shopping', visibility: 'family' },
			[{ title: 'PAN', quantity: 1, unit: null }],
			''
		);
		expect(result).toEqual([
			{ title: 'Café', quantity: 0.5, unit: 'kg' },
			{ title: 'Leche', quantity: 3, unit: 'l' }
		]);
	});
	it('prioriza productos que aparecen juntos en el histórico', () => {
		const result = suggestListItems(
			history,
			{ id: 'new', list_type: 'shopping', visibility: 'family' },
			[{ title: 'Café', quantity: 1, unit: null }],
			''
		);
		expect(result.map((item) => item.title)).toEqual(['Pan', 'Leche']);
	});
	it('no ofrece información privada en destinos compartidos y evita duplicados con acentos', () => {
		expect(
			suggestListItems(
				history,
				{ id: 'new', list_type: 'shopping', visibility: 'selected_members' },
				[{ title: 'Cafe', quantity: 1, unit: null }],
				'CAFE'
			)
		).toEqual([]);
	});
	it('permite histórico visible privado solo en destino privado', () => {
		expect(
			suggestListItems(
				history,
				{ id: 'new', list_type: 'shopping', visibility: 'private' },
				[],
				'cafe'
			)
		).toHaveLength(2);
	});
	it('no inventa recomendaciones sin histórico', () => {
		expect(
			suggestListItems([], { id: 'new', list_type: 'other', visibility: 'family' }, [], '')
		).toEqual([]);
	});
});
