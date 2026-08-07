export const LIST_LIMITS = {
	title: 120,
	description: 2_000,
	itemTitle: 200,
	unit: 40,
	maxMembers: 100,
	maxQuantity: 9_999_999
} as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ListVisibility = 'family' | 'private' | 'selected_members';
export type ListValidationErrors = Record<string, string>;
export type ListValidationResult<T> =
	| { success: true; data: T }
	| { success: false; errors: ListValidationErrors };

export interface FamilyListInput {
	title: string;
	description: string | null;
	visibility: ListVisibility;
	memberIds: string[];
}

export interface FamilyListItemInput {
	title: string;
	quantity: number;
	unit: string | null;
}

export interface ListItemIdentity {
	itemId: string;
	version: number;
}

function textValue(formData: FormData, field: string): string {
	const value = formData.get(field);
	return typeof value === 'string' ? value.trim() : '';
}

function isUuid(value: string): boolean {
	return UUID_PATTERN.test(value);
}

export function parseFamilyListForm(
	formData: FormData,
	validMemberIds: ReadonlySet<string>
): ListValidationResult<FamilyListInput> {
	const errors: ListValidationErrors = {};
	const title = textValue(formData, 'title');
	const description = textValue(formData, 'description');
	const visibility = textValue(formData, 'visibility');
	const memberIds = [
		...new Set(
			formData
				.getAll('member_ids')
				.filter((value): value is string => typeof value === 'string' && value.length > 0)
		)
	];

	if (!title) errors.title = 'El nombre de la lista es obligatorio.';
	else if (title.length > LIST_LIMITS.title)
		errors.title = `El nombre no puede superar ${LIST_LIMITS.title} caracteres.`;
	if (description.length > LIST_LIMITS.description)
		errors.description = `La descripción no puede superar ${LIST_LIMITS.description} caracteres.`;
	if (!['family', 'private', 'selected_members'].includes(visibility))
		errors.visibility = 'La visibilidad seleccionada no es válida.';
	if (memberIds.length > LIST_LIMITS.maxMembers)
		errors.member_ids = 'Se han seleccionado demasiadas personas.';
	else if (memberIds.some((id) => !isUuid(id) || !validMemberIds.has(id)))
		errors.member_ids = 'Todas las personas deben pertenecer a la familia.';

	return Object.keys(errors).length > 0
		? { success: false, errors }
		: {
				success: true,
				data: {
					title,
					description: description || null,
					visibility: visibility as ListVisibility,
					memberIds: visibility === 'selected_members' ? memberIds : []
				}
			};
}

export function parseFamilyListItemForm(
	formData: FormData
): ListValidationResult<{ listId: string; item: FamilyListItemInput }> {
	const errors: ListValidationErrors = {};
	const listId = textValue(formData, 'list_id');
	const title = textValue(formData, 'title');
	const quantity = Number(textValue(formData, 'quantity') || '1');
	const unit = textValue(formData, 'unit');

	if (!isUuid(listId)) errors.list_id = 'La lista seleccionada no es válida.';
	if (!title) errors.title = 'El artículo es obligatorio.';
	else if (title.length > LIST_LIMITS.itemTitle)
		errors.title = `El artículo no puede superar ${LIST_LIMITS.itemTitle} caracteres.`;
	if (!Number.isFinite(quantity) || quantity <= 0 || quantity > LIST_LIMITS.maxQuantity)
		errors.quantity = 'La cantidad debe ser mayor que cero.';
	if (unit.length > LIST_LIMITS.unit)
		errors.unit = `La unidad no puede superar ${LIST_LIMITS.unit} caracteres.`;

	return Object.keys(errors).length > 0
		? { success: false, errors }
		: {
				success: true,
				data: { listId, item: { title, quantity, unit: unit || null } }
			};
}

export function parseListItemIdentity(formData: FormData): ListValidationResult<ListItemIdentity> {
	const itemId = textValue(formData, 'item_id');
	const version = Number(textValue(formData, 'version'));
	const errors: ListValidationErrors = {};
	if (!isUuid(itemId)) errors.item_id = 'El artículo seleccionado no es válido.';
	if (!Number.isSafeInteger(version) || version < 1)
		errors.version = 'La versión del artículo no es válida.';
	return Object.keys(errors).length > 0
		? { success: false, errors }
		: { success: true, data: { itemId, version } };
}
