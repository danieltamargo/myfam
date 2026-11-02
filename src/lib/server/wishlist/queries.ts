import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '$lib/types/database';
import {
	loadVisibleCalendarEventOptions,
	loadGiftCalendarAssociations
} from '$lib/server/calendar/resource-links';
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

async function loadOrdinaryItems(supabase: SupabaseClient<Database>, familyId: string) {
	const items: Tables<'gift_items'>[] = [];
	const batchSize = 500;
	for (let offset = 0; ; offset += batchSize) {
		const { data, error } = await supabase
			.from('gift_items')
			.select('*')
			.eq('family_id', familyId)
			.neq('status', 'fulfilled')
			.order('created_at', { ascending: false })
			.order('id', { ascending: false })
			.range(offset, offset + batchSize - 1);
		assertQuery(error, 'No se pudieron cargar los regalos');
		items.push(...(data ?? []));
		if ((data ?? []).length < batchSize) return items;
	}
}

export async function loadReceivedWishlistHistory(
	supabase: SupabaseClient<Database>,
	familyId: string,
	ownerId: string,
	pageValue: string | null
) {
	const parsedPage = Number(pageValue);
	const historyPage =
		Number.isSafeInteger(parsedPage) && parsedPage > 0 ? Math.min(parsedPage, 10_000) : 1;
	const pageSize = 50;
	const offset = (historyPage - 1) * pageSize;
	const { data, error } = await supabase
		.from('gift_items')
		.select('id, name, description, updated_at')
		.eq('family_id', familyId)
		.eq('owner_id', ownerId)
		.eq('status', 'fulfilled')
		.order('updated_at', { ascending: false })
		.order('id', { ascending: false })
		.range(offset, offset + pageSize);
	assertQuery(error, 'No se pudo cargar el histórico');
	return {
		receivedItems: (data ?? []).slice(0, pageSize),
		historyPage,
		historyHasNext: (data ?? []).length > pageSize
	};
}

export async function loadWishlistQueryData(
	supabase: SupabaseClient<Database>,
	familyId: string
): Promise<WishlistQueryData> {
	const [membersResult, categoriesResult, itemRows, calendarEvents] = await Promise.all([
		supabase
			.from('family_members')
			.select('user_id, role')
			.eq('family_id', familyId)
			.order('joined_at', { ascending: true }),
		supabase.from('gift_event_categories').select('*').eq('family_id', familyId).order('name'),
		loadOrdinaryItems(supabase, familyId),
		loadVisibleCalendarEventOptions(supabase, familyId)
	]);

	assertQuery(membersResult.error, 'No se pudieron cargar los miembros');
	assertQuery(categoriesResult.error, 'No se pudieron cargar las categorías');

	const membershipRows = (membersResult.data ?? []).filter(
		(member): member is typeof member & { user_id: string } => Boolean(member.user_id)
	);
	const eventCategories: WishlistEventCategoryDto[] = categoriesResult.data ?? [];
	const itemIds = itemRows.map((item) => item.id);

	const [itemEvents, reservationRows, purchases, commentRows, calendarLinks] = await Promise.all([
		loadItemEvents(supabase, itemIds),
		loadReservations(supabase, itemIds),
		loadPurchases(supabase, itemIds),
		loadComments(supabase, itemIds),
		loadGiftCalendarAssociations(supabase, itemIds)
	]);

	const profileIds = [
		...membershipRows.map((member) => member.user_id),
		...itemRows.map((item) => item.owner_id),
		...reservationRows.map((reservation) => reservation.reserved_by),
		...commentRows.map((comment) => comment.author_id)
	];
	const profiles = await loadProfiles(supabase, profileIds);
	const imagePaths = [
		...new Set(itemRows.flatMap((item) => (item.image_url ? [item.image_url] : [])))
	];
	const imageSources = new Map<string, string>();
	if (imagePaths.length > 0) {
		const signedImages = await supabase.storage
			.from('gift-images')
			.createSignedUrls(imagePaths, 300);
		if (signedImages.error) {
			console.error('No se pudieron firmar las imágenes privadas de Wishlist', signedImages.error);
		} else {
			for (const image of signedImages.data) {
				if (image.path && image.signedUrl && !image.error)
					imageSources.set(image.path, image.signedUrl);
			}
		}
	}
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
	const calendarById = new Map(calendarEvents.map((event) => [event.id, event]));
	const calendarEventByItem = new Map(calendarLinks.map((link) => [link.item_id, link.event_id]));
	const items: WishlistItemDto[] = itemRows.map((item) => ({
		...item,
		calendar_event: calendarById.get(calendarEventByItem.get(item.id) ?? '') ?? null,
		links: item.links ?? [],
		priority: item.priority ?? 0,
		status: normalizeItemStatus(item.status),
		image_src: item.image_url ? (imageSources.get(item.image_url) ?? null) : null,
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

	return { members, eventCategories, items, reservations, purchases, comments, calendarEvents };
}
