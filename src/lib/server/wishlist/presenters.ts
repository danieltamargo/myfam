import type { Tables } from '$lib/types/database';
import type { CalendarEventOption } from '$lib/server/calendar/resource-links';

export interface WishlistProfileDto {
	id: string;
	display_name: string;
	avatar_url: string | null;
}

export interface WishlistMemberDto {
	user_id: string;
	role: string;
	profiles: WishlistProfileDto;
}

export type WishlistEventCategoryDto = Tables<'gift_event_categories'>;

export interface WishlistItemEventDto {
	event_category_id: string;
	gift_event_categories: WishlistEventCategoryDto | null;
}

export interface WishlistItemDto extends Omit<
	Tables<'gift_items'>,
	'links' | 'priority' | 'status'
> {
	links: string[];
	priority: number;
	status: 'active' | 'fulfilled' | 'archived';
	image_src: string | null;
	profiles: WishlistProfileDto;
	gift_item_events: WishlistItemEventDto[];
	calendar_event?: CalendarEventOption | null;
}

export interface WishlistReservationDto extends Tables<'gift_reservations'> {
	profiles: WishlistProfileDto;
}

export type WishlistPurchaseDto = Tables<'gift_purchases'>;

export interface WishlistCommentDto extends Tables<'gift_item_comments'> {
	profiles: WishlistProfileDto;
}

export interface WishlistQueryData {
	calendarEvents?: CalendarEventOption[];
	members: WishlistMemberDto[];
	eventCategories: WishlistEventCategoryDto[];
	items: WishlistItemDto[];
	reservations: WishlistReservationDto[];
	purchases: WishlistPurchaseDto[];
	comments: WishlistCommentDto[];
}

export interface WishlistPageDto {
	calendarEvents: CalendarEventOption[];
	members: WishlistMemberDto[];
	eventCategories: WishlistEventCategoryDto[];
	items: WishlistItemDto[];
	myPurchases: WishlistPurchaseDto[];
	myReservations: WishlistReservationDto[];
	allReservations: WishlistReservationDto[];
	allPurchases: WishlistPurchaseDto[];
	comments: WishlistCommentDto[];
	currentUserId: string;
	receivedItems: Pick<WishlistItemDto, 'id' | 'name' | 'description' | 'updated_at'>[];
}

export function presentWishlistData(
	data: WishlistQueryData,
	currentUserId: string
): WishlistPageDto {
	const items = data.items.filter((item) => item.status !== 'fulfilled');
	const visibleItemIds = new Set(items.map((item) => item.id));
	const ownItemIds = new Set(
		data.items.filter((item) => item.owner_id === currentUserId).map((item) => item.id)
	);
	const visibleReservations = data.reservations.filter(
		(reservation) => visibleItemIds.has(reservation.item_id) && !ownItemIds.has(reservation.item_id)
	);
	const visiblePurchases = data.purchases.filter(
		(purchase) => visibleItemIds.has(purchase.item_id) && !ownItemIds.has(purchase.item_id)
	);
	const visibleComments = data.comments.filter(
		(comment) => visibleItemIds.has(comment.item_id) && !ownItemIds.has(comment.item_id)
	);

	return {
		calendarEvents: data.calendarEvents ?? [],
		members: data.members,
		eventCategories: data.eventCategories,
		items,
		receivedItems: data.items
			.filter((item) => item.status === 'fulfilled' && item.owner_id === currentUserId)
			.sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))
			.map(({ id, name, description, updated_at }) => ({ id, name, description, updated_at })),
		myPurchases: visiblePurchases.filter((purchase) => purchase.purchased_by === currentUserId),
		myReservations: visibleReservations.filter(
			(reservation) => reservation.reserved_by === currentUserId
		),
		allReservations: visibleReservations,
		allPurchases: visiblePurchases,
		comments: visibleComments,
		currentUserId
	};
}
