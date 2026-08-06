export const EXPENSE_LIMITS = {
	collectionName: 80,
	collectionDescription: 2_000,
	description: 160,
	notes: 4_000,
	amount: 9_999_999_999.99,
	receiptPath: 512
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

export interface ExpenseInput {
	categoryId: string | null;
	paidBy: string;
	description: string;
	amount: number;
	occurredOn: string;
	notes: string | null;
	receiptPath: string | null;
}

export interface ExpenseFormContext {
	collectionId: string;
	activeUserIds: ReadonlySet<string>;
}

export interface ExpenseCategoryInput {
	name: string;
	color: string | null;
}

function textValue(formData: FormData, field: string): string {
	const value = formData.get(field);
	return typeof value === 'string' ? value.trim() : '';
}

function isUuid(value: string): boolean {
	return UUID_PATTERN.test(value);
}

function parseAmount(value: string): number {
	const normalized = value.replace(',', '.');
	if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(normalized)) return Number.NaN;
	return Number(normalized);
}

function isIsoDate(value: string): boolean {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return false;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const candidate = new Date(Date.UTC(year, month - 1, day));
	return (
		candidate.getUTCFullYear() === year &&
		candidate.getUTCMonth() === month - 1 &&
		candidate.getUTCDate() === day
	);
}

export function isExpenseReceiptPath(value: string, collectionId: string): boolean {
	return (
		value.length <= EXPENSE_LIMITS.receiptPath &&
		value.startsWith(`${collectionId}/`) &&
		value.length > collectionId.length + 1 &&
		!value.includes('..') &&
		!value.includes('\\') &&
		!value.includes('://')
	);
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

export function parseExpenseUuidField(
	formData: FormData,
	field: string,
	message = 'El identificador enviado no es válido.'
): ExpenseValidationResult<string> {
	const value = textValue(formData, field);
	return isUuid(value)
		? { success: true, data: value }
		: { success: false, errors: { [field]: message } };
}

export function parseExpenseCategoryForm(
	formData: FormData
): ExpenseValidationResult<ExpenseCategoryInput> {
	const errors: ExpenseValidationErrors = {};
	const name = textValue(formData, 'name');
	const color = textValue(formData, 'color').toUpperCase();
	if (!name) errors.name = 'El nombre de la categoría es obligatorio.';
	else if (name.length > 60) errors.name = 'El nombre no puede superar 60 caracteres.';
	if (color && !/^#[0-9A-F]{6}$/.test(color))
		errors.color = 'El color debe tener formato hexadecimal, por ejemplo #2563EB.';
	return Object.keys(errors).length > 0
		? { success: false, errors }
		: { success: true, data: { name, color: color || null } };
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

export function parseExpenseForm(
	formData: FormData,
	context: ExpenseFormContext
): ExpenseValidationResult<ExpenseInput> {
	const errors: ExpenseValidationErrors = {};
	const description = textValue(formData, 'description');
	const amount = parseAmount(textValue(formData, 'amount'));
	const occurredOn = textValue(formData, 'occurred_on');
	const paidBy = textValue(formData, 'paid_by');
	const categoryId = textValue(formData, 'category_id');
	const notes = textValue(formData, 'notes');
	const receiptPath = textValue(formData, 'receipt_path');

	if (!description) errors.description = 'La descripción es obligatoria.';
	else if (description.length > EXPENSE_LIMITS.description)
		errors.description = `La descripción no puede superar ${EXPENSE_LIMITS.description} caracteres.`;

	if (!Number.isFinite(amount) || amount <= 0 || amount > EXPENSE_LIMITS.amount)
		errors.amount = 'Introduce un importe positivo con un máximo de dos decimales.';

	if (!isIsoDate(occurredOn)) errors.occurred_on = 'La fecha del gasto no es válida.';
	if (!isUuid(paidBy) || !context.activeUserIds.has(paidBy))
		errors.paid_by = 'El pagador debe ser un participante activo.';
	if (categoryId && !isUuid(categoryId))
		errors.category_id = 'La categoría seleccionada no es válida.';
	if (notes.length > EXPENSE_LIMITS.notes)
		errors.notes = `Las notas no pueden superar ${EXPENSE_LIMITS.notes} caracteres.`;
	if (receiptPath && !isExpenseReceiptPath(receiptPath, context.collectionId))
		errors.receipt_path = 'El recibo no pertenece a esta colección.';

	if (Object.keys(errors).length > 0) return { success: false, errors };

	return {
		success: true,
		data: {
			categoryId: categoryId || null,
			paidBy,
			description,
			amount,
			occurredOn,
			notes: notes || null,
			receiptPath: receiptPath || null
		}
	};
}

export function parseExpenseMutationIdentity(formData: FormData): ExpenseValidationResult<{
	expenseId: string;
	version: number;
}> {
	const errors: ExpenseValidationErrors = {};
	const expenseId = textValue(formData, 'expense_id');
	const versionText = textValue(formData, 'version');
	const version = /^\d+$/.test(versionText) ? Number(versionText) : Number.NaN;
	if (!isUuid(expenseId)) errors.expense_id = 'El gasto seleccionado no es válido.';
	if (!Number.isSafeInteger(version) || version < 1)
		errors.version = 'La versión del gasto no es válida.';
	return Object.keys(errors).length > 0
		? { success: false, errors }
		: { success: true, data: { expenseId, version } };
}

export function canManageExpenseCollection(role: ExpenseCollectionRole): boolean {
	return role === 'owner' || role === 'manager';
}

export function canCreateExpense(role: ExpenseCollectionRole): boolean {
	return role !== 'viewer';
}

export function canMutateExpense(
	role: ExpenseCollectionRole,
	currentUserId: string,
	createdBy: string
): boolean {
	return (
		canManageExpenseCollection(role) || (role === 'contributor' && currentUserId === createdBy)
	);
}
