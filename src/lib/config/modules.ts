export type ModuleId =
	| 'members'
	| 'wishlist'
	| 'expenses'
	| 'calendar'
	| 'tasks'
	| 'lists'
	| 'notes'
	| 'planner'
	| 'meals'
	| 'habits'
	| 'documents'
	| 'games';

export type ModuleAvailability = 'core' | 'available' | 'preview' | 'disabled';

export interface ModuleDefinition {
	id: ModuleId;
	label: string;
	icon: string;
	availability: ModuleAvailability;
	familyCanDisable: boolean;
	href: (familyId: string) => string;
}

const familyHref = (familyId: string, path: string) =>
	`/family/${encodeURIComponent(familyId)}/${path}`;

export const MODULE_CATALOG: Record<ModuleId, ModuleDefinition> = {
	members: {
		id: 'members',
		label: 'Miembros',
		icon: '👥',
		availability: 'core',
		familyCanDisable: false,
		href: (familyId) => familyHref(familyId, 'members')
	},
	wishlist: {
		id: 'wishlist',
		label: 'Wishlist',
		icon: '🎁',
		availability: 'core',
		familyCanDisable: false,
		href: (familyId) => familyHref(familyId, 'wishlist')
	},
	expenses: {
		id: 'expenses',
		label: 'Gastos',
		icon: '💶',
		availability: 'preview',
		familyCanDisable: true,
		href: (familyId) => familyHref(familyId, 'expenses')
	},
	calendar: {
		id: 'calendar',
		label: 'Calendario',
		icon: '📅',
		availability: 'preview',
		familyCanDisable: true,
		href: (familyId) => familyHref(familyId, 'calendar')
	},
	tasks: {
		id: 'tasks',
		label: 'Tareas',
		icon: '✅',
		availability: 'preview',
		familyCanDisable: true,
		href: (familyId) => familyHref(familyId, 'tasks')
	},
	lists: {
		id: 'lists',
		label: 'Listas',
		icon: '🛒',
		availability: 'preview',
		familyCanDisable: true,
		href: (familyId) => familyHref(familyId, 'lists')
	},
	notes: {
		id: 'notes',
		label: 'Notas',
		icon: '📝',
		availability: 'preview',
		familyCanDisable: true,
		href: (familyId) => familyHref(familyId, 'notes')
	},
	planner: {
		id: 'planner',
		label: 'Planner',
		icon: '🗓️',
		availability: 'preview',
		familyCanDisable: true,
		href: (familyId) => familyHref(familyId, 'planner')
	},
	meals: {
		id: 'meals',
		label: 'Comidas',
		icon: '🍽️',
		availability: 'preview',
		familyCanDisable: true,
		href: (familyId) => familyHref(familyId, 'meals')
	},
	habits: {
		id: 'habits',
		label: 'Hábitos',
		icon: '🌱',
		availability: 'preview',
		familyCanDisable: true,
		href: (familyId) => familyHref(familyId, 'habits')
	},
	documents: {
		id: 'documents',
		label: 'Documentos',
		icon: '📁',
		availability: 'preview',
		familyCanDisable: true,
		href: (familyId) => familyHref(familyId, 'documents')
	},
	games: {
		id: 'games',
		label: 'Juegos',
		icon: '🎮',
		availability: 'disabled',
		familyCanDisable: false,
		href: (familyId) => familyHref(familyId, 'games')
	}
};

const MODULE_ORDER: ModuleId[] = [
	'members',
	'wishlist',
	'expenses',
	'calendar',
	'tasks',
	'lists',
	'notes',
	'planner',
	'meals',
	'habits',
	'documents',
	'games'
];

export function getNavigationModules(): ModuleDefinition[] {
	return MODULE_ORDER.map((moduleId) => MODULE_CATALOG[moduleId]).filter(
		(module) => module.availability === 'core' || module.availability === 'available'
	);
}
