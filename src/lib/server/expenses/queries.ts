import { Buffer } from 'node:buffer';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json, Tables } from '$lib/types/database';
import type { ExpenseFilterState } from './filters';
import type { ExpenseCollectionRole } from './schemas';
import { signExpenseReceiptUrls } from './receipts';
import { suggestSettlements } from '$lib/expenses/settlements';

export class ExpenseQueryError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ExpenseQueryError';
	}
}

export interface ExpenseProfile {
	id: string;
	displayName: string;
	avatarUrl: string | null;
}

export interface ExpenseCollectionSummary {
	id: string;
	familyId: string;
	name: string;
	description: string | null;
	currency: string;
	archivedAt: string | null;
	role: ExpenseCollectionRole;
}

export interface ExpenseInvitation {
	collectionId: string;
	familyId: string;
	collectionName: string;
	description: string | null;
	currency: string;
	role: Exclude<ExpenseCollectionRole, 'owner'>;
	invitedBy: string | null;
}

export interface ExpenseMember {
	userId: string;
	role: ExpenseCollectionRole;
	status: 'invited' | 'active' | 'revoked' | 'left';
	joinedAt: string | null;
	profile: ExpenseProfile;
}

export interface ExpenseRecord extends Tables<'expenses'> {
	category: Tables<'expense_categories'> | null;
	creator: ExpenseProfile;
	payer: ExpenseProfile;
	receiptUrl: string | null;
	splits: ExpenseSplit[];
}

export interface ExpenseSplit {
	userId: string;
	amount: number;
}

export interface RecurringExpenseRule extends Tables<'recurring_expense_rules'> {
	category: Tables<'expense_categories'> | null;
	payer: ExpenseProfile;
	splits: ExpenseSplit[];
	canMutate: boolean;
}

export interface ExpenseBalance {
	userId: string;
	label: string;
	paid: number;
	owed: number;
	balance: number;
}

export interface ExpensePageData {
	collection: ExpenseCollectionSummary;
	members: ExpenseMember[];
	categories: Tables<'expense_categories'>[];
	expenses: ExpenseRecord[];
	nextCursor: string | null;
	canCreate: boolean;
	canManage: boolean;
	filters: ExpenseFilterState;
	dashboard: ExpenseDashboard;
	balances: ExpenseBalance[];
	settlementWarning: string | null;
	settlementSuggestions: {
		fromUserId: string;
		toUserId: string;
		amountCents: number;
		fromLabel: string;
		toLabel: string;
		idempotencyKey: string;
		canRecord: boolean;
	}[];
	settlements: {
		id: string;
		fromLabel: string;
		toLabel: string;
		amountCents: number;
		createdAt: string;
	}[];
	recurringRules: RecurringExpenseRule[];
}

export interface ExpenseDashboardBreakdown {
	id: string | null;
	label: string;
	color: string | null;
	total: number;
}

export async function loadExpenseSettlementBalances(
	supabase: SupabaseClient<Database>,
	collectionId: string
) {
	const result = await supabase.rpc('get_expense_settlement_balances', {
		p_collection_id: collectionId
	});
	if (result.error?.code === '22023' && result.error.message === 'Expense splits are incomplete') {
		return {
			balances: [],
			warning:
				'Hay gastos con repartos incompletos. Completa sus repartos antes de registrar reembolsos.'
		};
	}
	assertQuery(result.error, 'No se pudieron cargar los saldos globales');
	return { balances: result.data ?? [], warning: null };
}

export interface ExpenseSeriesPoint {
	period: string;
	total: number;
}

export interface ExpenseDashboard {
	currentTotal: number;
	previousTotal: number;
	changePercent: number | null;
	byCategory: ExpenseDashboardBreakdown[];
	byPayer: ExpenseDashboardBreakdown[];
	series: ExpenseSeriesPoint[];
}

export interface ExpenseExportRow {
	occurredOn: string;
	description: string;
	amount: number;
	currency: string;
	category: string;
	payer: string;
	notes: string;
	hasReceipt: boolean;
}

function assertQuery(error: { message: string } | null, message: string): void {
	if (error) throw new ExpenseQueryError(`${message}: ${error.message}`);
}

function profileFallback(id: string): ExpenseProfile {
	return { id, displayName: 'Usuario', avatarUrl: null };
}

