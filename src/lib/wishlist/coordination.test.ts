import { describe, expect, it } from 'vitest';
import type { WishlistPurchaseDto, WishlistReservationDto } from '$lib/server/wishlist/presenters';
import { summarizeWishlistCoordination } from './coordination';

const reservation = (id: string, userId: string, quantity: number): WishlistReservationDto => ({
	id,
	item_id: 'item-1',
	reserved_by: userId,
	quantity,
	status: 'considering',
	reserved_at: null,
	notes: null,
	profiles: { id: userId, display_name: userId, avatar_url: null }
});

const purchase = (id: string, userId: string, quantity: number): WishlistPurchaseDto => ({
	id,
	item_id: 'item-1',
	purchased_by: userId,
	quantity_purchased: quantity,
	purchased_at: null,
	notes: null
});

describe('summarizeWishlistCoordination', () => {
	it('retains allocations after a target reduction without offering additional capacity', () => {
		const summary = summarizeWishlistCoordination(
			'item-1',
			1,
			'buyer',
			[reservation('r1', 'buyer', 1)],
			[purchase('p1', 'other', 2)]
		);
		expect(summary).toMatchObject({
			remainingQuantity: 0,
			reservedQuantity: 1,
			purchasedQuantity: 2,
			maxReservationQuantity: 0,
			maxPurchaseQuantity: 0
		});
	});
	it('cuenta compras y reservas como capacidad coordinada', () => {
		const summary = summarizeWishlistCoordination(
			'item-1',
			5,
			'buyer',
			[reservation('r1', 'buyer', 1), reservation('r2', 'other', 1)],
			[purchase('p1', 'third', 1)]
		);

		expect(summary).toMatchObject({
			reservedQuantity: 2,
			purchasedQuantity: 1,
			remainingQuantity: 2,
			myReservationQuantity: 1,
			myPurchaseQuantity: 0,
			maxReservationQuantity: 3,
			maxPurchaseQuantity: 3
		});
	});

	it('permite reemplazar la coordinación propia sin superar la capacidad', () => {
		const summary = summarizeWishlistCoordination(
			'item-1',
			4,
			'buyer',
			[],
			[purchase('p1', 'buyer', 2), purchase('p2', 'other', 1)]
		);

		expect(summary.remainingQuantity).toBe(1);
		expect(summary.maxPurchaseQuantity).toBe(3);
		expect(summary.maxReservationQuantity).toBe(1);
	});
});
