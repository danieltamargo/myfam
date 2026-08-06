export const EXPENSE_LIMITS = {
	collectionName: 80,
	collectionDescription: 2_000
} as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

export type ExpenseCollectionRole = 'owner' | 'manager' | 'contributor' | 'viewer';
export type AssignableExpenseCollectionRole = Exclude<ExpenseCollectionRole, 'owner'>;
export type ExpenseValidationErrors = Record<string, string>;
export type ExpenseValidationResult<T> =
	| { success: true; data: T }
	| { success: false; errors: ExpenseValidationErrors };

export interface ExpenseCollectionInput {
	name: string;
	description: string | null;
	currency: string;
}

function textValue(formData: FormData, field: string): string {
	const value = formData.get(field);
	return typeof value === 'string' ? value.trim() : '';
}

function isUuid(value: string): boolean {
	return UUID_PATTERN.test(value);
}

export function parseExpenseCollectionForm(
	formData: FormData
): ExpenseValidationResult<ExpenseCollectionInput> {
	const errors: ExpenseValidationErrors = {};
	const name = textValue(formData, 'name');
	const description = textValue(formData, 'description');
	const currency = textValue(formData, 'currency').toUpperCase() || 'EUR';

	if (!name) errors.name = 'El nombre es obligatorio.';
	else if (name.length > EXPENSE_LIMITS.collectionName)
		errors.name = `El nombre no puede superar ${EXPENSE_LIMITS.collectionName} caracteres.`;

	if (description.length > EXPENSE_LIMITS.collectionDescription)
		errors.description = `La descripción no puede superar ${EXPENSE_LIMITS.collectionDescription} caracteres.`;

	if (!CURRENCY_PATTERN.test(currency))
		errors.currency = 'La moneda debe usar un código ISO de tres letras.';

	if (Object.keys(errors).length > 0) return { success: false, errors };

	return {
		success: true,
		data: { name, description: description || null, currency }
	};
}

export function parseExpenseCollectionId(formData: FormData): ExpenseValidationResult<string> {
	const collectionId = textValue(formData, 'collection_id');
	return isUuid(collectionId)
		? { success: true, data: collectionId }
		: {
				success: false,
				errors: { collection_id: 'La colección seleccionada no es válida.' }
			};
}

export function parseExpenseMemberForm(formData: FormData): ExpenseValidationResult<{
	collectionId: string;
	userId: string;
	role: AssignableExpenseCollectionRole;
}> {
	const errors: ExpenseValidationErrors = {};
	const collectionId = textValue(formData, 'collection_id');
	const userId = textValue(formData, 'user_id');
	const role = textValue(formData, 'role');

	if (!isUuid(collectionId)) errors.collection_id = 'La colección seleccionada no es válida.';
	if (!isUuid(userId)) errors.user_id = 'El miembro seleccionado no es válido.';
	if (!['manager', 'contributor', 'viewer'].includes(role))
		errors.role = 'El rol seleccionado no es válido.';

	if (Object.keys(errors).length > 0) return { success: false, errors };

	return {
		success: true,
		data: {
			collectionId,
			userId,
			role: role as AssignableExpenseCollectionRole
		}
	};
}