async function loadProfiles(
	supabase: SupabaseClient<Database>,
	ids: string[]
): Promise<Map<string, ExpenseProfile>> {
	const uniqueIds = [...new Set(ids.filter(Boolean))];
	if (uniqueIds.length === 0) return new Map();
	const { data, error } = await supabase
		.from('public_profiles')
		.select('id, display_name, avatar_url')
		.in('id', uniqueIds);
	assertQuery(error, 'No se pudieron cargar los perfiles');
	return new Map(
		(data ?? [])
			.filter((profile): profile is typeof profile & { id: string } => Boolean(profile.id))
			.map((profile) => [
				profile.id,
				{
					id: profile.id,
					displayName: profile.display_name?.trim() || 'Usuario',
					avatarUrl: profile.avatar_url
				}
			])
	);
}

export function encodeExpenseCursor(occurredOn: string, id: string): string {
	return Buffer.from(JSON.stringify([occurredOn, id]), 'utf8').toString('base64url');
}

export function decodeExpenseCursor(cursor: string | null | undefined): {
	occurredOn: string;
	id: string;
} | null {
	if (!cursor) return null;
	try {
		const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown;
		if (
			!Array.isArray(value) ||
			value.length !== 2 ||
			typeof value[0] !== 'string' ||
			typeof value[1] !== 'string' ||
			!/^\d{4}-\d{2}-\d{2}$/.test(value[0]) ||
			!/^[0-9a-f-]{36}$/i.test(value[1])
		)
			return null;
		return { occurredOn: value[0], id: value[1] };
	} catch {
		return null;
	}
}

export async function loadExpenseCollections(
	supabase: SupabaseClient<Database>,
	familyId: string
): Promise<{ collections: ExpenseCollectionSummary[]; invitations: ExpenseInvitation[] }> {
	const [membershipsResult, invitationsResult] = await Promise.all([
		supabase
			.from('expense_collection_members')
			.select(
				'role, status, collection:expense_collections(id, family_id, name, description, currency, archived_at)'
			)
			.eq('status', 'active'),
		supabase.rpc('get_expense_collection_invitations')
	]);
	assertQuery(membershipsResult.error, 'No se pudieron cargar las colecciones');
	assertQuery(invitationsResult.error, 'No se pudieron cargar las invitaciones');

	const collections = (membershipsResult.data ?? [])
		.filter((row): row is typeof row & { collection: NonNullable<typeof row.collection> } =>
			Boolean(row.collection && row.collection.family_id === familyId)
		)
		.map((row) => ({
			id: row.collection.id,
			familyId: row.collection.family_id,
			name: row.collection.name,
			description: row.collection.description,
			currency: row.collection.currency,
			archivedAt: row.collection.archived_at,
			role: row.role as ExpenseCollectionRole
		}))
		.sort((left, right) => left.name.localeCompare(right.name, 'es'));

	const invitations = (invitationsResult.data ?? [])
		.filter((row) => row.family_id === familyId)
		.map((row) => ({
			collectionId: row.collection_id,
			familyId: row.family_id,
			collectionName: row.collection_name,
			description: row.description,
			currency: row.currency,
			role: row.role as ExpenseInvitation['role'],
			invitedBy: row.invited_by
		}));

	return { collections, invitations };
}

export async function loadExpenseCollectionShell(
	supabase: SupabaseClient<Database>,
	familyId: string,
	collectionId: string,
	userId: string
): Promise<ExpenseCollectionSummary | null> {
	const { data, error } = await supabase
		.from('expense_collection_members')
		.select(
			'role, status, collection:expense_collections(id, family_id, name, description, currency, archived_at)'
		)
		.eq('collection_id', collectionId)
		.eq('user_id', userId)
		.eq('status', 'active')
		.maybeSingle();
	assertQuery(error, 'No se pudo cargar la colección');
	if (!data?.collection || data.collection.family_id !== familyId) return null;
	return {
		id: data.collection.id,
		familyId: data.collection.family_id,
		name: data.collection.name,
		description: data.collection.description,
		currency: data.collection.currency,
		archivedAt: data.collection.archived_at,
		role: data.role as ExpenseCollectionRole
	};
}

async function loadMembers(
	supabase: SupabaseClient<Database>,
	collectionId: string
): Promise<ExpenseMember[]> {
	const { data, error } = await supabase
		.from('expense_collection_members')
		.select('user_id, role, status, joined_at')
		.eq('collection_id', collectionId)
		.order('joined_at', { ascending: true, nullsFirst: false });
	assertQuery(error, 'No se pudieron cargar los participantes');
	const profiles = await loadProfiles(
		supabase,
		(data ?? []).map((member) => member.user_id)
	);
	return (data ?? []).map((member) => ({
		userId: member.user_id,
		role: member.role as ExpenseCollectionRole,
		status: member.status as ExpenseMember['status'],
		joinedAt: member.joined_at,
		profile: profiles.get(member.user_id) ?? profileFallback(member.user_id)
	}));
}

