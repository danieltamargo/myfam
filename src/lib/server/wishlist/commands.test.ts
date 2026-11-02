import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';
import { createWishlistItem, updateWishlistItem } from './commands';
import type { WishlistItemInput } from './schemas';

const input: WishlistItemInput = {
	name: 'Regalo',
	description: null,
	price: null,
	currency: 'EUR',
	priority: 0,
	desiredQuantity: 1,
	status: 'active',
	links: [],
	imagePath: null,
	eventIds: [],
	calendarChange: 'keep',
	calendarEventId: null
};

describe('atomic wishlist saves', () => {
	it('creates the complete resource through one RPC without compensating client writes', async () => {
		const rpc = vi.fn().mockResolvedValue({ data: 'item-id', error: null });
		const client = { rpc } as unknown as SupabaseClient<Database>;
		expect(await createWishlistItem(client, 'family', 'owner', input)).toBe('item-id');
		expect(rpc).toHaveBeenCalledExactlyOnceWith(
			'save_wishlist_item',
			expect.objectContaining({
				p_item_id: null,
				p_owner_id: 'owner',
				p_category_ids: [],
				p_calendar_change: 'keep',
				p_calendar_event_id: null
			})
		);
	});
	it('passes the expected version and preserves conflict responses instead of retrying a partial save', async () => {
		const rpc = vi
			.fn()
			.mockResolvedValue({ data: null, error: { code: 'PT409', message: 'Changed' } });
		const client = { rpc } as unknown as SupabaseClient<Database>;
		await expect(
			updateWishlistItem(client, 'family', 'owner', 'item', 7, input)
		).rejects.toMatchObject({ status: 409 });
		expect(rpc).toHaveBeenCalledTimes(1);
		expect(rpc).toHaveBeenCalledWith(
			'save_wishlist_item',
			expect.objectContaining({ p_item_id: 'item', p_version: 7 })
		);
	});
});
