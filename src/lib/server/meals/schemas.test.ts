import { describe, expect, it } from 'vitest';
import { parseMealPlanForm, parseMealWeek, parseRecipeForm } from './schemas';

const recipeId = '10000000-0000-4000-8000-000000000001';

describe('meal schemas', () => {
	it('normaliza una receta y sus ingredientes de texto', () => {
		const form = new FormData();
		form.set('title', '  Sopa familiar  ');
		form.set('description', '  Para días fríos  ');
		form.set('instructions', 'Paso uno\r\nPaso dos');
		form.set('servings', '4');
		form.set('ingredients', '2,5 | kg | Patatas\nSal');
		expect(parseRecipeForm(form)).toEqual({
			success: true,
			data: {
				title: 'Sopa familiar',
				description: 'Para días fríos',
				instructions: 'Paso uno\nPaso dos',
				servings: 4,
				ingredients: [
					{ name: 'Patatas', quantity: 2.5, unit: 'kg' },
					{ name: 'Sal', quantity: null, unit: null }
				]
			}
		});
	});

	it('rechaza ingredientes ambiguos y planes fuera del límite', () => {
		const recipe = new FormData();
		recipe.set('title', 'Sopa');
		recipe.set('servings', '4');
		recipe.set('ingredients', '2 | Patatas');
		expect(parseRecipeForm(recipe).success).toBe(false);

		const meal = new FormData();
		meal.set('recipe_id', recipeId);
		meal.set('planned_on', '2027-01-03');
		meal.set('meal_type', 'lunch');
		expect(
			parseMealPlanForm(meal, new Set([recipeId]), new Date('2026-01-01T12:00:00Z')).success
		).toBe(false);
	});

	it('normaliza cualquier fecha solicitada al lunes de su semana', () => {
		expect(
			parseMealWeek(new URLSearchParams({ week: '2026-08-05' }), new Date('2020-01-01T00:00:00Z'))
		).toBe('2026-08-03');
	});
});
