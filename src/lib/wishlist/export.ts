import type { WishlistItemDto } from '$lib/server/wishlist/presenters';

export interface WishlistExport {
	format: 'myfamily-wishlist';
	version: 1;
	family_id: string;
	items: Array<{
		name: string;
		description: string | null;
		price: number | null;
		currency: string;
		priority: number;
		desired_quantity: number;
		status: WishlistItemDto['status'];
		links: string[];
		categories: string[];
	}>;
}

export function createOwnWishlistExport(
	items: WishlistItemDto[],
	ownerId: string,
	familyId: string
): WishlistExport {
	return {
		format: 'myfamily-wishlist',
		version: 1,
		family_id: familyId,
		items: items
			.filter((item) => item.owner_id === ownerId)
			.map((item) => ({
				name: item.name,
				description: item.description,
				price: item.price,
				currency: item.currency,
				priority: item.priority,
				desired_quantity: item.desired_quantity,
				status: item.status,
				links: [...item.links],
				categories: item.gift_item_events.flatMap((eventLink) =>
					eventLink.gift_event_categories ? [eventLink.gift_event_categories.name] : []
				)
			}))
	};
}
