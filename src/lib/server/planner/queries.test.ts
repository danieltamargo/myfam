import { describe, expect, it } from 'vitest';
import { resolvePlannerModules } from './queries';

describe('resolvePlannerModules', () => {
	it('mantiene Wishlist activa y exige preferencia para módulos no core', () => {
		expect(
			resolvePlannerModules([
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
			wishlist: true,
			expenses: false,
			calendar: false,
			tasks: false,
			lists: false
		});
	});

	it('reconoce la preferencia legacy events hasta su migración de catálogo', () => {
		expect(resolvePlannerModules([{ module_name: 'events', enabled: true }]).calendar).toBe(true);
	});
});
