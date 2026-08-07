import type { Json } from '$lib/types/database';
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';
import type { MealPlanInput, RecipeInput } from './schemas';

export class MealCommandError extends Error {
	constructor(
		public readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'MealCommandError';
	}
}

function throwMealCommandError(error: PostgrestError, fallback: string): never {
	if (error.code === '42501')
		throw new MealCommandError(403, 'No tienes permiso para realizar esta acción.');
	if (error.code === 'P0002')
		throw new MealCommandError(404, 'La receta, comida o lista ya no está disponible.');
	if (['23503', '23505', '23514', '22023', '22P02'].includes(error.code))
		throw new MealCommandError(400, 'Los datos de comidas enviados no son válidos.');
	throw new MealCommandError(500, fallback);
}

function nullableRpc<T>(value: T | null): T {
	return value as T;
}

export async function createFamilyRecipe(
	supabase: SupabaseClient<Database>,
	familyId: string,
	input: RecipeInput
): Promise<string> {
	const { data, error } = await supabase.rpc('create_family_recipe', {
		p_family_id: familyId,
		p_title: input.title,
		p_description: nullableRpc(input.description),
		p_instructions: nullableRpc(input.instructions),
		p_servings: input.servings,
		p_ingredients: input.ingredients as unknown as Json
	});
	if (error) throwMealCommandError(error, 'No se pudo crear la receta.');
	return data;
}

export async function scheduleFamilyMeal(
	supabase: SupabaseClient<Database>,
	familyId: string,
	input: MealPlanInput
): Promise<string> {
	const { data, error } = await supabase.rpc('schedule_family_meal', {
		p_family_id: familyId,
		p_recipe_id: input.recipeId,
		p_planned_on: input.plannedOn,
		p_meal_type: input.mealType,
		p_notes: nullableRpc(input.notes)
	});
	if (error) throwMealCommandError(error, 'No se pudo guardar la comida.');
	return data;
}

export async function removeFamilyMeal(
	supabase: SupabaseClient<Database>,
	entryId: string
): Promise<void> {
	const { error } = await supabase.rpc('remove_family_meal', { p_entry_id: entryId });
	if (error) throwMealCommandError(error, 'No se pudo quitar la comida del plan.');
}

export async function copyRecipeIngredientsToList(
	supabase: SupabaseClient<Database>,
	recipeId: string,
	listId: string
): Promise<number> {
	const { data, error } = await supabase.rpc('copy_recipe_ingredients_to_list', {
		p_recipe_id: recipeId,
		p_list_id: listId
	});
	if (error) throwMealCommandError(error, 'No se pudieron copiar los ingredientes.');
	return data;
}
