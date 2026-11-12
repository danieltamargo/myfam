import { describe, expect, it } from 'vitest';
import { resolvePlannerModules } from './queries';

describe('resolvePlannerModules', () => {
	it('exige preferencia para Wishlist y los demás módulos opcionales', () => {
		expect(
			resolvePlannerModules([
				{ module_name: 'wishlist', enabled: true },
				{ module_name: 'expenses', enabled: true },
				{ module_name: 'calendar', enabled: false },
				{ module_name: 'tasks', enabled: true }
			])
		).toEqual({
			wishlist: true,
			expenses: true,
			calendar: false,
			tasks: true,
			lists: false
		});
	});

	it('ignora preferencias desconocidas', () => {
		expect(resolvePlannerModules([{ module_name: 'games', enabled: true }])).toEqual({
			wishlist: false,
			expenses: false,
			calendar: false,
			tasks: false,
			lists: false
		});
	});

	it('respeta una preferencia desactivada de Wishlist', () => {
		expect(resolvePlannerModules([{ module_name: 'wishlist', enabled: false }]).wishlist).toBe(
			false
		);
	});

	it('ignora nombres legacy después de migrar el catálogo', () => {
		expect(resolvePlannerModules([{ module_name: 'events', enabled: true }]).calendar).toBe(false);
	});
});
