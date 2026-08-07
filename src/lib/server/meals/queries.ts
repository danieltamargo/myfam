import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '$lib/types/database';
import { addIsoDays, type MealType } from './schemas';

export class MealQueryError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'MealQueryError';
	}
}

export interface RecipeRecord extends Tables<'family_recipes'> {
	ingredients: Tables<'recipe_ingredients'>[];
}

export interface MealPlanRecord extends Tables<'meal_plan_entries'> {
	mealType: MealType;
	recipeTitle: string;
}

export interface MealListOption {
	id: string;
	title: string;
	canEdit: boolean;
}

export interface MealPageData {
	weekStart: string;
	weekEnd: string;
	days: string[];
	recipes: RecipeRecord[];
	entries: MealPlanRecord[];
	lists: MealListOption[];
}

function assertQuery(error: { message: string } | null, message: string): void {
	if (error) throw new MealQueryError(`${message}: ${error.message}`);
}

function editableListIds(
	lists: Pick<Tables<'family_lists'>, 'id' | 'visibility' | 'created_by'>[],
	memberships: { list_id: string; user_id: string; role: string }[],
	userId: string
): Set<string> {
	return new Set(
		lists
			.filter(
				(list) =>
					list.visibility === 'family' ||
					list.created_by === userId ||
					memberships.some(
						(member) =>
							member.list_id === list.id &&
							member.user_id === userId &&
							(member.role === 'owner' || member.role === 'editor')
					)
			)
			.map((list) => list.id)
	);
}

async function loadAccessibleLists(
	supabase: SupabaseClient<Database>,
	familyId: string,
	userId: string
): Promise<{ lists: MealListOption[]; editableIds: Set<string> }> {
	const { data: listRows, error: listError } = await supabase
		.from('family_lists')
		.select('id, title, visibility, created_by')
		.eq('family_id', familyId)
		.is('archived_at', null)
		.order('updated_at', { ascending: false });
	assertQuery(listError, 'No se pudieron cargar las listas de compra');
	const ids = (listRows ?? []).map((list) => list.id);
	const { data: memberRows, error: memberError } = ids.length
		? await supabase.from('family_list_members').select('list_id, user_id, role').in('list_id', ids)
		: { data: [], error: null };
	assertQuery(memberError, 'No se pudieron comprobar los permisos de las listas');
	const editableIds = editableListIds(listRows ?? [], memberRows ?? [], userId);
	return {
		lists: (listRows ?? []).map((list) => ({
			id: list.id,
			title: list.title,
			canEdit: editableIds.has(list.id)
		})),
		editableIds
	};
}

export async function loadMealFormContext(
	supabase: SupabaseClient<Database>,
	familyId: string,
	userId: string
): Promise<{ recipeIds: Set<string>; editableListIds: Set<string> }> {
	const [recipeResult, listContext] = await Promise.all([
		supabase.from('family_recipes').select('id').eq('family_id', familyId).is('archived_at', null),
		loadAccessibleLists(supabase, familyId, userId)
	]);
	assertQuery(recipeResult.error, 'No se pudieron validar las recetas');
	return {
		recipeIds: new Set((recipeResult.data ?? []).map((recipe) => recipe.id)),
		editableListIds: listContext.editableIds
	};
}

export async function loadMealPage(
	supabase: SupabaseClient<Database>,
	familyId: string,
	userId: string,
	weekStart: string
): Promise<MealPageData> {
	const weekEnd = addIsoDays(weekStart, 6);
	const [recipeResult, entryResult, listContext] = await Promise.all([
		supabase
			.from('family_recipes')
			.select('*')
			.eq('family_id', familyId)
			.is('archived_at', null)
			.order('updated_at', { ascending: false }),
		supabase
			.from('meal_plan_entries')
			.select('*')
			.eq('family_id', familyId)
			.gte('planned_on', weekStart)
			.lte('planned_on', weekEnd)
			.order('planned_on')
			.order('meal_type'),
		loadAccessibleLists(supabase, familyId, userId)
	]);
	assertQuery(recipeResult.error, 'No se pudieron cargar las recetas');
	assertQuery(entryResult.error, 'No se pudo cargar el plan semanal');

	const recipeRows = recipeResult.data ?? [];
	const recipeIds = recipeRows.map((recipe) => recipe.id);
	const { data: ingredientRows, error: ingredientError } = recipeIds.length
		? await supabase
				.from('recipe_ingredients')
				.select('*')
				.in('recipe_id', recipeIds)
				.order('sort_order')
		: { data: [], error: null };
	assertQuery(ingredientError, 'No se pudieron cargar los ingredientes');
	const ingredientsByRecipe = new Map<string, Tables<'recipe_ingredients'>[]>();
	for (const ingredient of ingredientRows ?? []) {
		const rows = ingredientsByRecipe.get(ingredient.recipe_id) ?? [];
		rows.push(ingredient);
		ingredientsByRecipe.set(ingredient.recipe_id, rows);
	}
	const recipeTitle = new Map(recipeRows.map((recipe) => [recipe.id, recipe.title]));

	return {
		weekStart,
		weekEnd,
		days: Array.from({ length: 7 }, (_, index) => addIsoDays(weekStart, index)),
		recipes: recipeRows.map((recipe) => ({
			...recipe,
			ingredients: ingredientsByRecipe.get(recipe.id) ?? []
		})),
		entries: (entryResult.data ?? []).map((entry) => ({
			...entry,
			mealType: entry.meal_type as MealType,
			recipeTitle: recipeTitle.get(entry.recipe_id) ?? 'Receta no disponible'
		})),
		lists: listContext.lists.filter((list) => list.canEdit)
	};
}
