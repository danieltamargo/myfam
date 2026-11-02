export const LIST_TYPES = ['shopping', 'home', 'other'] as const;
export type ListType = (typeof LIST_TYPES)[number];
export const LIST_TYPE_LABELS: Record<ListType, string> = {
	shopping: 'Compra',
	home: 'Casa',
	other: 'Otros'
};

export function normalizeListText(text: string): string {
	return text
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.toLocaleLowerCase('es')
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();
}

const ITEM_EMOJIS: [string, string[]][] = [
	['🥛', ['leche', 'yogur', 'yogures']],
	['🍞', ['pan', 'baguette']],
	['🥚', ['huevo', 'huevos']],
	['🍎', ['manzana', 'manzanas']],
	['🍌', ['platano', 'platanos', 'banana', 'bananas']],
	['🍅', ['tomate', 'tomates']],
	['🥔', ['patata', 'patatas']],
	['🥕', ['zanahoria', 'zanahorias']],
	['🧀', ['queso', 'quesos']],
	['🍗', ['pollo']],
	['🐟', ['pescado', 'salmon', 'atun']],
	['🍚', ['arroz']],
	['🍝', ['pasta', 'macarrones', 'espaguetis']],
	['☕', ['cafe']],
	['🧹', ['barrer', 'escoba']],
	['🧽', ['limpiar', 'limpieza', 'esponja']],
	['🧺', ['lavadora', 'colada', 'detergente']],
	['💡', ['bombilla', 'bombillas']],
	['🧻', ['higienico', 'servilletas']],
	['🧼', ['jabon', 'gel']]
];

export function itemEmoji(title: string): string | null {
	const words = new Set(normalizeListText(title).split(' '));
	return ITEM_EMOJIS.find(([, matches]) => matches.some((word) => words.has(word)))?.[0] ?? null;
}

export interface HistoryItem {
	title: string;
	quantity: number;
	unit: string | null;
}
export interface ListHistory {
	id: string;
	title: string;
	list_type: ListType;
	visibility: string;
	items: HistoryItem[];
}

export function suggestListTemplates(history: ListHistory[], type: ListType): ListHistory[] {
	return history.filter((list) => list.list_type === type && list.items.length > 0).slice(0, 6);
}

export function suggestListItems(
	history: ListHistory[],
	target: { id: string; list_type: ListType; visibility: string },
	existing: HistoryItem[],
	query: string
): HistoryItem[] {
	const included = new Set(existing.map((item) => normalizeListText(item.title)));
	const search = normalizeListText(query);
	const scores = new Map<string, { item: HistoryItem; score: number; order: number }>();
	for (const list of history) {
		if (list.list_type !== target.list_type) continue;
		if (target.visibility !== 'private' && list.visibility !== 'family' && list.id !== target.id)
			continue;
		const related = list.items.some((item) => included.has(normalizeListText(item.title)));
		for (const item of list.items) {
			const key = normalizeListText(item.title);
			if (!key || included.has(key) || (search && !key.includes(search))) continue;
			const previous = scores.get(key);
			scores.set(key, {
				item: previous?.item ?? item,
				score: (previous?.score ?? 0) + (related ? 3 : 1),
				order: previous?.order ?? scores.size
			});
		}
	}
	return [...scores.values()]
		.sort((a, b) => b.score - a.score || a.order - b.order)
		.slice(0, 6)
		.map(({ item }) => item);
}