export async function loadExpenseCollectionPage(
	supabase: SupabaseClient<Database>,
	collection: ExpenseCollectionSummary,
	userId: string,
	filters: ExpenseFilterState,
	cursorValue?: string | null,
	pageSize = 25
): Promise<ExpensePageData> {
	const cursor = decodeExpenseCursor(cursorValue);
	let expenseQuery = supabase
		.from('expenses')
		.select('*')
		.eq('collection_id', collection.id)
		.gte('occurred_on', filters.from)
		.lte('occurred_on', filters.to)
		.order('occurred_on', { ascending: false })
		.order('id', { ascending: false })
		.limit(pageSize + 1);
	if (cursor)
		expenseQuery = expenseQuery.or(
			`occurred_on.lt.${cursor.occurredOn},and(occurred_on.eq.${cursor.occurredOn},id.lt.${cursor.id})`
		);
	if (filters.paidBy) expenseQuery = expenseQuery.eq('paid_by', filters.paidBy);
	if (filters.categoryId) expenseQuery = expenseQuery.eq('category_id', filters.categoryId);

	const [
		members,
		categoriesResult,
		expensesResult,
		dashboardResult,
		balancesResult,
		recurringRulesResult,
		recurringSplitsResult,
		settlementBalancesResult,
		settlementsResult
	] = await Promise.all([
		loadMembers(supabase, collection.id),
		supabase
			.from('expense_categories')
			.select('*')
			.eq('collection_id', collection.id)
			.order('name'),
		expenseQuery,
		supabase.rpc('get_expense_dashboard', {
			p_collection_id: collection.id,
			p_from: filters.from,
			p_to: filters.to,
			p_previous_from: filters.previousFrom,
			p_previous_to: filters.previousTo,
			p_paid_by: filters.paidBy ?? undefined,
			p_category_id: filters.categoryId ?? undefined,
			p_granularity: filters.granularity
		}),
		supabase.rpc('get_expense_balances', {
			p_collection_id: collection.id,
			p_from: filters.from,
			p_to: filters.to
		}),
		supabase
			.from('recurring_expense_rules')
			.select('*')
			.eq('collection_id', collection.id)
			.order('active', { ascending: false })
			.order('next_run'),
		supabase
			.from('recurring_expense_splits')
			.select('rule_id, user_id, amount')
			.eq('collection_id', collection.id),
		loadExpenseSettlementBalances(supabase, collection.id),
		supabase
			.from('expense_settlements')
			.select('*')
			.eq('collection_id', collection.id)
			.order('created_at', { ascending: false })
			.order('id', { ascending: false })
			.limit(20)
	]);
	assertQuery(categoriesResult.error, 'No se pudieron cargar las categorías');
	assertQuery(expensesResult.error, 'No se pudieron cargar los gastos');
	assertQuery(dashboardResult.error, 'No se pudo calcular el resumen');
	assertQuery(balancesResult.error, 'No se pudieron calcular los balances');
	assertQuery(recurringRulesResult.error, 'No se pudieron cargar los gastos recurrentes');
	assertQuery(recurringSplitsResult.error, 'No se pudieron cargar los repartos recurrentes');
	assertQuery(settlementsResult.error, 'No se pudieron cargar los reembolsos registrados');
	const categories = categoriesResult.data ?? [];
	const rows = expensesResult.data ?? [];
	const hasMore = rows.length > pageSize;
	const pageRows = rows.slice(0, pageSize);
	const profiles = await loadProfiles(
		supabase,
		pageRows.flatMap((expense) => [expense.created_by, expense.paid_by])
	);
	const categoriesById = new Map(categories.map((category) => [category.id, category]));
	const expenseSplitsResult =
		pageRows.length === 0
			? { data: [], error: null }
			: await supabase
					.from('expense_splits')
					.select('expense_id, user_id, amount')
					.in(
						'expense_id',
						pageRows.map((expense) => expense.id)
					);
	assertQuery(expenseSplitsResult.error, 'No se pudieron cargar los repartos');
	const splitsByExpense = new Map<string, ExpenseSplit[]>();
	for (const split of expenseSplitsResult.data ?? []) {
		const current = splitsByExpense.get(split.expense_id) ?? [];
		current.push({ userId: split.user_id, amount: Number(split.amount) });
		splitsByExpense.set(split.expense_id, current);
	}
	const receiptUrls = await signExpenseReceiptUrls(
		supabase,
		pageRows.flatMap((expense) => (expense.receipt_path ? [expense.receipt_path] : []))
	);
	const expenses: ExpenseRecord[] = pageRows.map((expense) => ({
		...expense,
		category: expense.category_id ? (categoriesById.get(expense.category_id) ?? null) : null,
		creator: profiles.get(expense.created_by) ?? profileFallback(expense.created_by),
		payer: profiles.get(expense.paid_by) ?? profileFallback(expense.paid_by),
		receiptUrl: expense.receipt_path ? (receiptUrls.get(expense.receipt_path) ?? null) : null,
		splits: splitsByExpense.get(expense.id) ?? []
	}));
	const last = hasMore ? pageRows.at(-1) : null;
	const dashboard = presentExpenseDashboard(dashboardResult.data, categories, members);
	const memberMap = new Map(members.map((member) => [member.userId, member]));
	const recurringSplits = new Map<string, ExpenseSplit[]>();
	for (const split of recurringSplitsResult.data ?? []) {
		const current = recurringSplits.get(split.rule_id) ?? [];
		current.push({ userId: split.user_id, amount: Number(split.amount) });
		recurringSplits.set(split.rule_id, current);
	}
	const recurringRules: RecurringExpenseRule[] = (recurringRulesResult.data ?? []).map((rule) => ({
		...rule,
		category: rule.category_id ? (categoriesById.get(rule.category_id) ?? null) : null,
		payer: memberMap.get(rule.paid_by)?.profile ?? profileFallback(rule.paid_by),
		splits: recurringSplits.get(rule.id) ?? [],
		canMutate:
			collection.role === 'owner' ||
			collection.role === 'manager' ||
			(collection.role === 'contributor' && rule.created_by === userId)
	}));
	const balances: ExpenseBalance[] = (balancesResult.data ?? []).map((balance) => ({
		userId: balance.user_id,
		label: memberMap.get(balance.user_id)?.profile.displayName ?? 'Participante',
		paid: Number(balance.paid),
		owed: Number(balance.owed),
		balance: Number(balance.balance)
	}));
	const memberLabel = (id: string) =>
		memberMap.get(id)?.profile.displayName ?? 'Participante anterior';
	const settlementSuggestions = suggestSettlements(
		settlementBalancesResult.balances.map((row) => ({
			userId: row.user_id,
			balanceCents: Number(row.balance_cents)
		}))
	).map((suggestion) => ({
		...suggestion,
		fromLabel: memberLabel(suggestion.fromUserId),
		toLabel: memberLabel(suggestion.toUserId),
		idempotencyKey: crypto.randomUUID(),
		canRecord:
			!collection.archivedAt &&
			(collection.role === 'owner' ||
				collection.role === 'manager' ||
				(collection.role === 'contributor' && suggestion.fromUserId === userId))
	}));
	const settlements = (settlementsResult.data ?? []).map((row) => ({
		id: row.id,
		fromLabel: memberLabel(row.from_user_id),
		toLabel: memberLabel(row.to_user_id),
		amountCents: Number(row.amount_cents),
		createdAt: row.created_at
	}));
	return {
		collection,
		members,
		categories,
		expenses,
		nextCursor: last ? encodeExpenseCursor(last.occurred_on, last.id) : null,
		canCreate: collection.role !== 'viewer' && !collection.archivedAt,
		canManage: collection.role === 'owner' || collection.role === 'manager',
		filters,
		dashboard,
		balances,
		settlementSuggestions,
		settlementWarning: settlementBalancesResult.warning,
		settlements,
		recurringRules
	};
}

