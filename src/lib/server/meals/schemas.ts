export const MEAL_LIMITS = {
	title: 160,
	description: 2_000,
	instructions: 10_000,
	ingredientName: 120,
	ingredientUnit: 40,
	maxIngredients: 50,
	notes: 1_000
} as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type MealValidationErrors = Record<string, string>;
export type MealValidationResult<T> =
	| { success: true; data: T }
	| { success: false; errors: MealValidationErrors };

export interface RecipeIngredientInput {
	name: string;
	quantity: number | null;
	unit: string | null;
}

export interface RecipeInput {
	title: string;
	description: string | null;
	instructions: string | null;
	servings: number;
	ingredients: RecipeIngredientInput[];
}

export interface MealPlanInput {
	recipeId: string;
	plannedOn: string;
	mealType: MealType;
	notes: string | null;
}

function textValue(formData: FormData, field: string): string {
	const value = formData.get(field);
	return typeof value === 'string' ? value.trim() : '';
}

export function isIsoDate(value: string): boolean {
	if (!ISO_DATE_PATTERN.test(value)) return false;
	const [year, month, day] = value.split('-').map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));
	return (
		date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
	);
}

export function addIsoDays(value: string, days: number): string {
	const [year, month, day] = value.split('-').map(Number);
	const date = new Date(Date.UTC(year, month - 1, day + days));
	return date.toISOString().slice(0, 10);
}

export function startOfIsoWeek(value: string): string {
	const [year, month, day] = value.split('-').map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));
	const isoDay = date.getUTCDay() || 7;
	return addIsoDays(value, 1 - isoDay);
}

export function parseMealWeek(searchParams: URLSearchParams, today = new Date()): string {
	const requested = searchParams.get('week') ?? '';
	const fallback = today.toISOString().slice(0, 10);
	return startOfIsoWeek(isIsoDate(requested) ? requested : fallback);
}

function parseIngredientLines(
	value: string,
	errors: MealValidationErrors
): RecipeIngredientInput[] {
	const lines = value
		.replaceAll('\r\n', '\n')
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);
	if (lines.length < 1 || lines.length > MEAL_LIMITS.maxIngredients) {
		errors.ingredients = `Añade entre 1 y ${MEAL_LIMITS.maxIngredients} ingredientes.`;
		return [];
	}

	const ingredients: RecipeIngredientInput[] = [];
	for (const [index, line] of lines.entries()) {
		const parts = line.split('|').map((part) => part.trim());
		const hasDetails = parts.length === 3;
		if (parts.length !== 1 && !hasDetails) {
			errors.ingredients = `La línea ${index + 1} debe ser “cantidad | unidad | ingrediente” o solo el nombre.`;
			continue;
		}
		const name = hasDetails ? parts[2] : parts[0];
		const quantityText = hasDetails ? parts[0].replace(',', '.') : '';
		const unit = hasDetails ? parts[1] : '';
		const quantity = quantityText ? Number(quantityText) : null;
		if (!name || name.length > MEAL_LIMITS.ingredientName) {
			errors.ingredients = `El ingrediente de la línea ${index + 1} no es válido.`;
		} else if (
			quantity !== null &&
			(!Number.isFinite(quantity) || quantity <= 0 || quantity > 9_999_999)
		) {
			errors.ingredients = `La cantidad de la línea ${index + 1} no es válida.`;
		} else if (unit.length > MEAL_LIMITS.ingredientUnit) {
			errors.ingredients = `La unidad de la línea ${index + 1} es demasiado larga.`;
		} else {
			ingredients.push({ name, quantity, unit: unit || null });
		}
	}
	return ingredients;
}

export function parseRecipeForm(formData: FormData): MealValidationResult<RecipeInput> {
	const errors: MealValidationErrors = {};
	const title = textValue(formData, 'title');
	const description = textValue(formData, 'description').replaceAll('\r\n', '\n');
	const instructions = textValue(formData, 'instructions').replaceAll('\r\n', '\n');
	const servings = Number(textValue(formData, 'servings'));
	const ingredients = parseIngredientLines(textValue(formData, 'ingredients'), errors);

	if (!title || title.length > MEAL_LIMITS.title)
		errors.title = `El título debe tener entre 1 y ${MEAL_LIMITS.title} caracteres.`;
	if (description.length > MEAL_LIMITS.description)
		errors.description = `La descripción no puede superar ${MEAL_LIMITS.description} caracteres.`;
	if (instructions.length > MEAL_LIMITS.instructions)
		errors.instructions = `Las instrucciones no pueden superar ${MEAL_LIMITS.instructions} caracteres.`;
	if (!Number.isInteger(servings) || servings < 1 || servings > 50)
		errors.servings = 'Las raciones deben estar entre 1 y 50.';

	return Object.keys(errors).length > 0
		? { success: false, errors }
		: {
				success: true,
				data: {
					title,
					description: description || null,
					instructions: instructions || null,
					servings,
					ingredients
				}
			};
}

export function parseMealPlanForm(
	formData: FormData,
	validRecipeIds: ReadonlySet<string>,
	today = new Date()
): MealValidationResult<MealPlanInput> {
	const errors: MealValidationErrors = {};
	const recipeId = textValue(formData, 'recipe_id');
	const plannedOn = textValue(formData, 'planned_on');
	const mealType = textValue(formData, 'meal_type');
	const notes = textValue(formData, 'notes');
	const todayIso = today.toISOString().slice(0, 10);

	if (!UUID_PATTERN.test(recipeId) || !validRecipeIds.has(recipeId))
		errors.recipe_id = 'Selecciona una receta disponible.';
	if (
		!isIsoDate(plannedOn) ||
		plannedOn < addIsoDays(todayIso, -31) ||
		plannedOn > addIsoDays(todayIso, 366)
	)
		errors.planned_on = 'La fecha debe estar entre hace 31 días y dentro de un año.';
	if (!['breakfast', 'lunch', 'dinner', 'snack'].includes(mealType))
		errors.meal_type = 'Selecciona un tipo de comida válido.';
	if (notes.length > MEAL_LIMITS.notes)
		errors.notes = `Las notas no pueden superar ${MEAL_LIMITS.notes} caracteres.`;

	return Object.keys(errors).length > 0
		? { success: false, errors }
		: {
				success: true,
				data: {
					recipeId,
					plannedOn,
					mealType: mealType as MealType,
					notes: notes || null
				}
			};
}

export function parseMealEntryId(formData: FormData): MealValidationResult<{ entryId: string }> {
	const entryId = textValue(formData, 'entry_id');
	return UUID_PATTERN.test(entryId)
		? { success: true, data: { entryId } }
		: { success: false, errors: { entry_id: 'La comida seleccionada no es válida.' } };
}

export function parseRecipeListSelection(
	formData: FormData,
	validRecipeIds: ReadonlySet<string>,
	editableListIds: ReadonlySet<string>
): MealValidationResult<{ recipeId: string; listId: string }> {
	const errors: MealValidationErrors = {};
	const recipeId = textValue(formData, 'recipe_id');
	const listId = textValue(formData, 'list_id');
	if (!UUID_PATTERN.test(recipeId) || !validRecipeIds.has(recipeId))
		errors.recipe_id = 'Selecciona una receta disponible.';
	if (!UUID_PATTERN.test(listId) || !editableListIds.has(listId))
		errors.list_id = 'Selecciona una lista que puedas editar.';
	return Object.keys(errors).length > 0
		? { success: false, errors }
		: { success: true, data: { recipeId, listId } };
}
