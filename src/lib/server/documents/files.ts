import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';
import { DOCUMENT_LIMITS, DOCUMENT_MIME_TYPES, type DocumentMimeType } from './schemas';
import { ScannedUploadError, uploadScannedObject } from '$lib/server/security/upload-storage';

export const FAMILY_DOCUMENTS_BUCKET = 'family-documents';
const UNSAFE_NAME_PATTERN = /[/\\\p{Cc}]/u;
const OFFICE_MIME_TYPES = new Set<DocumentMimeType>([
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation'
]);

export class DocumentFileError extends Error {
	constructor(
		public readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'DocumentFileError';
	}
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
	return signature.every((value, index) => bytes[index] === value);
}

function hasExpectedSignature(mimeType: DocumentMimeType, bytes: Uint8Array): boolean {
	if (mimeType === 'application/pdf') return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
	if (mimeType === 'image/jpeg') return startsWith(bytes, [0xff, 0xd8, 0xff]);
	if (mimeType === 'image/png')
		return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	if (mimeType === 'image/webp')
		return (
			startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
			bytes[8] === 0x57 &&
			bytes[9] === 0x45 &&
			bytes[10] === 0x42 &&
			bytes[11] === 0x50
		);
	if (OFFICE_MIME_TYPES.has(mimeType)) return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
	if (mimeType === 'text/plain') return !bytes.includes(0);
	return false;
}

export interface ValidatedDocumentFile {
	file: File;
	originalName: string;
	mimeType: DocumentMimeType;
	sizeBytes: number;
}

export async function validateDocumentFile(formData: FormData): Promise<ValidatedDocumentFile> {
	const value = formData.get('document');
	if (!(value instanceof File) || value.size === 0)
		throw new DocumentFileError(400, 'Selecciona un documento para subir.');
	const originalName = value.name.trim().normalize('NFC');
	if (
		!originalName ||
		originalName.length > DOCUMENT_LIMITS.originalName ||
		UNSAFE_NAME_PATTERN.test(originalName)
	)
		throw new DocumentFileError(400, 'El nombre original del archivo no es válido.');
	if (value.size > DOCUMENT_LIMITS.maxSizeBytes)
		throw new DocumentFileError(413, 'El documento no puede superar 15 MB.');
	if (!DOCUMENT_MIME_TYPES.includes(value.type as DocumentMimeType))
		throw new DocumentFileError(415, 'El formato del documento no está permitido.');
	const mimeType = value.type as DocumentMimeType;
	const header = new Uint8Array(await value.slice(0, 4096).arrayBuffer());
	if (!hasExpectedSignature(mimeType, header))
		throw new DocumentFileError(
			415,
			'El contenido del archivo no coincide con el formato declarado.'
		);
	return { file: value, originalName, mimeType, sizeBytes: value.size };
}

export async function uploadDocumentObject(
	supabase: SupabaseClient<Database>,
	path: string,
	validated: ValidatedDocumentFile
): Promise<void> {
	try {
		await uploadScannedObject(supabase, { bucket: FAMILY_DOCUMENTS_BUCKET }, path, validated.file);
	} catch (caught) {
		if (caught instanceof ScannedUploadError)
			throw new DocumentFileError(caught.status, caught.message);
		throw new DocumentFileError(503, 'No se pudo analizar el documento de forma segura.');
	}
}

export async function removeDocumentObject(
	supabase: SupabaseClient<Database>,
	path: string
): Promise<void> {
	const { error } = await supabase.storage.from(FAMILY_DOCUMENTS_BUCKET).remove([path]);
	if (error) throw new DocumentFileError(500, 'No se pudo borrar el documento privado.');
}

export async function createDocumentDownloadUrl(
	supabase: SupabaseClient<Database>,
	path: string,
	downloadName: string
): Promise<string> {
	const { data, error } = await supabase.storage
		.from(FAMILY_DOCUMENTS_BUCKET)
		.createSignedUrl(path, 120, { download: downloadName });
	if (error || !data?.signedUrl)
		throw new DocumentFileError(500, 'No se pudo preparar la descarga privada.');
	return data.signedUrl;
}
