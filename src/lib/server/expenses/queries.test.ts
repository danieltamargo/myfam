import { describe, expect, it } from 'vitest';
import { loadExpenseCollections } from './queries';

describe('expense collection membership', () => {
	it('returns each collection once with the current user role, not another participant role', async () => {
		const collection = {
			id: 'collection',
			family_id: 'family',
			name: 'Viaje',
			description: null,
			currency: 'EUR',
			archived_at: null
		};
		const memberships = [
			{ user_id: 'owner', role: 'owner', status: 'active', collection },
			{ user_id: 'viewer', role: 'viewer', status: 'active', collection }
		];
		const filters = new Map<string, unknown>();
		const query = {
			select: () => query,
			eq: (field: string, value: unknown) => {
				filters.set(field, value);
				return query;
			},
			then: (resolve: (value: unknown) => unknown) =>
				Promise.resolve({
					data: memberships.filter((row) =>
						[...filters].every(([field, value]) => row[field as keyof typeof row] === value)
					),
					error: null
				}).then(resolve)
		};
		const supabase = { from: () => query, rpc: async () => ({ data: [], error: null }) };
		const result = await loadExpenseCollections(supabase as never, 'family', 'viewer');
		expect(result.collections).toHaveLength(1);
		expect(result.collections[0]).toMatchObject({ id: 'collection', role: 'viewer' });
	});
});
