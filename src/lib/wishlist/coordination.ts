import type { WishlistPurchaseDto, WishlistReservationDto } from '$lib/server/wishlist/presenters';

export interface WishlistCoordinationSummary {
	desiredQuantity: number;
	purchasedQuantity: number;
	reservedQuantity: number;
	remainingQuantity: number;
	myPurchaseQuantity: number;
	myReservationQuantity: number;
	reservationCount: number;
	maxPurchaseQuantity: number;
	maxReservationQuantity: number;
}

export function summarizeWishlistCoordination(
	itemId: string,
	desiredQuantity: number,
	currentUserId: string,
	reservations: WishlistReservationDto[],
	purchases: WishlistPurchaseDto[]
): WishlistCoordinationSummary {
	const itemReservations = reservations.filter((reservation) => reservation.item_id === itemId);
	const itemPurchases = purchases.filter((purchase) => purchase.item_id === itemId);
	const reservedQuantity = itemReservations.reduce(
		(total, reservation) => total + reservation.quantity,
		0
	);
	const purchasedQuantity = itemPurchases.reduce(
		(total, purchase) => total + purchase.quantity_purchased,
		0
	);
	const myReservationQuantity =
		itemReservations.find((reservation) => reservation.reserved_by === currentUserId)?.quantity ??
		0;
	const myPurchaseQuantity =
		itemPurchases.find((purchase) => purchase.purchased_by === currentUserId)?.quantity_purchased ??
		0;
	const remainingQuantity = Math.max(0, desiredQuantity - reservedQuantity - purchasedQuantity);

	return {
		desiredQuantity,
		purchasedQuantity,
		reservedQuantity,
		remainingQuantity,
		myPurchaseQuantity,
		myReservationQuantity,
		reservationCount: itemReservations.length,
		maxPurchaseQuantity: Math.max(
			0,
			desiredQuantity -
				reservedQuantity -
				purchasedQuantity +
				myReservationQuantity +
				myPurchaseQuantity
		),
		maxReservationQuantity: Math.max(
			0,
			desiredQuantity - reservedQuantity - purchasedQuantity + myReservationQuantity
		)
	};
}
