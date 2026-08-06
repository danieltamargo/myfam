import { describe, expect, it } from 'vitest';
import { presentWishlistData, type WishlistQueryData } from './presenters';

const currentUserId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const coordinatorId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ownItemId = '11111111-1111-4111-8111-111111111111';
const otherItemId = '22222222-2222-4222-8222-222222222222';

function queryData(): WishlistQueryData {
	const profile = { id: currentUserId, display_name: 'Ana', avatar_url: null };
	const coordinator = { id: coordinatorId, display_name: 'Bruno', avatar_url: null };
	return {
		members: [
			{ user_id: currentUserId, role: 'owner', profiles: profile },
			{ user_id: coordinatorId, role: 'member', profiles: coordinator }
		],
		eventCategories: [],
		items: [
			{
				id: ownItemId,
				family_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
				owner_id: currentUserId,
				name: 'Mi regalo',
				description: null,
				price: null,
				priority: 0,
				links: [],
				image_url: null,
				desired_quantity: 1,
				currency: 'EUR',
				status: 'active',
				version: 1,
				created_at: null,
				updated_at: null,
				profiles: profile,
				gift_item_events: []
			},
			{
				id: otherItemId,
				family_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
				owner_id: coordinatorId,
				name: 'Regalo de Bruno',
				description: null,
				price: 10,
				priority: 1,
				links: [],
				image_url: null,
				desired_quantity: 1,
				currency: 'EUR',
				status: 'active',
				version: 1,
				created_at: null,
				updated_at: null,
				profiles: coordinator,
				gift_item_events: []
			}
		],
		reservations: [
			{
				id: '31111111-1111-4111-8111-111111111111',
				item_id: ownItemId,
				reserved_by: coordinatorId,
				reserved_at: null,
				notes: null,
				quantity: 1,
				status: 'reserved',
				profiles: coordinator
			},
			{
				id: '32222222-2222-4222-8222-222222222222',
				item_id: otherItemId,
				reserved_by: currentUserId,
				reserved_at: null,
				notes: null,
				quantity: 1,
				status: 'considering',
				profiles: profile
			}
		],
		purchases: [
			{
				id: '41111111-1111-4111-8111-111111111111',
				item_id: ownItemId,
				purchased_by: coordinatorId,
				purchased_at: null,
				notes: null,
				quantity_purchased: 1
			},
			{
				id: '42222222-2222-4222-8222-222222222222',
				item_id: otherItemId,
				purchased_by: currentUserId,
				purchased_at: null,
				notes: null,
				quantity_purchased: 1
			}
		],
		comments: [
			{
				id: '51111111-1111-4111-8111-111111111111',
				item_id: ownItemId,
				author_id: coordinatorId,
				content: 'Sorpresa',
				created_at: '2026-08-06T00:00:00Z',
				updated_at: '2026-08-06T00:00:00Z',
				profiles: coordinator
			},
			{
				id: '52222222-2222-4222-8222-222222222222',
				item_id: otherItemId,
				author_id: currentUserId,
				content: 'Yo me encargo',
				created_at: '2026-08-06T00:00:00Z',
				updated_at: '2026-08-06T00:00:00Z',
				profiles: profile
			}
		]
	};
}

describe('presentWishlistData', () => {
	it('defensively removes every coordination detail for items owned by the viewer', () => {
		const result = presentWishlistData(queryData(), currentUserId);

		expect(result.allReservations.map((row) => row.item_id)).toEqual([otherItemId]);
		expect(result.allPurchases.map((row) => row.item_id)).toEqual([otherItemId]);
		expect(result.comments.map((row) => row.item_id)).toEqual([otherItemId]);
	});

	it('derives the viewer coordination state only from non-owned items', () => {
		const result = presentWishlistData(queryData(), currentUserId);

		expect(result.myReservations).toHaveLength(1);
		expect(result.myReservations[0]?.item_id).toBe(otherItemId);
		expect(result.myPurchases).toHaveLength(1);
		expect(result.myPurchases[0]?.item_id).toBe(otherItemId);
	});
});
