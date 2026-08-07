import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '$lib/types/database';
import type { ListVisibility } from './schemas';

export class ListQueryError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ListQueryError';
	}
}

export interface ListMember {
	id: string;
	displayName: string;
	avatarUrl: string | null;
}

export interface FamilyListRecord extends Omit<Tables<'family_lists'>, 'visibility'> {
	visibility: ListVisibility;
	memberIds: string[];
	canEdit: boolean;
	creatorName: string;
	itemCount: number;
	completedCount: number;
}

export interface FamilyListItemRecord extends Tables<'family_list_items'> {
	completedByName: string | null;
}

export interface ListPageData {
	members: ListMember[];
	lists: FamilyListRecord[];
	selectedListId: string | null;
	selectedList: FamilyListRecord | null;
	items: FamilyListItemRecord[];
}

function assertQuery(error: { message: string } | null, message: string): void {
	if (error) throw new ListQueryError(`${message}: ${error.message}`);
}

export async function loadListFormContext(
	supabase: SupabaseClient<Database>,
	familyId: string
): Promise<Set<string>> {
	const { data, error } = await supabase
		.from('family_members')
		.select('user_id')
		.eq('family_id', familyId);
	assertQuery(error, 'No se pudieron validar los miembros');
	return new Set(
		(data ?? []).map((member) => member.user_id).filter((id): id is string => Boolean(id))
	);
}

export async function loadListPage(
	supabase: SupabaseClient<Database>,
	familyId: string,
	userId: string,
	requestedListId: string | null
): Promise<ListPageData> {
	const [membersResult, listsResult] = await Promise.all([
		supabase.from('family_members').select('user_id').eq('family_id', familyId).order('joined_at'),
		supabase
			.from('family_lists')
			.select('*')
			.eq('family_id', familyId)
			.is('archived_at', null)
			.order('updated_at', { ascending: false })
	]);
	assertQuery(membersResult.error, 'No se pudieron cargar los miembros');
	assertQuery(listsResult.error, 'No se pudieron cargar las listas');

	const profileIds = (membersResult.data ?? [])
		.map((member) => member.user_id)
		.filter((id): id is string => Boolean(id));
	const { data: profiles, error: profilesError } = profileIds.length
		? await supabase
				.from('public_profiles')
				.select('id, display_name, avatar_url')
				.in('id', profileIds)
		: { data: [], error: null };
	assertQuery(profilesError, 'No se pudieron cargar los perfiles');
	const profileMap = new Map(
		(profiles ?? []).map((profile) => [
			profile.id,
			{
				displayName: profile.display_name?.trim() || 'Usuario',
				avatarUrl: profile.avatar_url
			}
		])
	);
	const members: ListMember[] = profileIds.map((id) => ({
		id,
		displayName: profileMap.get(id)?.displayName ?? 'Usuario',
		avatarUrl: profileMap.get(id)?.avatarUrl ?? null
	}));

	const listRows = listsResult.data ?? [];
	const listIds = listRows.map((list) => list.id);
	const [listMembersResult, allItemsResult] = listIds.length
		? await Promise.all([
				supabase
					.from('family_list_members')
					.select('list_id, user_id, role')
					.in('list_id', listIds),
				supabase
					.from('family_list_items')
					.select('id, list_id, completed_at')
					.in('list_id', listIds)
			])
		: [
				{ data: [], error: null },
				{ data: [], error: null }
			];
	assertQuery(listMembersResult.error, 'No se pudieron cargar los permisos de las listas');
	assertQuery(allItemsResult.error, 'No se pudieron cargar los contadores de las listas');

	const membersByList = new Map<string, { id: string; role: string }[]>();
	for (const member of listMembersResult.data ?? []) {
		const listMembers = membersByList.get(member.list_id) ?? [];
		listMembers.push({ id: member.user_id, role: member.role });
		membersByList.set(member.list_id, listMembers);
	}
	const countsByList = new Map<string, { total: number; completed: number }>();
	for (const item of allItemsResult.data ?? []) {
		const counts = countsByList.get(item.list_id) ?? { total: 0, completed: 0 };
		counts.total += 1;
		if (item.completed_at) counts.completed += 1;
		countsByList.set(item.list_id, counts);
	}

	const lists: FamilyListRecord[] = listRows.map((list) => {
		const listMembers = membersByList.get(list.id) ?? [];
		const userMembership = listMembers.find((member) => member.id === userId);
		const counts = countsByList.get(list.id) ?? { total: 0, completed: 0 };
		return {
			...list,
			visibility: list.visibility as ListVisibility,
			memberIds: listMembers.map((member) => member.id),
			canEdit:
				list.visibility === 'family' ||
				list.created_by === userId ||
				userMembership?.role === 'owner' ||
				userMembership?.role === 'editor',
			creatorName: profileMap.get(list.created_by)?.displayName ?? 'Usuario',
			itemCount: counts.total,
			completedCount: counts.completed
		};
	});

	const selectedListId = lists.some((list) => list.id === requestedListId)
		? requestedListId
		: (lists[0]?.id ?? null);
	const selectedList = lists.find((list) => list.id === selectedListId) ?? null;
	const { data: itemRows, error: itemsError } = selectedListId
		? await supabase
				.from('family_list_items')
				.select('*')
				.eq('list_id', selectedListId)
				.order('completed_at', { ascending: true, nullsFirst: true })
				.order('sort_order')
		: { data: [], error: null };
	assertQuery(itemsError, 'No se pudieron cargar los artículos');
	const items: FamilyListItemRecord[] = (itemRows ?? []).map((item) => ({
		...item,
		completedByName: item.completed_by
			? (profileMap.get(item.completed_by)?.displayName ?? 'Usuario')
			: null
	}));

	return { members, lists, selectedListId, selectedList, items };
}
