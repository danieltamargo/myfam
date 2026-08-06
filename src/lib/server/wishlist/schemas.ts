export const WISHLIST_LIMITS = {
	name: 120,
	description: 2_000,
	link: 2_048,
	links: 10,
	imagePath: 512,
	events: 20,
	comment: 2_000,
	quantity: 999,
	price: 99_999_999.99
} as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

export type WishlistItemStatus = 'active' | 'fulfilled' | 'archived';
export type WishlistReservationStatus = 'considering' | 'reserved';
export type WishlistCoordinationType = WishlistReservationStatus | 'purchased';

export interface WishlistItemInput {
	name: string;
	description: string | null;
	price: number | null;
	currency: string;
	priority: number;
	desiredQuantity: number;
	status: WishlistItemStatus;
	links: string[];
	imagePath: string | null;
	eventIds: string[];
}

export interface WishlistItemContext {
	familyId: string;
	ownerId: string;
}

export interface WishlistCoordinationInput {
	itemId: string;
	quantity: number;
	status: WishlistReservationStatus;
}

export type ValidationErrors = Record<string, string>;
export type ValidationResult<T> =
	| { success: true; data: T }
	| { success: false; errors: ValidationErrors };

function textValue(formData: FormData, field: string): string {
	const value = formData.get(field);
	return typeof value === 'string' ? value.trim() : '';
}

function uniqueTextValues(formData: FormData, field: string): string[] {
	return [
		...new Set(
			formData
				.getAll(field)
				.filter((value): value is string => typeof value === 'string')
				.map((value) => value.trim())
				.filter(Boolean)
		)
	];
}

function parseDecimal(value: string): number | null {
	if (!value) return null;
	const normalized = value.replace(',', '.');
	if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return Number.NaN;
	return Number(normalized);
}

function parseInteger(value: string, fallback: number): number {
	if (!value) return fallback;
	if (!/^-?\d+$/.test(value)) return Number.NaN;
	return Number(value);
}

function isHttpsUrl(value: string): boolean {
	if (value.length > WISHLIST_LIMITS.link) return false;
	try {
		const url = new URL(value);
		return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
	} catch {
		return false;
	}
}

function isOwnedImagePath(value: string, context: WishlistItemContext): boolean {
	if (!value || value.length > WISHLIST_LIMITS.imagePath) return false;
	const requiredPrefix = `${context.familyId}/${context.ownerId}/`;
	return (
		value.startsWith(requiredPrefix) &&
		value.length > requiredPrefix.length &&
		!value.includes('..') &&
		!value.includes('\\') &&
		!value.includes('://')
	);
}

