import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '$lib/types/database';
import type {
	WishlistCommentDto,
	WishlistEventCategoryDto,
	WishlistItemDto,
	WishlistMemberDto,
	WishlistProfileDto,
	WishlistPurchaseDto,
	WishlistQueryData,
	WishlistReservationDto
} from './presenters';

export class WishlistQueryError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'WishlistQueryError';
	}
}

function assertQuery(error: { message: string } | null, message: string): void {
	if (error) throw new WishlistQueryError(`${message}: ${error.message}`);
}

function profileFor(
	profileId: string,
	profiles: ReadonlyMap<string, WishlistProfileDto>
): WishlistProfileDto {
	return (
		profiles.get(profileId) ?? {
			id: profileId,
			display_name: 'Usuario',
			avatar_url: null
		}
	);
}

async function loadProfiles(
	supabase: SupabaseClient<Database>,
	userIds: string[]
): Promise<Map<string, WishlistProfileDto>> {
	if (userIds.length === 0) return new Map();
	const { data, error } = await supabase
		.from('public_profiles')
		.select('id, display_name, avatar_url')
		.in('id', [...new Set(userIds)]);
	assertQuery(error, 'No se pudieron cargar los perfiles familiares');

	return new Map(
		(data ?? [])
			.filter(
				(
					profile
				): profile is { id: string; display_name: string | null; avatar_url: string | null } =>
					Boolean(profile.id)
			)
			.map((profile) => [
				profile.id,
				{
					id: profile.id,
					display_name: profile.display_name?.trim() || 'Usuario',
					avatar_url: profile.avatar_url
				}
			])
	);
}

async function loadItemEvents(
	supabase: SupabaseClient<Database>,
	itemIds: string[]
): Promise<Tables<'gift_item_events'>[]> {
	if (itemIds.length === 0) return [];
	const { data, error } = await supabase
		.from('gift_item_events')
		.select('id, item_id, event_category_id, created_at')
		.in('item_id', itemIds);
	assertQuery(error, 'No se pudieron cargar las categorías de los regalos');
	return data ?? [];
}

async function loadReservations(
	supabase: SupabaseClient<Database>,
	itemIds: string[]
): Promise<Tables<'gift_reservations'>[]> {
	if (itemIds.length === 0) return [];
	const { data, error } = await supabase
		.from('gift_reservations')
		.select('id, item_id, reserved_by, reserved_at, notes, quantity, status')
		.in('item_id', itemIds);
	assertQuery(error, 'No se pudieron cargar las reservas');
	return data ?? [];
}

async function loadPurchases(
	supabase: SupabaseClient<Database>,
	itemIds: string[]
): Promise<WishlistPurchaseDto[]> {
	if (itemIds.length === 0) return [];
	const { data, error } = await supabase
		.from('gift_purchases')
		.select('id, item_id, purchased_by, purchased_at, notes, quantity_purchased')
		.in('item_id', itemIds);
	assertQuery(error, 'No se pudieron cargar las compras');
	return data ?? [];
}

async function loadComments(
	supabase: SupabaseClient<Database>,
	itemIds: string[]
): Promise<Tables<'gift_item_comments'>[]> {
	if (itemIds.length === 0) return [];
	const { data, error } = await supabase
		.from('gift_item_comments')
		.select('id, item_id, author_id, content, created_at, updated_at')
		.in('item_id', itemIds)
		.order('created_at', { ascending: true });
	assertQuery(error, 'No se pudieron cargar los comentarios');
	return data ?? [];
}

function normalizeItemStatus(status: string): WishlistItemDto['status'] {
	return status === 'fulfilled' || status === 'archived' ? status : 'active';
}

export async function loadWishlistQueryData(
	supabase: SupabaseClient<Database>,
	familyId: string
): Promise<WishlistQueryData> {
	const [membersResult, categoriesResult, itemsResult] = await Promise.all([
		supabase
			.from('family_members')
			.select('user_id, role')
			.eq('family_id', familyId)
			.order('joined_at', { ascending: true }),
		supabase.from('gift_event_categories').select('*').eq('family_id', familyId).order('name'),
		supabase
			.from('gift_items')
			.select('*')
			.eq('family_id', familyId)
			.order('created_at', { ascending: false })
	]);

	assertQuery(membersResult.error, 'No se pudieron cargar los miembros');
	assertQuery(categoriesResult.error, 'No se pudieron cargar las categorías');
	assertQuery(itemsResult.error, 'No se pudieron cargar los regalos');

	const membershipRows = (membersResult.data ?? []).filter(
		(member): member is typeof member & { user_id: string } => Boolean(member.user_id)
	);
	const itemRows = itemsResult.data ?? [];
	const eventCategories: WishlistEventCategoryDto[] = categoriesResult.data ?? [];
	const itemIds = itemRows.map((item) => item.id);

	const [itemEvents, reservationRows, purchases, commentRows] = await Promise.all([
		loadItemEvents(supabase, itemIds),
		loadReservations(supabase, itemIds),
		loadPurchases(supabase, itemIds),
		loadComments(supabase, itemIds)
	]);

	const profileIds = [
		...membershipRows.map((member) => member.user_id),
		...itemRows.map((item) => item.owner_id),
		...reservationRows.map((reservation) => reservation.reserved_by),
		...commentRows.map((comment) => comment.author_id)
	];
	const profiles = await loadProfiles(supabase, profileIds);
	const categoriesById = new Map(eventCategories.map((category) => [category.id, category]));
	const eventsByItem = new Map<string, WishlistItemDto['gift_item_events']>();

	for (const eventLink of itemEvents) {
		const existing = eventsByItem.get(eventLink.item_id) ?? [];
		existing.push({
			event_category_id: eventLink.event_category_id,
			gift_event_categories: categoriesById.get(eventLink.event_category_id) ?? null
		});
		eventsByItem.set(eventLink.item_id, existing);
	}

	const members: WishlistMemberDto[] = membershipRows.map((member) => ({
		user_id: member.user_id,
		role: member.role,
		profiles: profileFor(member.user_id, profiles)
	}));
	const items: WishlistItemDto[] = itemRows.map((item) => ({
		...item,
		links: item.links ?? [],
		priority: item.priority ?? 0,
		status: normalizeItemStatus(item.status),
		profiles: profileFor(item.owner_id, profiles),
		gift_item_events: eventsByItem.get(item.id) ?? []
	}));
	const reservations: WishlistReservationDto[] = reservationRows.map((reservation) => ({
		...reservation,
		profiles: profileFor(reservation.reserved_by, profiles)
	}));
	const comments: WishlistCommentDto[] = commentRows.map((comment) => ({
		...comment,
		profiles: profileFor(comment.author_id, profiles)
	}));

	return { members, eventCategories, items, reservations, purchases, comments };
}
