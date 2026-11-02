import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';
import type { FamilyNoteInput } from './schemas';

export class NoteCommandError extends Error {
	constructor(
		public readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'NoteCommandError';
	}
}

function throwNoteCommandError(error: PostgrestError, fallback: string): never {
	if (error.code === '42501')
		throw new NoteCommandError(403, 'No tienes permiso para modificar esta nota.');
	if (error.code === 'P0002') throw new NoteCommandError(404, 'La nota ya no está disponible.');
	if (error.code === '40001' || error.code === 'PT409')
		throw new NoteCommandError(
			409,
			'La nota cambió mientras la editabas. Recarga para conservar la versión más reciente.'
		);
	if (
		error.code === '23503' ||
		error.code === '23505' ||
		error.code === '23514' ||
		error.code === '22023'
	)
		throw new NoteCommandError(400, 'Los datos de la nota no son válidos.');
	throw new NoteCommandError(500, fallback);
}

export async function createFamilyNote(
	supabase: SupabaseClient<Database>,
	familyId: string,
	input: FamilyNoteInput
): Promise<string> {
	const { data, error } = await supabase.rpc('create_family_note', {
		p_family_id: familyId,
		p_title: input.title,
		p_content: input.content,
		p_visibility: input.visibility,
		p_member_ids: input.memberIds
	});
	if (error) throwNoteCommandError(error, 'No se pudo crear la nota.');
	return data;
}

export async function updateFamilyNote(
	supabase: SupabaseClient<Database>,
	noteId: string,
	version: number,
	input: FamilyNoteInput
): Promise<number> {
	const { data, error } = await supabase.rpc('update_family_note', {
		p_note_id: noteId,
		p_version: version,
		p_title: input.title,
		p_content: input.content,
		p_visibility: input.visibility,
		p_member_ids: input.memberIds
	});
	if (error) throwNoteCommandError(error, 'No se pudo actualizar la nota.');
	return data;
}

export async function setFamilyNoteArchived(
	supabase: SupabaseClient<Database>,
	noteId: string,
	version: number,
	archived: boolean
): Promise<number> {
	const { data, error } = await supabase.rpc('set_family_note_archived', {
		p_note_id: noteId,
		p_version: version,
		p_archived: archived
	});
	if (error) throwNoteCommandError(error, 'No se pudo cambiar el archivo de la nota.');
	return data;
}
