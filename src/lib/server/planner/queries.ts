import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveModuleAccess } from '$lib/server/modules/availability';
import type { Database } from '$lib/types/database';

const PLANNER_MODULE_IDS = ['wishlist', 'expenses', 'calendar', 'tasks', 'lists'] as const;
const PLANNER_PREFERENCE_NAMES = PLANNER_MODULE_IDS;

type PlannerModuleId = (typeof PLANNER_MODULE_IDS)[number];

export type PlannerModuleState = Record<PlannerModuleId, boolean>;

export interface PlannerEvent {
	id: string;
	title: string;
	startsAt: string;
	endsAt: string;
	allDay: boolean;
}

export interface PlannerTask {
	id: string;
	title: string;
	dueOn: string;
	priority: string;
	isOverdue: boolean;
}

export interface PlannerList {
	id: string;
	title: string;
	completedItems: number;
	totalItems: number;
	updatedAt: string;
}

export interface PlannerExpenseTotal {
	currency: string;
	total: number;
	collectionCount: number;
}

export interface PlannerSnapshot {
	modules: PlannerModuleState;
	window: {
		from: string;
		to: string;
		monthFrom: string;
		monthTo: string;
	};
	events: PlannerEvent[];
	tasks: PlannerTask[];
	lists: PlannerList[];
	expenses: PlannerExpenseTotal[];
}

export class PlannerQueryError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'PlannerQueryError';
	}
}

function assertQuery(error: { message: string } | null, message: string): void {
	if (error) throw new PlannerQueryError(`${message}: ${error.message}`);
}

function addUtcDays(date: Date, days: number): Date {
	const result = new Date(date);
	result.setUTCDate(result.getUTCDate() + days);
	return result;
}

function isoDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}

export function resolvePlannerModules(
	preferences: ReadonlyArray<{ module_name: string; enabled: boolean | null }>
): PlannerModuleState {
	return Object.fromEntries(
		PLANNER_MODULE_IDS.map((moduleId) => [
			moduleId,
			resolveModuleAccess(moduleId, preferences).enabled
		])
	) as PlannerModuleState;
}

async function loadModuleState(
	supabase: SupabaseClient<Database>,
	familyId: string
): Promise<PlannerModuleState> {
	const { data, error } = await supabase
		.from('family_modules')
		.select('module_name, enabled')
		.eq('family_id', familyId)
		.in('module_name', [...PLANNER_PREFERENCE_NAMES]);
	assertQuery(error, 'No se pudieron cargar los módulos familiares');
	return resolvePlannerModules(data ?? []);
}

async function loadUpcomingEvents(
	supabase: SupabaseClient<Database>,
	familyId: string,
	from: string,
	to: string,
	enabled: boolean
): Promise<PlannerEvent[]> {
	if (!enabled) return [];
	const { data, error } = await supabase.rpc('get_calendar_occurrences', {
		p_family_id: familyId,
		p_from: from,
		p_to: to
	});
	assertQuery(error, 'No se pudieron cargar los próximos eventos');
	return (data ?? []).slice(0, 6).map((event) => ({
		id: event.event_id,
		title: event.title,
		startsAt: event.occurrence_start,
		endsAt: event.occurrence_end,
		allDay: event.all_day
	}));
}

async function loadUpcomingTasks(
	supabase: SupabaseClient<Database>,
	familyId: string,
	today: string,
	until: string,
	enabled: boolean
): Promise<PlannerTask[]> {
	if (!enabled) return [];
	const { data, error } = await supabase
		.from('family_tasks')
		.select('id, title, due_on, priority')
		.eq('family_id', familyId)
		.in('status', ['todo', 'in_progress'])
		.lte('due_on', until)
		.order('due_on', { ascending: true })
		.limit(8);
	assertQuery(error, 'No se pudieron cargar las tareas pendientes');
	return (data ?? []).flatMap((task) =>
		task.due_on
			? [
					{
						id: task.id,
						title: task.title,
						dueOn: task.due_on,
						priority: task.priority,
						isOverdue: task.due_on < today
					}
				]
			: []
	);
}

