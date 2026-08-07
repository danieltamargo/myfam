import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { guardModuleActions, requireModuleAvailable } from '$lib/server/modules/availability';
import {
	copyRecipeIngredientsToList,
	createFamilyRecipe,
	MealCommandError,
	removeFamilyMeal,
	scheduleFamilyMeal
} from '$lib/server/meals/commands';
import { loadMealFormContext, loadMealPage, MealQueryError } from '$lib/server/meals/queries';
import {
	parseMealEntryId,
	parseMealPlanForm,
	parseMealWeek,
	parseRecipeForm,
	parseRecipeListSelection,
	type MealValidationErrors
} from '$lib/server/meals/schemas';

function invalidForm(errors: MealValidationErrors) {
	return fail(400, {
		error: Object.values(errors)[0] ?? 'Los datos enviados no son válidos.',
		fieldErrors: errors
	});
}

function commandFailure(caught: unknown, fallback: string) {
	if (caught instanceof MealCommandError) return fail(caught.status, { error: caught.message });
	if (caught instanceof MealQueryError) return fail(500, { error: caught.message });
	console.error(fallback, caught);
	return fail(500, { error: fallback });
}

export const load: PageServerLoad = async ({
	url,
	params,
	locals: { supabase, safeGetSession }
}) => {
	await requireModuleAvailable(supabase, params.familyId, 'meals');
	const { user } = await safeGetSession();
	if (!user) throw error(401, 'Unauthorized');
	try {
		return {
			...(await loadMealPage(supabase, params.familyId, user.id, parseMealWeek(url.searchParams))),
			familyId: params.familyId
		};
	} catch (caught) {
		if (caught instanceof MealQueryError) console.error(caught.message);
		else console.error('Unexpected meal query failure', caught);
		throw error(500, 'No se pudo cargar el plan de comidas.');
	}
};

const moduleActions: Actions = {
	createRecipe: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		const parsed = parseRecipeForm(await request.formData());
		if (!parsed.success) return invalidForm(parsed.errors);
		try {
			const recipeId = await createFamilyRecipe(supabase, params.familyId, parsed.data);
			return { success: true, message: 'Receta guardada.', recipeId };
		} catch (caught) {
			return commandFailure(caught, 'No se pudo crear la receta.');
		}
	},

	scheduleMeal: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		try {
			const [formData, context] = await Promise.all([
				request.formData(),
				loadMealFormContext(supabase, params.familyId, user.id)
			]);
			const parsed = parseMealPlanForm(formData, context.recipeIds);
			if (!parsed.success) return invalidForm(parsed.errors);
			await scheduleFamilyMeal(supabase, params.familyId, parsed.data);
			return { success: true, message: 'Comida añadida al plan.' };
		} catch (caught) {
			return commandFailure(caught, 'No se pudo guardar la comida.');
		}
	},

	removeMeal: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		const parsed = parseMealEntryId(await request.formData());
		if (!parsed.success) return invalidForm(parsed.errors);
		try {
			await removeFamilyMeal(supabase, parsed.data.entryId);
			return { success: true, message: 'Comida retirada del plan.' };
		} catch (caught) {
			return commandFailure(caught, 'No se pudo retirar la comida.');
		}
	},

	copyIngredients: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		try {
			const [formData, context] = await Promise.all([
				request.formData(),
				loadMealFormContext(supabase, params.familyId, user.id)
			]);
			const parsed = parseRecipeListSelection(formData, context.recipeIds, context.editableListIds);
			if (!parsed.success) return invalidForm(parsed.errors);
			const count = await copyRecipeIngredientsToList(
				supabase,
				parsed.data.recipeId,
				parsed.data.listId
			);
			return {
				success: true,
				message: `${count} ${count === 1 ? 'ingrediente copiado' : 'ingredientes copiados'} a la lista.`
			};
		} catch (caught) {
			return commandFailure(caught, 'No se pudieron copiar los ingredientes.');
		}
	}
};

export const actions: Actions = guardModuleActions('meals', moduleActions);
