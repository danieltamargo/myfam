import type { Tables } from '$lib/types/database';

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
}

export interface WishlistReservationDto extends Tables<'gift_reservations'> {
	profiles: WishlistProfileDto;
}

export type WishlistPurchaseDto = Tables<'gift_purchases'>;

export interface WishlistCommentDto extends Tables<'gift_item_comments'> {
	profiles: WishlistProfileDto;
}

export interface WishlistQueryData {
	members: WishlistMemberDto[];
	eventCategories: WishlistEventCategoryDto[];
	items: WishlistItemDto[];
	reservations: WishlistReservationDto[];
	purchases: WishlistPurchaseDto[];
	comments: WishlistCommentDto[];
}

export interface WishlistPageDto {
	members: WishlistMemberDto[];
	eventCategories: WishlistEventCategoryDto[];
	items: WishlistItemDto[];
	myPurchases: WishlistPurchaseDto[];
	myReservations: WishlistReservationDto[];
	allReservations: WishlistReservationDto[];
	allPurchases: WishlistPurchaseDto[];
	comments: WishlistCommentDto[];
	currentUserId: string;
}

export function presentWishlistData(
	data: WishlistQueryData,
	currentUserId: string
): WishlistPageDto {
	const ownItemIds = new Set(
		data.items.filter((item) => item.owner_id === currentUserId).map((item) => item.id)
	);
	const visibleReservations = data.reservations.filter(
		(reservation) => !ownItemIds.has(reservation.item_id)
	);
	const visiblePurchases = data.purchases.filter((purchase) => !ownItemIds.has(purchase.item_id));
	const visibleComments = data.comments.filter((comment) => !ownItemIds.has(comment.item_id));

	return {
		members: data.members,
		eventCategories: data.eventCategories,
		items: data.items,
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
