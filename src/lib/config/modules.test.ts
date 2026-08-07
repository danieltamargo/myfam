import { describe, expect, it } from 'vitest';
import { cn } from '$lib/utils';
import { MODULE_CATALOG, getNavigationModules } from './modules';
import { requireModuleAvailable } from '$lib/server/modules/availability';
import { load as loadGames } from '../../routes/(protected)/family/[familyId]/games/+page.server';
import { load as loadGameRoom } from '../../routes/(protected)/family/[familyId]/games/play/[roomId]/+page.server';

describe('project test baseline', () => {
	it('imports project aliases and utilities', () => {
		const optionalClass = false;
		expect(cn('px-2', optionalClass ? 'hidden' : undefined, 'px-4')).toBe('px-4');
	});

	it('keeps Wishlist core, exposes Expenses and disables Games globally', () => {
		expect(MODULE_CATALOG.wishlist.availability).toBe('core');
		expect(MODULE_CATALOG.expenses.availability).toBe('available');
		expect(getNavigationModules([]).some((module) => module.id === 'expenses')).toBe(false);
		expect(getNavigationModules(['expenses']).some((module) => module.id === 'expenses')).toBe(
			true
		);
		expect(getNavigationModules([]).map((module) => module.id)).toEqual(['members', 'wishlist']);
		expect(MODULE_CATALOG.games.availability).toBe('disabled');
		expect(getNavigationModules(['games']).some((module) => module.id === 'games')).toBe(false);
		expect(() => requireModuleAvailable('games')).toThrowError(
			expect.objectContaining({ status: 404 })
		);
	});

	it('publishes every completed organizational module as available', () => {
		for (const moduleId of [
			'expenses',
			'calendar',
			'tasks',
			'lists',
			'notes',
			'planner',
			'meals',
			'habits',
			'documents'
		] as const) {
			expect(MODULE_CATALOG[moduleId]).toMatchObject({
				availability: 'available',
				familyCanDisable: true
			});
		}
	});

	it.each([
		['games index', loadGames],
		['game room', loadGameRoom]
	])('returns 404 before loading the %s route', async (_label, load) => {
		const event = {
			params: { familyId: crypto.randomUUID(), roomId: crypto.randomUUID() },
			locals: { supabase: {}, safeGetSession: () => Promise.resolve({ user: null }) }
		};

		await expect(load(event as never)).rejects.toMatchObject({ status: 404 });
	});
});