function jsonRecord(value: Json | undefined): Record<string, Json | undefined> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, Json | undefined>)
		: {};
}

function jsonArray(value: Json | undefined): Json[] {
	return Array.isArray(value) ? value : [];
}

function presentExpenseDashboard(
	value: Json | undefined,
	categories: Tables<'expense_categories'>[],
	members: ExpenseMember[]
): ExpenseDashboard {
	const root = jsonRecord(value);
	const currentTotal = Number(root.current_total ?? 0);
	const previousTotal = Number(root.previous_total ?? 0);
	const categoryMap = new Map(categories.map((category) => [category.id, category]));
	const memberMap = new Map(members.map((member) => [member.userId, member]));
	const byCategory = jsonArray(root.by_category).map((item) => {
		const record = jsonRecord(item);
		const id = typeof record.category_id === 'string' ? record.category_id : null;
		const category = id ? categoryMap.get(id) : null;
		return {
			id,
			label: category?.name ?? 'Sin categoría',
			color: category?.color ?? null,
			total: Number(record.total ?? 0)
		};
	});
	const byPayer = jsonArray(root.by_payer).map((item) => {
		const record = jsonRecord(item);
		const id = typeof record.paid_by === 'string' ? record.paid_by : null;
		return {
			id,
			label: (id ? memberMap.get(id)?.profile.displayName : null) ?? 'Participante',
			color: null,
			total: Number(record.total ?? 0)
		};
	});
	const series = jsonArray(root.series).flatMap((item) => {
		const record = jsonRecord(item);
		return typeof record.period === 'string'
			? [{ period: record.period, total: Number(record.total ?? 0) }]
			: [];
	});
	return {
		currentTotal,
		previousTotal,
		changePercent:
			previousTotal === 0 ? null : ((currentTotal - previousTotal) / previousTotal) * 100,
		byCategory,
		byPayer,
		series
	};
}

