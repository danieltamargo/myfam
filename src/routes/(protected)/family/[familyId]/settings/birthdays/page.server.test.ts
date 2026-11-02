import { describe, expect, it, vi } from 'vitest';
import { actions } from './+page.server';

const userId = '98000000-0000-4000-8000-000000000003';
const otherId = '98000000-0000-4000-8000-000000000002';

function setup(role: string | null = 'member', authenticated = true) {
	const upsert = vi.fn().mockResolvedValue({ error: null });
	const query = {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		maybeSingle: vi.fn().mockResolvedValue({ data: role ? { role } : null, error: null }),
		upsert
	};
	const from = vi.fn(() => query);
	const run = (targetId: string, month = '2', day = '29') => {
		const data = new FormData();
		data.set('user_id', targetId);
		data.set('month', month);
		data.set('day', day);
		return actions.save({
			params: { familyId: 'family' },
			request: { formData: async () => data },
			locals: {
				supabase: { from },
				safeGetSession: async () => ({ user: authenticated ? { id: userId } : null })
			}
		} as never);
	};
	return { run, upsert, from, query };
}

describe('birthday settings action', () => {
	it('rejects unauthenticated callers before querying personal data', async () => {
		const { run, from } = setup('member', false);
		expect(await run(userId)).toMatchObject({ status: 401 });
		expect(from).not.toHaveBeenCalled();
	});
	it('rejects nonmembers and members editing another person before mutation', async () => {
		for (const role of [null, 'member']) {
			const { run, upsert } = setup(role);
			expect(await run(otherId)).toMatchObject({ status: 403 });
			expect(upsert).not.toHaveBeenCalled();
		}
	});
	it('rejects impossible dates without persisting them', async () => {
		const { run, upsert } = setup();
		expect(await run(userId, '2', '30')).toMatchObject({ status: 400 });
		expect(upsert).not.toHaveBeenCalled();
	});
	it('persists own birthday in the route family and allows administrators to manage members', async () => {
		for (const role of ['member', 'admin', 'owner']) {
			const target = role === 'member' ? userId : otherId;
			const { run, upsert, query } = setup(role);
			expect(await run(target)).toMatchObject({ success: true });
			expect(query.eq.mock.calls).toEqual([
				['family_id', 'family'],
				['user_id', userId]
			]);
			expect(upsert).toHaveBeenCalledWith({
				family_id: 'family',
				user_id: target,
				month: 2,
				day: 29
			});
		}
	});
});
