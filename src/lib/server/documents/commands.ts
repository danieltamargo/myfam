import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '$lib/types/database';
import type { DocumentAccessInput, DocumentUploadInput } from './schemas';
import type { ValidatedDocumentFile } from './files';
import {
	createDocumentDownloadUrl,
	DocumentFileError,
	removeDocumentObject,
	uploadDocumentObject
} from './files';

export class DocumentCommandError extends Error {
	constructor(
		public readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'DocumentCommandError';
	}
}

function throwCommandError(error: PostgrestError, fallback: string): never {
	if (error.code === '42501')
		throw new DocumentCommandError(403, 'No tienes permiso para realizar esta operación.');
	if (error.code === 'P0002')
		throw new DocumentCommandError(404, 'El documento ya no está disponible.');
	if (error.code === '40001' || error.code === 'PT409')
		throw new DocumentCommandError(
			409,
			'El documento cambió mientras lo editabas. Recarga la página e inténtalo de nuevo.'
		);
	if (['22023', '23503', '23505', '23514'].includes(error.code))
		throw new DocumentCommandError(400, 'Los datos del documento no son válidos.');
	throw new DocumentCommandError(500, fallback);
}

function parseUploadReservation(data: Json): { documentId: string; storagePath: string } {
	if (!data || Array.isArray(data) || typeof data !== 'object')
		throw new DocumentCommandError(500, 'No se pudo reservar el documento privado.');
	const documentId = data.document_id;
	const storagePath = data.storage_path;
	if (typeof documentId !== 'string' || typeof storagePath !== 'string')
		throw new DocumentCommandError(500, 'No se pudo reservar el documento privado.');
	return { documentId, storagePath };
}

async function cancelReservation(
	supabase: SupabaseClient<Database>,
	documentId: string,
	storagePath: string
): Promise<void> {
	try {
		await removeDocumentObject(supabase, storagePath);
	} catch (caught) {
		console.error('Could not roll back private document object', caught);
	}
	const { error } = await supabase.rpc('cancel_family_document_upload', {
		p_document_id: documentId
	});
	if (error) console.error('Could not cancel private document reservation', error.message);
}

export async function createFamilyDocument(
	supabase: SupabaseClient<Database>,
	familyId: string,
	input: DocumentUploadInput,
	validated: ValidatedDocumentFile
): Promise<string> {
	const { data, error } = await supabase.rpc('begin_family_document_upload', {
		p_family_id: familyId,
		p_display_name: input.displayName,
		p_original_name: validated.originalName,
		p_mime_type: validated.mimeType,
		p_size_bytes: validated.sizeBytes,
		p_folder_name: input.folderName ?? undefined,
		p_visibility: input.visibility,
		p_member_ids: input.memberIds,
		p_expires_at: input.expiresAt ?? undefined
	});
	if (error) throwCommandError(error, 'No se pudo preparar el documento.');
	const reservation = parseUploadReservation(data);
	try {
		await uploadDocumentObject(supabase, reservation.storagePath, validated);
		const completed = await supabase.rpc('complete_family_document_upload', {
			p_document_id: reservation.documentId
		});
		if (completed.error)
			throwCommandError(completed.error, 'No se pudo completar la subida del documento.');
		return reservation.documentId;
	} catch (caught) {
		await cancelReservation(supabase, reservation.documentId, reservation.storagePath);
		throw caught;
	}
}

export async function updateFamilyDocumentAccess(
	supabase: SupabaseClient<Database>,
	documentId: string,
	version: number,
	input: DocumentAccessInput
): Promise<number> {
	const { data, error } = await supabase.rpc('update_family_document_access', {
		p_document_id: documentId,
		p_version: version,
		p_folder_name: input.folderName ?? '',
		p_visibility: input.visibility,
		p_member_ids: input.memberIds,
		p_expires_at: input.expiresAt as string
	});
	if (error) throwCommandError(error, 'No se pudieron actualizar los permisos.');
	return data;
}

export async function prepareFamilyDocumentDownload(
	supabase: SupabaseClient<Database>,
	documentId: string,
	downloadName: string
): Promise<string> {
	const { data: path, error } = await supabase.rpc('prepare_family_document_download', {
		p_document_id: documentId
	});
	if (error) throwCommandError(error, 'No se pudo autorizar la descarga.');
	try {
		return await createDocumentDownloadUrl(supabase, path, downloadName);
	} catch (caught) {
		if (caught instanceof DocumentFileError)
			throw new DocumentCommandError(caught.status, caught.message);
		throw caught;
	}
}

export async function deleteFamilyDocument(
	supabase: SupabaseClient<Database>,
	documentId: string,
	version: number
): Promise<void> {
	const prepared = await supabase.rpc('prepare_family_document_delete', {
		p_document_id: documentId,
		p_version: version
	});
	if (prepared.error) throwCommandError(prepared.error, 'No se pudo preparar el borrado.');
	try {
		await removeDocumentObject(supabase, prepared.data);
	} catch (caught) {
		const restored = await supabase.rpc('restore_family_document_delete', {
			p_document_id: documentId
		});
		if (restored.error)
			console.error('Could not restore private document metadata', restored.error.message);
		if (caught instanceof DocumentFileError)
			throw new DocumentCommandError(caught.status, caught.message);
		throw caught;
	}
	const completed = await supabase.rpc('complete_family_document_delete', {
		p_document_id: documentId
	});
	if (completed.error) throwCommandError(completed.error, 'No se pudo completar el borrado.');
}
