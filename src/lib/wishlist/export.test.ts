import { describe, expect, it } from 'vitest';
import type { WishlistItemDto } from '$lib/server/wishlist/presenters';
import { createOwnWishlistExport } from './export';

function item(id: string, ownerId: string): WishlistItemDto {
	return {
		id,
		family_id: 'family-1',
		owner_id: ownerId,
		name: `Regalo ${id}`,
		description: null,
		price: 12,
		currency: 'EUR',
		priority: 1,
		desired_quantity: 2,
		status: 'active',
		links: ['https://example.test'],
		image_url: 'family-1/owner/private.webp',
		image_src: 'http://signed.example.test/private.webp?token=secret',
		version: 1,
		created_at: null,
		updated_at: null,
		profiles: { id: ownerId, display_name: ownerId, avatar_url: null },
		gift_item_events: []
	};
}

describe('createOwnWishlistExport', () => {
	it('exporta solo regalos propios y omite datos privados o de coordinación', () => {
		const result = createOwnWishlistExport(
			[item('mine', 'owner'), item('theirs', 'other')],
			'owner',
			'family-1'
		);
		const serialized = JSON.stringify(result);

		expect(result.items).toHaveLength(1);
		expect(result.items[0]?.name).toBe('Regalo mine');
		expect(serialized).not.toContain('signed.example.test');
		expect(serialized).not.toContain('image_url');
		expect(serialized).not.toContain('reserv');
		expect(serialized).not.toContain('purchas');
	});
});