async function loadActiveLists(
	supabase: SupabaseClient<Database>,
	familyId: string,
	enabled: boolean
): Promise<PlannerList[]> {
	if (!enabled) return [];
	const { data, error } = await supabase
		.from('family_lists')
		.select('id, title, updated_at, family_list_items(id, completed_at)')
		.eq('family_id', familyId)
		.is('archived_at', null)
		.order('updated_at', { ascending: false })
		.limit(5);
	assertQuery(error, 'No se pudieron cargar las listas activas');
	return (data ?? []).map((list) => ({
		id: list.id,
		title: list.title,
		completedItems: list.family_list_items.filter((item) => Boolean(item.completed_at)).length,
		totalItems: list.family_list_items.length,
		updatedAt: list.updated_at
	}));
}

async function loadExpenseTotals(
	supabase: SupabaseClient<Database>,
	familyId: string,
	userId: string,
	monthFrom: string,
	monthTo: string,
	enabled: boolean
): Promise<PlannerExpenseTotal[]> {
	if (!enabled) return [];
	const { data: memberships, error: membershipError } = await supabase
		.from('expense_collection_members')
		.select('collection:expense_collections!inner(id, family_id, currency, archived_at)')
		.eq('user_id', userId)
		.eq('status', 'active')
		.eq('expense_collections.family_id', familyId)
		.is('expense_collections.archived_at', null);
	assertQuery(membershipError, 'No se pudieron cargar las colecciones accesibles');

	const collections = (memberships ?? []).flatMap((row) =>
		row.collection ? [row.collection] : []
	);
	if (collections.length === 0) return [];
	const collectionIds = collections.map((collection) => collection.id);
	const { data: expenses, error: expenseError } = await supabase
		.from('expenses')
		.select('amount, collection_id')
		.in('collection_id', collectionIds)
		.gte('occurred_on', monthFrom)
		.lte('occurred_on', monthTo);
	assertQuery(expenseError, 'No se pudo calcular el resumen mensual');

	const collectionsById = new Map(collections.map((collection) => [collection.id, collection]));
	const totals = new Map<string, { total: number; collectionIds: Set<string> }>();
	for (const collection of collections) {
		const current = totals.get(collection.currency) ?? { total: 0, collectionIds: new Set() };
		current.collectionIds.add(collection.id);
		totals.set(collection.currency, current);
	}
	for (const expense of expenses ?? []) {
		const currency = collectionsById.get(expense.collection_id)?.currency;
		if (!currency) continue;
		const current = totals.get(currency) ?? { total: 0, collectionIds: new Set<string>() };
		current.total += Number(expense.amount);
		current.collectionIds.add(expense.collection_id);
		totals.set(currency, current);
	}
	return [...totals.entries()]
		.map(([currency, summary]) => ({
			currency,
			total: summary.total,
			collectionCount: summary.collectionIds.size
		}))
		.sort((left, right) => left.currency.localeCompare(right.currency));
}

export async function loadPlannerSnapshot(
	supabase: SupabaseClient<Database>,
	familyId: string,
	userId: string,
	now = new Date()
): Promise<PlannerSnapshot> {
	const modules = await loadModuleState(supabase, familyId);
	const fromDate = now;
	const toDate = addUtcDays(now, 14);
	const today = isoDate(now);
	const until = isoDate(toDate);
	const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
	const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
	const window = {
		from: fromDate.toISOString(),
		to: toDate.toISOString(),
		monthFrom: isoDate(monthStart),
		monthTo: isoDate(monthEnd)
	};
	const [events, tasks, lists, expenses] = await Promise.all([
		loadUpcomingEvents(supabase, familyId, window.from, window.to, modules.calendar),
		loadUpcomingTasks(supabase, familyId, today, until, modules.tasks),
		loadActiveLists(supabase, familyId, modules.lists),
		loadExpenseTotals(
			supabase,
			familyId,
			userId,
			window.monthFrom,
			window.monthTo,
			modules.expenses
		)
	]);
	return { modules, window, events, tasks, lists, expenses };
}