export async function loadExpenseExportRows(
	supabase: SupabaseClient<Database>,
	collection: ExpenseCollectionSummary,
	filters: ExpenseFilterState
): Promise<ExpenseExportRow[]> {
	const pageSize = 1_000;
	const maximumRows = 50_000;
	const rows: Tables<'expenses'>[] = [];
	for (let offset = 0; offset < maximumRows; offset += pageSize) {
		let query = supabase
			.from('expenses')
			.select('*')
			.eq('collection_id', collection.id)
			.gte('occurred_on', filters.from)
			.lte('occurred_on', filters.to)
			.order('occurred_on', { ascending: false })
			.order('id', { ascending: false })
			.range(offset, offset + pageSize - 1);
		if (filters.paidBy) query = query.eq('paid_by', filters.paidBy);
		if (filters.categoryId) query = query.eq('category_id', filters.categoryId);
		const { data, error } = await query;
		assertQuery(error, 'No se pudieron exportar los gastos');
		rows.push(...(data ?? []));
		if ((data?.length ?? 0) < pageSize) break;
	}
	const [profiles, categoriesResult] = await Promise.all([
		loadProfiles(
			supabase,
			rows.map((row) => row.paid_by)
		),
		supabase.from('expense_categories').select('id, name').eq('collection_id', collection.id)
	]);
	assertQuery(categoriesResult.error, 'No se pudieron cargar las categorías para la exportación');
	const categories = new Map(
		(categoriesResult.data ?? []).map((category) => [category.id, category.name])
	);
	return rows.map((row) => ({
		occurredOn: row.occurred_on,
		description: row.description,
		amount: Number(row.amount),
		currency: collection.currency,
		category: row.category_id
			? (categories.get(row.category_id) ?? 'Sin categoría')
			: 'Sin categoría',
		payer: profiles.get(row.paid_by)?.displayName ?? 'Participante',
		notes: row.notes ?? '',
		hasReceipt: Boolean(row.receipt_path)
	}));
}

export async function loadExpenseSettings(
	supabase: SupabaseClient<Database>,
	collection: ExpenseCollectionSummary
): Promise<{
	collection: ExpenseCollectionSummary;
	members: ExpenseMember[];
	categories: Tables<'expense_categories'>[];
	familyCandidates: ExpenseProfile[];
}> {
	const [members, categoriesResult, familyMembersResult] = await Promise.all([
		loadMembers(supabase, collection.id),
		supabase
			.from('expense_categories')
			.select('*')
			.eq('collection_id', collection.id)
			.order('name'),
		supabase.from('family_members').select('user_id').eq('family_id', collection.familyId)
	]);
	assertQuery(categoriesResult.error, 'No se pudieron cargar las categorías');
	assertQuery(familyMembersResult.error, 'No se pudieron cargar los miembros familiares');
	const profiles = await loadProfiles(
		supabase,
		(familyMembersResult.data ?? []).flatMap((member) => (member.user_id ? [member.user_id] : []))
	);
	const currentIds = new Set(
		members
			.filter((member) => member.status === 'active' || member.status === 'invited')
			.map((m) => m.userId)
	);
	return {
		collection,
		members,
		categories: categoriesResult.data ?? [],
		familyCandidates: [...profiles.values()].filter((profile) => !currentIds.has(profile.id))
	};
}
