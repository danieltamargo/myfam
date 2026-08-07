export const DOCUMENT_LIMITS = {
	displayName: 180,
	originalName: 180,
	folderName: 80,
	maxMembers: 100,
	maxSizeBytes: 15 * 1024 * 1024,
	pageSize: 24
} as const;

export const DOCUMENT_MIME_TYPES = [
	'application/pdf',
	'image/jpeg',
	'image/png',
	'image/webp',
	'text/plain',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation'
] as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UNSAFE_NAME_PATTERN = /[/\\\p{Cc}]/u;

export type DocumentMimeType = (typeof DOCUMENT_MIME_TYPES)[number];
export type DocumentVisibility = 'private' | 'selected_members';
export type DocumentValidationErrors = Record<string, string>;
export type DocumentValidationResult<T> =
	| { success: true; data: T }
	| { success: false; errors: DocumentValidationErrors };

export interface DocumentAccessInput {
	folderName: string | null;
	visibility: DocumentVisibility;
	memberIds: string[];
	expiresAt: string | null;
}

export interface DocumentUploadInput extends DocumentAccessInput {
	displayName: string;
}

export interface DocumentIdentity {
	documentId: string;
	version: number;
}

export interface DocumentPageQuery {
	folder: string | null;
	cursor: string | null;
}

function textValue(formData: FormData, field: string): string {
	const value = formData.get(field);
	return typeof value === 'string' ? value.trim().normalize('NFC') : '';
}

function isUuid(value: string): boolean {
	return UUID_PATTERN.test(value);
}

function parseExpiry(value: string, now: Date, errors: DocumentValidationErrors): string | null {
	if (!value) return null;
	if (!DATE_PATTERN.test(value)) {
		errors.expires_at = 'La fecha de caducidad no es válida.';
		return null;
	}
	const expiresAt = new Date(`${value}T23:59:59.999Z`);
	const maximum = new Date(now);
	maximum.setUTCFullYear(maximum.getUTCFullYear() + 10);
	if (
		Number.isNaN(expiresAt.getTime()) ||
		expiresAt.toISOString().slice(0, 10) !== value ||
		expiresAt <= now
	) {
		errors.expires_at = 'La caducidad debe ser posterior a este momento.';
		return null;
	}
	if (expiresAt > maximum) {
		errors.expires_at = 'La caducidad no puede superar diez años.';
		return null;
	}
	return expiresAt.toISOString();
}

function parseAccess(
	formData: FormData,
	validMemberIds: ReadonlySet<string>,
	currentUserId: string,
	now: Date,
	errors: DocumentValidationErrors
): DocumentAccessInput {
	const folderName = textValue(formData, 'folder_name');
	const visibility = textValue(formData, 'visibility');
	const memberIds = [
		...new Set(
			formData
				.getAll('member_ids')
				.filter((value): value is string => typeof value === 'string' && value.length > 0)
		)
	].filter((id) => id !== currentUserId);

	if (folderName.length > DOCUMENT_LIMITS.folderName || UNSAFE_NAME_PATTERN.test(folderName))
		errors.folder_name = 'La carpeta debe tener un nombre simple de hasta 80 caracteres.';
	if (!['private', 'selected_members'].includes(visibility))
		errors.visibility = 'La privacidad seleccionada no es válida.';
	if (memberIds.length > DOCUMENT_LIMITS.maxMembers)
		errors.member_ids = 'Se han seleccionado demasiadas personas.';
	else if (memberIds.some((id) => !isUuid(id) || !validMemberIds.has(id)))
		errors.member_ids = 'Todas las personas deben pertenecer a la familia.';
	else if (visibility === 'selected_members' && memberIds.length === 0)
		errors.member_ids = 'Selecciona al menos a otra persona.';

	return {
		folderName: folderName || null,
		visibility: ['private', 'selected_members'].includes(visibility)
			? (visibility as DocumentVisibility)
			: 'private',
		memberIds: visibility === 'selected_members' ? memberIds : [],
		expiresAt: parseExpiry(textValue(formData, 'expires_at'), now, errors)
	};
}

export function parseDocumentUploadForm(
	formData: FormData,
	validMemberIds: ReadonlySet<string>,
	currentUserId: string,
	now = new Date()
): DocumentValidationResult<DocumentUploadInput> {
	const errors: DocumentValidationErrors = {};
	const displayName = textValue(formData, 'display_name');
	if (!displayName) errors.display_name = 'El nombre visible es obligatorio.';
	else if (
		displayName.length > DOCUMENT_LIMITS.displayName ||
		UNSAFE_NAME_PATTERN.test(displayName)
	)
		errors.display_name = 'El nombre debe tener hasta 180 caracteres y no incluir rutas.';
	const access = parseAccess(formData, validMemberIds, currentUserId, now, errors);
	return Object.keys(errors).length > 0
		? { success: false, errors }
		: { success: true, data: { displayName, ...access } };
}

export function parseDocumentAccessForm(
	formData: FormData,
	validMemberIds: ReadonlySet<string>,
	currentUserId: string,
	now = new Date()
): DocumentValidationResult<DocumentAccessInput> {
	const errors: DocumentValidationErrors = {};
	const data = parseAccess(formData, validMemberIds, currentUserId, now, errors);
	return Object.keys(errors).length > 0 ? { success: false, errors } : { success: true, data };
}

export function parseDocumentIdentity(
	formData: FormData
): DocumentValidationResult<DocumentIdentity> {
	const documentId = textValue(formData, 'document_id');
	const version = Number(textValue(formData, 'version'));
	const errors: DocumentValidationErrors = {};
	if (!isUuid(documentId)) errors.document_id = 'El documento seleccionado no es válido.';
	if (!Number.isSafeInteger(version) || version < 1)
		errors.version = 'La versión del documento no es válida.';
	return Object.keys(errors).length > 0
		? { success: false, errors }
		: { success: true, data: { documentId, version } };
}

export function parseDocumentId(
	formData: FormData
): DocumentValidationResult<{ documentId: string }> {
	const documentId = textValue(formData, 'document_id');
	return isUuid(documentId)
		? { success: true, data: { documentId } }
		: { success: false, errors: { document_id: 'El documento seleccionado no es válido.' } };
}

export function parseDocumentPageQuery(searchParams: URLSearchParams): DocumentPageQuery {
	const requestedFolder = (searchParams.get('folder') ?? '').trim().normalize('NFC');
	const folder =
		requestedFolder &&
		requestedFolder.length <= DOCUMENT_LIMITS.folderName &&
		!UNSAFE_NAME_PATTERN.test(requestedFolder)
			? requestedFolder
			: null;
	const requestedCursor = searchParams.get('cursor');
	const cursor =
		requestedCursor && !Number.isNaN(Date.parse(requestedCursor)) ? requestedCursor : null;
	return { folder, cursor };
}
