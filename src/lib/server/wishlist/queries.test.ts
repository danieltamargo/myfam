import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';
import { loadReceivedWishlistHistory } from './queries';

function historyClient(rows: object[]) {
	const query = {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		order: vi.fn().mockReturnThis(),
		range: vi.fn().mockResolvedValue({ data: rows, error: null })
	};
	return { query, client: { from: vi.fn(() => query) } as unknown as SupabaseClient<Database> };
}

describe('received wishlist history', () => {
	it('bounds history to one page and applies owner, family and received scope', async () => {
		const rows = Array.from({ length: 51 }, (_, index) => ({
			id: String(index),
			name: 'Regalo',
			description: null,
			updated_at: null
		}));
		const { client, query } = historyClient(rows);
		const result = await loadReceivedWishlistHistory(client, 'family', 'owner', '2');

		expect(result.receivedItems).toHaveLength(50);
		expect(result).toMatchObject({ historyPage: 2, historyHasNext: true });
		expect(query.range).toHaveBeenCalledWith(50, 100);
		expect(query.eq.mock.calls).toEqual([
			['family_id', 'family'],
			['owner_id', 'owner'],
			['status', 'fulfilled']
		]);
		expect(query.select).toHaveBeenCalledWith('id, name, description, updated_at');
	});

	it('normalizes an invalid history page and stops when no further row exists', async () => {
		const { client, query } = historyClient([]);
		const result = await loadReceivedWishlistHistory(client, 'family', 'owner', '-3');
		expect(result).toEqual({ receivedItems: [], historyPage: 1, historyHasNext: false });
		expect(query.range).toHaveBeenCalledWith(0, 50);
	});
});