export function parseWishlistItemForm(
	formData: FormData,
	context: WishlistItemContext
): ValidationResult<WishlistItemInput> {
	const errors: ValidationErrors = {};
	const name = textValue(formData, 'name');
	const description = textValue(formData, 'description');
	const price = parseDecimal(textValue(formData, 'price'));
	const currency = textValue(formData, 'currency') || 'EUR';
	const priority = parseInteger(textValue(formData, 'priority'), 0);
	const desiredQuantity = parseInteger(textValue(formData, 'desired_quantity'), 1);
	const statusValue = textValue(formData, 'status') || 'active';
	const links = uniqueTextValues(formData, 'links');
	const imagePath = textValue(formData, 'image_url');
	const eventIds = uniqueTextValues(formData, 'event_ids');

	if (!name) errors.name = 'El nombre es obligatorio.';
	else if (name.length > WISHLIST_LIMITS.name)
		errors.name = `El nombre no puede superar ${WISHLIST_LIMITS.name} caracteres.`;

	if (description.length > WISHLIST_LIMITS.description)
		errors.description = `La descripción no puede superar ${WISHLIST_LIMITS.description} caracteres.`;

	if (price !== null && (!Number.isFinite(price) || price < 0 || price > WISHLIST_LIMITS.price))
		errors.price = 'El precio debe ser un importe válido no negativo.';

	if (!CURRENCY_PATTERN.test(currency))
		errors.currency = 'La moneda debe usar un código ISO de tres letras mayúsculas.';

	if (!Number.isInteger(priority) || priority < -1 || priority > 2)
		errors.priority = 'La prioridad debe estar entre -1 y 2.';

	if (
		!Number.isInteger(desiredQuantity) ||
		desiredQuantity < 1 ||
		desiredQuantity > WISHLIST_LIMITS.quantity
	)
		errors.desired_quantity = `La cantidad debe estar entre 1 y ${WISHLIST_LIMITS.quantity}.`;

	if (!['active', 'fulfilled', 'archived'].includes(statusValue))
		errors.status = 'El estado del regalo no es válido.';

	if (links.length > WISHLIST_LIMITS.links)
		errors.links = `Solo se permiten ${WISHLIST_LIMITS.links} enlaces.`;
	else if (links.some((link) => !isHttpsUrl(link)))
		errors.links = 'Todos los enlaces externos deben usar HTTPS y no incluir credenciales.';

	if (imagePath && !isOwnedImagePath(imagePath, context))
		errors.image_url = 'La imagen debe ser un path privado perteneciente al usuario y la familia.';

	if (eventIds.length > WISHLIST_LIMITS.events || eventIds.some((id) => !UUID_PATTERN.test(id)))
		errors.event_ids = 'Las categorías seleccionadas no son válidas.';

	if (Object.keys(errors).length > 0) return { success: false, errors };

	return {
		success: true,
		data: {
			name,
			description: description || null,
			price,
			currency,
			priority,
			desiredQuantity,
			status: statusValue as WishlistItemStatus,
			links,
			imagePath: imagePath || null,
			eventIds
		}
	};
}

export function parseUuidField(formData: FormData, field: string): ValidationResult<string> {
	const value = textValue(formData, field);
	return UUID_PATTERN.test(value)
		? { success: true, data: value }
		: { success: false, errors: { [field]: 'El identificador no es válido.' } };
}

export function parseVersionField(formData: FormData): ValidationResult<number> {
	const version = parseInteger(textValue(formData, 'version'), Number.NaN);
	return Number.isSafeInteger(version) && version > 0
		? { success: true, data: version }
		: { success: false, errors: { version: 'La versión del regalo no es válida.' } };
}

export function parseBooleanField(formData: FormData, field: string): ValidationResult<boolean> {
	const value = textValue(formData, field);
	if (value === 'true') return { success: true, data: true };
	if (value === 'false') return { success: true, data: false };
	return { success: false, errors: { [field]: 'El valor enviado no es válido.' } };
}

export function parseCoordinationForm(
	formData: FormData,
	status: WishlistReservationStatus = 'considering'
): ValidationResult<WishlistCoordinationInput> {
	const item = parseUuidField(formData, 'item_id');
	const quantity = parseInteger(textValue(formData, 'quantity'), 1);
	const errors: ValidationErrors = {};
	if (!item.success) Object.assign(errors, item.errors);
	if (!Number.isInteger(quantity) || quantity < 1 || quantity > WISHLIST_LIMITS.quantity)
		errors.quantity = `La cantidad debe estar entre 1 y ${WISHLIST_LIMITS.quantity}.`;
	if (Object.keys(errors).length > 0) return { success: false, errors };
	if (!item.success) return { success: false, errors: item.errors };
	return { success: true, data: { itemId: item.data, quantity, status } };
}

export function parseCommentForm(
	formData: FormData
): ValidationResult<{ itemId: string; content: string }> {
	const item = parseUuidField(formData, 'item_id');
	const content = textValue(formData, 'content');
	const errors: ValidationErrors = {};
	if (!item.success) Object.assign(errors, item.errors);
	if (!content) errors.content = 'El comentario no puede estar vacío.';
	else if (content.length > WISHLIST_LIMITS.comment)
		errors.content = `El comentario no puede superar ${WISHLIST_LIMITS.comment} caracteres.`;
	if (Object.keys(errors).length > 0) return { success: false, errors };
	if (!item.success) return { success: false, errors: item.errors };
	return { success: true, data: { itemId: item.data, content } };
}
