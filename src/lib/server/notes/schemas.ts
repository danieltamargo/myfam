export const NOTE_LIMITS = {
	title: 160,
	content: 20_000,
	search: 100,
	maxMembers: 100
} as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type NoteVisibility = 'family' | 'private' | 'selected_members';
export type NoteFilter = 'all' | 'mine' | 'shared' | 'archived';
export type NoteValidationErrors = Record<string, string>;
export type NoteValidationResult<T> =
	| { success: true; data: T }
	| { success: false; errors: NoteValidationErrors };

export interface FamilyNoteInput {
	title: string;
	content: string;
	visibility: NoteVisibility;
	memberIds: string[];
}

export interface NoteIdentity {
	noteId: string;
	version: number;
}

function textValue(formData: FormData, field: string): string {
	const value = formData.get(field);
	return typeof value === 'string' ? value.trim() : '';
}

function rawTextValue(formData: FormData, field: string): string {
	const value = formData.get(field);
	return typeof value === 'string' ? value : '';
}

function isUuid(value: string): boolean {
	return UUID_PATTERN.test(value);
}

export function parseNoteFilter(searchParams: URLSearchParams): {
	filter: NoteFilter;
	search: string;
	noteId: string | null;
} {
	const requestedFilter = searchParams.get('filter');
	const filter: NoteFilter = ['all', 'mine', 'shared', 'archived'].includes(requestedFilter ?? '')
		? (requestedFilter as NoteFilter)
		: 'all';
	const search = (searchParams.get('search') ?? '').trim().slice(0, NOTE_LIMITS.search);
	const requestedNoteId = searchParams.get('note');
	return {
		filter,
		search,
		noteId: requestedNoteId && isUuid(requestedNoteId) ? requestedNoteId : null
	};
}

export function parseFamilyNoteForm(
	formData: FormData,
	validMemberIds: ReadonlySet<string>,
	currentUserId: string
): NoteValidationResult<FamilyNoteInput> {
	const errors: NoteValidationErrors = {};
	const title = textValue(formData, 'title');
	const content = rawTextValue(formData, 'content').replace(/\r\n/g, '\n');
	const visibility = textValue(formData, 'visibility');
	const memberIds = [
		...new Set(
			formData
				.getAll('member_ids')
				.filter((value): value is string => typeof value === 'string' && value.length > 0)
		)
	].filter((id) => id !== currentUserId);

	if (!title) errors.title = 'El título de la nota es obligatorio.';
	else if (title.length > NOTE_LIMITS.title)
		errors.title = `El título no puede superar ${NOTE_LIMITS.title} caracteres.`;
	if (content.length > NOTE_LIMITS.content)
		errors.content = `La nota no puede superar ${NOTE_LIMITS.content} caracteres.`;
	if (!['family', 'private', 'selected_members'].includes(visibility))
		errors.visibility = 'La visibilidad seleccionada no es válida.';
	if (memberIds.length > NOTE_LIMITS.maxMembers)
		errors.member_ids = 'Se han seleccionado demasiadas personas.';
	else if (memberIds.some((id) => !isUuid(id) || !validMemberIds.has(id)))
		errors.member_ids = 'Todas las personas deben pertenecer a la familia.';
	else if (visibility === 'selected_members' && memberIds.length === 0)
		errors.member_ids = 'Selecciona al menos a otra persona.';

	return Object.keys(errors).length > 0
		? { success: false, errors }
		: {
				success: true,
				data: {
					title,
					content,
					visibility: visibility as NoteVisibility,
					memberIds: visibility === 'selected_members' ? memberIds : []
				}
			};
}

export function parseNoteIdentity(formData: FormData): NoteValidationResult<NoteIdentity> {
	const noteId = textValue(formData, 'note_id');
	const version = Number(textValue(formData, 'version'));
	const errors: NoteValidationErrors = {};
	if (!isUuid(noteId)) errors.note_id = 'La nota seleccionada no es válida.';
	if (!Number.isSafeInteger(version) || version < 1)
		errors.version = 'La versión de la nota no es válida.';
	return Object.keys(errors).length > 0
		? { success: false, errors }
		: { success: true, data: { noteId, version } };
}
