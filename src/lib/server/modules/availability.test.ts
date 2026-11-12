import { describe, expect, it, vi } from 'vitest';
import { load as loadCalendar } from '../../../routes/(protected)/family/[familyId]/calendar/+page.server';
import {
	load as loadWishlist,
	actions as wishlistActions
} from '../../../routes/(protected)/family/[familyId]/wishlist/+page.server';
import {
	requireModuleAvailable,
	resolveModuleAccess,
	type ModuleEntitlementProvider
} from './availability';

function supabaseWithPreference(enabled: boolean | null) {
	const builder = {
		select: vi.fn(),
		eq: vi.fn(),
		maybeSingle: vi.fn().mockResolvedValue({
			data: enabled === null ? null : { enabled },
			error: null
		})
	};
	builder.select.mockReturnValue(builder);
	builder.eq.mockReturnValue(builder);
	return { from: vi.fn().mockReturnValue(builder) };
}

describe('module availability matrix', () => {
	it('keeps core modules enabled regardless of a stored false preference', () => {
		expect(
			resolveModuleAccess('members', [{ module_name: 'members', enabled: false }])
		).toMatchObject({ enabled: true, reason: 'core' });
	});

	it.each(['wishlist', 'calendar'] as const)(
		'requires both family preference and entitlement for %s',
		(moduleId) => {
			expect(resolveModuleAccess(moduleId, [], true)).toMatchObject({
				enabled: false,
				reason: 'family-disabled'
			});
			expect(
				resolveModuleAccess(moduleId, [{ module_name: moduleId, enabled: true }], false)
			).toMatchObject({ enabled: false, reason: 'not-entitled' });
			expect(
				resolveModuleAccess(moduleId, [{ module_name: moduleId, enabled: true }], true)
			).toMatchObject({ enabled: true, reason: 'enabled' });
			expect(
				resolveModuleAccess(moduleId, [{ module_name: moduleId, enabled: false }], true)
			).toMatchObject({ enabled: false, reason: 'family-disabled' });
		}
	);

	it('requires family opt-in for the secure games module', () => {
		expect(resolveModuleAccess('games', [{ module_name: 'games', enabled: true }])).toMatchObject({
			enabled: true,
			reason: 'enabled'
		});
		expect(resolveModuleAccess('games', [])).toMatchObject({
			enabled: false,
			reason: 'family-disabled'
		});
	});

	it('allows a direct route only when its family preference is enabled', async () => {
		await expect(
			requireModuleAvailable(supabaseWithPreference(true) as never, 'family-a', 'calendar')
		).resolves.toMatchObject({ id: 'calendar' });
		await expect(
			requireModuleAvailable(supabaseWithPreference(false) as never, 'family-a', 'calendar')
		).rejects.toMatchObject({ status: 404 });
	});

	it('honors a future entitlement denial without consulting family preferences', async () => {
		const supabase = supabaseWithPreference(true);
		const provider: ModuleEntitlementProvider = { isEntitled: () => false };
		await expect(
			requireModuleAvailable(supabase as never, 'family-a', 'documents', provider)
		).rejects.toMatchObject({ status: 404 });
		expect(supabase.from).not.toHaveBeenCalled();
	});

	it('returns 404 from a direct module URL before loading disabled data', async () => {
		const supabase = supabaseWithPreference(false);
		await expect(
			loadCalendar({
				params: { familyId: 'family-a' },
				url: new URL('http://localhost/family/family-a/calendar'),
				depends: vi.fn(),
				parent: vi.fn(),
				locals: { supabase, safeGetSession: vi.fn() }
			} as never)
		).rejects.toMatchObject({ status: 404 });
		expect(supabase.from).toHaveBeenCalledTimes(1);
	});

	it('blocks the direct Wishlist route and every action before loading disabled data', async () => {
		const supabase = supabaseWithPreference(false);
		const safeGetSession = vi.fn();
		const event = {
			params: { familyId: 'family-a' },
			url: new URL('http://localhost/family/family-a/wishlist'),
			locals: { supabase, safeGetSession }
		};
		await expect(loadWishlist(event as never)).rejects.toMatchObject({ status: 404 });
		for (const action of Object.values(wishlistActions)) {
			await expect(action(event as never)).rejects.toMatchObject({ status: 404 });
		}
		expect(safeGetSession).not.toHaveBeenCalled();
		expect(supabase.from.mock.calls.every(([table]) => table === 'family_modules')).toBe(true);
	});
});
