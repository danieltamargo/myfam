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
	description: string;
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
		description: 'Personas, invitaciones y roles de la familia.',
		icon: '👥',
		availability: 'core',
		familyCanDisable: false,
		href: (familyId) => familyHref(familyId, 'members')
	},
	wishlist: {
		id: 'wishlist',
		label: 'Wishlist',
		description: 'Regalos, reservas y coordinación sin spoilers.',
		icon: '🎁',
		availability: 'core',
		familyCanDisable: false,
		href: (familyId) => familyHref(familyId, 'wishlist')
	},
	expenses: {
		id: 'expenses',
		label: 'Gastos',
		description: 'Colecciones privadas, repartos y análisis de gastos.',
		icon: '💶',
		availability: 'available',
		familyCanDisable: true,
		href: (familyId) => familyHref(familyId, 'expenses')
	},
	calendar: {
		id: 'calendar',
		label: 'Calendario',
		description: 'Eventos compartidos, recurrencias y recordatorios.',
		icon: '📅',
		availability: 'available',
		familyCanDisable: true,
		href: (familyId) => familyHref(familyId, 'calendar')
	},
	tasks: {
		id: 'tasks',
		label: 'Tareas',
		description: 'Tareas familiares con responsables y fechas.',
		icon: '✅',
		availability: 'available',
		familyCanDisable: true,
		href: (familyId) => familyHref(familyId, 'tasks')
	},
	lists: {
		id: 'lists',
		label: 'Listas',
		description: 'Listas de compra compartidas y privadas.',
		icon: '🛒',
		availability: 'available',
		familyCanDisable: true,
		href: (familyId) => familyHref(familyId, 'lists')
	},
	notes: {
		id: 'notes',
		label: 'Notas',
		description: 'Notas seguras con visibilidad seleccionable.',
		icon: '📝',
		availability: 'available',
		familyCanDisable: true,
		href: (familyId) => familyHref(familyId, 'notes')
	},
	planner: {
		id: 'planner',
		label: 'Planner',
		description: 'Vista unificada de la actividad familiar próxima.',
		icon: '🗓️',
		availability: 'available',
		familyCanDisable: true,
		href: (familyId) => familyHref(familyId, 'planner')
	},
	meals: {
		id: 'meals',
		label: 'Comidas',
		description: 'Plan semanal, recetas e ingredientes para comprar.',
		icon: '🍽️',
		availability: 'available',
		familyCanDisable: true,
		href: (familyId) => familyHref(familyId, 'meals')
	},
	habits: {
		id: 'habits',
		label: 'Hábitos',
		description: 'Rutinas privadas o compartidas sin gamificación.',
		icon: '🌱',
		availability: 'available',
		familyCanDisable: true,
		href: (familyId) => familyHref(familyId, 'habits')
	},
	documents: {
		id: 'documents',
		label: 'Documentos',
		description: 'Archivos privados con permisos y caducidad.',
		icon: '📁',
		availability: 'available',
		familyCanDisable: true,
		href: (familyId) => familyHref(familyId, 'documents')
	},
	games: {
		id: 'games',
		label: 'Juegos',
		description: 'Tres en raya, Wordle compartido, reacción y acertar el color entre familiares.',
		icon: '🎮',
		availability: 'available',
		familyCanDisable: true,
		href: (familyId) => familyHref(familyId, 'games')
	}
};

export const MODULE_ORDER: readonly ModuleId[] = [
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

export const FAMILY_CONFIGURABLE_MODULE_IDS = MODULE_ORDER.filter(
	(moduleId) => MODULE_CATALOG[moduleId].familyCanDisable
);

export function getModuleDefinitions(): ModuleDefinition[] {
	return MODULE_ORDER.map((moduleId) => MODULE_CATALOG[moduleId]);
}

export function isModuleId(value: unknown): value is ModuleId {
	return typeof value === 'string' && Object.hasOwn(MODULE_CATALOG, value);
}

export function getNavigationModules(enabledModuleIds: readonly ModuleId[]): ModuleDefinition[] {
	const enabled = new Set(enabledModuleIds);
	return getModuleDefinitions().filter(
		(module) =>
			module.availability === 'core' ||
			(module.availability === 'available' && enabled.has(module.id))
	);
}
