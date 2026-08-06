import { Buffer } from 'node:buffer';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '$lib/types/database';
import type { ExpenseCollectionRole } from './schemas';
import { signExpenseReceiptUrls } from './receipts';

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
}

export interface ExpensePageData {
	collection: ExpenseCollectionSummary;
	members: ExpenseMember[];
	categories: Tables<'expense_categories'>[];
	expenses: ExpenseRecord[];
	nextCursor: string | null;
	canCreate: boolean;
	canManage: boolean;
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
	collectionId: string
): Promise<ExpenseCollectionSummary | null> {
	const { data, error } = await supabase
		.from('expense_collection_members')
		.select(
			'role, status, collection:expense_collections(id, family_id, name, description, currency, archived_at)'
		)
		.eq('collection_id', collectionId)
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
	cursorValue?: string | null,
	pageSize = 25
): Promise<ExpensePageData> {
	const cursor = decodeExpenseCursor(cursorValue);
	let expenseQuery = supabase
		.from('expenses')
		.select('*')
		.eq('collection_id', collection.id)
		.order('occurred_on', { ascending: false })
		.order('id', { ascending: false })
		.limit(pageSize + 1);
	if (cursor)
		expenseQuery = expenseQuery.or(
			`occurred_on.lt.${cursor.occurredOn},and(occurred_on.eq.${cursor.occurredOn},id.lt.${cursor.id})`
		);

	const [members, categoriesResult, expensesResult] = await Promise.all([
		loadMembers(supabase, collection.id),
		supabase
			.from('expense_categories')
			.select('*')
			.eq('collection_id', collection.id)
			.order('name'),
		expenseQuery
	]);
	assertQuery(categoriesResult.error, 'No se pudieron cargar las categorías');
	assertQuery(expensesResult.error, 'No se pudieron cargar los gastos');
	const categories = categoriesResult.data ?? [];
	const rows = expensesResult.data ?? [];
	const hasMore = rows.length > pageSize;
	const pageRows = rows.slice(0, pageSize);
	const profiles = await loadProfiles(
		supabase,
		pageRows.flatMap((expense) => [expense.created_by, expense.paid_by])
	);
	const categoriesById = new Map(categories.map((category) => [category.id, category]));
	const receiptUrls = await signExpenseReceiptUrls(
		supabase,
		pageRows.flatMap((expense) => (expense.receipt_path ? [expense.receipt_path] : []))
	);
	const expenses: ExpenseRecord[] = pageRows.map((expense) => ({
		...expense,
		category: expense.category_id ? (categoriesById.get(expense.category_id) ?? null) : null,
		creator: profiles.get(expense.created_by) ?? profileFallback(expense.created_by),
		payer: profiles.get(expense.paid_by) ?? profileFallback(expense.paid_by),
		receiptUrl: expense.receipt_path ? (receiptUrls.get(expense.receipt_path) ?? null) : null
	}));
	const last = hasMore ? pageRows.at(-1) : null;
	return {
		collection,
		members,
		categories,
		expenses,
		nextCursor: last ? encodeExpenseCursor(last.occurred_on, last.id) : null,
		canCreate: collection.role !== 'viewer' && !collection.archivedAt,
		canManage: collection.role === 'owner' || collection.role === 'manager'
	};
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
