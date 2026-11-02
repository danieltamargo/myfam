import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';
import { loadBirthdayAlerts, loadBirthdayMembers } from './queries';

function clientWith(error: object | null = null) {
	const rows: Record<string, object[]> = {
		family_members: [{ user_id: 'member' }],
		family_member_birthdays: [
			{ user_id: 'member', month: 11, day: 1 },
			{ user_id: 'stale', month: 11, day: 1 }
		],
		public_profiles: [{ id: 'member', display_name: 'Ángela' }]
	};
	const queries = new Map<string, ReturnType<typeof query>>();
	function query(table: string) {
		return {
			select: vi.fn().mockReturnThis(),
			eq: vi.fn().mockReturnThis(),
			order: vi.fn().mockReturnThis(),
			in: vi.fn().mockReturnThis(),
			then: (resolve: (value: unknown) => unknown) =>
				Promise.resolve({ data: rows[table], error }).then(resolve)
		};
	}
	const from = vi.fn((table: string) => {
		const q = query(table);
		queries.set(table, q);
		return q;
	});
	return { client: { from } as unknown as SupabaseClient<Database>, from, queries };
}

describe('birthday queries', () => {
	it('queries only family members and birthday dates, and scopes public names to membership', async () => {
		const { client, from, queries } = clientWith();
		const members = await loadBirthdayMembers(client, 'family');
		expect(members).toEqual([{ userId: 'member', displayName: 'Ángela', month: 11, day: 1 }]);
		expect(from.mock.calls.map(([table]) => table)).toEqual([
			'family_members',
			'family_member_birthdays',
			'public_profiles'
		]);
		for (const table of ['family_members', 'family_member_birthdays'])
			expect(queries.get(table)?.eq).toHaveBeenCalledWith('family_id', 'family');
		expect(queries.get('public_profiles')?.in).toHaveBeenCalledWith('id', ['member']);
	});
	it('does not query birthday or wishlist data when wishlist is unavailable', async () => {
		const { client, from } = clientWith();
		expect(await loadBirthdayAlerts(client, 'family', false)).toEqual([]);
		expect(from).not.toHaveBeenCalled();
	});
	it('reports query failure instead of silently returning no birthdays', async () => {
		const { client } = clientWith({ message: 'denied' });
		await expect(loadBirthdayAlerts(client, 'family', true)).rejects.toThrow(
			'No se pudieron cargar los cumpleaños.'
		);
	});
});
