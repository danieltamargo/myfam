import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import type { Database } from '$lib/types/database';
import { AntivirusError, scanUploadBytes } from './antivirus';

type Client = SupabaseClient<Database>;
type UploadScope =
	| { bucket: 'gift-images'; familyId: string; ownerId: string; itemId?: string }
	| { bucket: 'expense-receipts'; collectionId: string; ownerId: string; expenseId?: string }
	| { bucket: 'family-documents' };

export class ScannedUploadError extends Error {
	constructor(
		public readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'ScannedUploadError';
	}
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
let uploadInProgress = false;

export function configuredStorageServiceKey(values: Record<string, string | undefined>): string {
	if (values.SUPABASE_SECRET_KEYS) {
		let parsed: unknown;
		try {
			parsed = JSON.parse(values.SUPABASE_SECRET_KEYS);
		} catch {
			throw new ScannedUploadError(503, 'El servicio de subida no está configurado.');
		}
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
			throw new ScannedUploadError(503, 'El servicio de subida no está configurado.');
		const key = (parsed as Record<string, unknown>)[values.SUPABASE_SECRET_KEY_NAME || 'default'];
		if (typeof key !== 'string' || !key)
			throw new ScannedUploadError(503, 'El servicio de subida no está configurado.');
		return key;
	}
	const key = values.SUPABASE_SECRET_KEY || values.SUPABASE_SERVICE_ROLE_KEY;
	if (!key) throw new ScannedUploadError(503, 'El servicio de subida no está configurado.');
	return key;
}

function serviceStorageClient(signal: AbortSignal): Client {
	const url = env.SUPABASE_PROJECT_URL || env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
	if (!url) throw new ScannedUploadError(503, 'El servicio de subida no está configurado.');
	return createClient<Database>(url, configuredStorageServiceKey(env), {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: (input, init) =>
				fetch(input, {
					...init,
					signal: init?.signal ? AbortSignal.any([signal, init.signal]) : signal
				})
		}
	});
}

async function authorizeUpload(
	client: Client,
	path: string,
	scope: UploadScope,
	size: number,
	mime: string
) {
	const { data: identity, error: authError } = await client.auth.getUser();
	if (authError || !identity.user)
		throw new ScannedUploadError(401, 'No se pudo autorizar la subida. Inicia sesión de nuevo.');
	const userId = identity.user.id;
	const parts = path.split('/');
	if (parts.length !== 3 || parts[1] !== userId)
		throw new ScannedUploadError(403, 'La ruta de subida no pertenece a tu cuenta.');
	if (scope.bucket === 'gift-images') {
		if (
			scope.ownerId !== userId ||
			parts[0] !== scope.familyId ||
			!new RegExp(`^${UUID}\\.(jpg|png|gif|webp)$`, 'i').test(parts[2])
		)
			throw new ScannedUploadError(403, 'La imagen no pertenece a esta cuenta y familia.');
		const member = await client
			.from('family_members')
			.select('user_id')
			.eq('family_id', scope.familyId)
			.eq('user_id', userId)
			.maybeSingle();
		if (member.error || !member.data)
			throw new ScannedUploadError(403, 'No puedes subir imágenes a esta familia.');
		if (scope.itemId) {
			const item = await client
				.from('gift_items')
				.select('id, status')
				.eq('id', scope.itemId)
				.eq('family_id', scope.familyId)
				.eq('owner_id', userId)
				.maybeSingle();
			if (item.error || !item.data || item.data.status === 'fulfilled')
				throw new ScannedUploadError(403, 'No puedes cambiar la imagen de este regalo.');
		}
	} else if (scope.bucket === 'expense-receipts') {
		if (
			scope.ownerId !== userId ||
			parts[0] !== scope.collectionId ||
			!new RegExp(`^${UUID}\\.(jpg|png|webp|pdf)$`, 'i').test(parts[2])
		)
			throw new ScannedUploadError(403, 'El recibo no pertenece a esta cuenta y colección.');
		const [member, collection] = await Promise.all([
			client
				.from('expense_collection_members')
				.select('role')
				.eq('collection_id', scope.collectionId)
				.eq('user_id', userId)
				.eq('status', 'active')
				.maybeSingle(),
			client
				.from('expense_collections')
				.select('id, archived_at')
				.eq('id', scope.collectionId)
				.maybeSingle()
		]);
		if (
			member.error ||
			collection.error ||
			!collection.data ||
			collection.data.archived_at ||
			!member.data ||
			!['owner', 'manager', 'contributor'].includes(member.data.role)
		)
			throw new ScannedUploadError(403, 'No puedes subir recibos a esta colección.');
		if (scope.expenseId) {
			const expense = await client
				.from('expenses')
				.select('created_by')
				.eq('id', scope.expenseId)
				.eq('collection_id', scope.collectionId)
				.maybeSingle();
			if (
				expense.error ||
				!expense.data ||
				(member.data.role === 'contributor' && expense.data.created_by !== userId)
			)
				throw new ScannedUploadError(403, 'No puedes cambiar el recibo de este gasto.');
		}
	} else {
		if (!new RegExp(`^${UUID}$`, 'i').test(parts[2]))
			throw new ScannedUploadError(403, 'La reserva del documento no es válida.');
		const document = await client
			.from('family_documents')
			.select('id, owner_id, family_id, status, storage_path, size_bytes, mime_type')
			.eq('id', parts[2])
			.eq('owner_id', userId)
			.eq('storage_path', path)
			.maybeSingle();
		if (
			document.error ||
			!document.data ||
			document.data.family_id !== parts[0] ||
			document.data.status !== 'pending' ||
			document.data.size_bytes !== size ||
			document.data.mime_type !== mime
		)
			throw new ScannedUploadError(403, 'El documento no coincide con su reserva privada.');
		const member = await client
			.from('family_members')
			.select('user_id')
			.eq('family_id', document.data.family_id)
			.eq('user_id', userId)
			.maybeSingle();
		if (member.error || !member.data)
			throw new ScannedUploadError(403, 'No puedes subir documentos a esta familia.');
	}
}

function signatureMatches(mime: string, bytes: Uint8Array): boolean {
	const prefix = (...signature: number[]) =>
		signature.every((byte, index) => bytes[index] === byte);
	if (mime === 'image/png') return prefix(137, 80, 78, 71, 13, 10, 26, 10);
	if (mime === 'image/jpeg') return prefix(255, 216, 255);
	if (mime === 'image/gif')
		return prefix(71, 73, 70, 56) && [55, 57].includes(bytes[4]) && bytes[5] === 97;
	if (mime === 'image/webp')
		return (
			prefix(82, 73, 70, 70) &&
			bytes[8] === 87 &&
			bytes[9] === 69 &&
			bytes[10] === 66 &&
			bytes[11] === 80
		);
	if (mime === 'application/pdf') return prefix(37, 80, 68, 70, 45);
	if (mime === 'text/plain') return !bytes.includes(0);
	if (
		[
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'application/vnd.openxmlformats-officedocument.presentationml.presentation'
		].includes(mime)
	)
		return prefix(80, 75, 3, 4);
	return false;
}

export async function uploadScannedObject(
	client: Client,
	scope: UploadScope,
	path: string,
	file: File
): Promise<void> {
	const maxSize =
		scope.bucket === 'gift-images'
			? 5 * 1024 * 1024
			: scope.bucket === 'expense-receipts'
				? 8 * 1024 * 1024
				: 15 * 1024 * 1024;
	if (!file.size || file.size > maxSize)
		throw new ScannedUploadError(413, 'El archivo supera el tamaño permitido.');
	const mimeAllowed =
		scope.bucket === 'gift-images'
			? ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
			: scope.bucket === 'expense-receipts'
				? ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
				: [
						'image/jpeg',
						'image/png',
						'image/webp',
						'application/pdf',
						'text/plain',
						'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
						'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
						'application/vnd.openxmlformats-officedocument.presentationml.presentation'
					];
	if (!mimeAllowed.includes(file.type))
		throw new ScannedUploadError(415, 'El formato del archivo no está permitido.');
	await authorizeUpload(client, path, scope, file.size, file.type);
	if (uploadInProgress)
		throw new ScannedUploadError(
			503,
			'Hay otra subida en análisis. Inténtalo de nuevo en unos instantes.'
		);
	uploadInProgress = true;
	try {
		const bytes = Buffer.from(await file.arrayBuffer());
		if (bytes.length !== file.size || !signatureMatches(file.type, bytes))
			throw new ScannedUploadError(
				415,
				'El contenido del archivo no coincide con el formato permitido.'
			);
		await scanUploadBytes(bytes);
		await authorizeUpload(client, path, scope, bytes.length, file.type);
		const storageClient = serviceStorageClient(AbortSignal.timeout(30_000));
		const { error } = await storageClient.storage
			.from(scope.bucket)
			.upload(path, bytes, { contentType: file.type, upsert: false });
		if (error) {
			// Storage versions can hide database exceptions behind a generic 500 response.
			const capacity = error.message.includes('FAMILY_STORAGE_QUOTA_EXCEEDED')
				? { data: false, error: null }
				: await storageClient.rpc('family_storage_has_capacity', {
						p_bucket_id: scope.bucket,
						p_name: path,
						p_size_bytes: bytes.length
					});
			if (!capacity.error && capacity.data === false)
				throw new ScannedUploadError(
					413,
					'La familia ha alcanzado su límite de almacenamiento. Elimina archivos antes de subir más.'
				);
			throw new ScannedUploadError(500, 'No se pudo guardar el archivo analizado.');
		}
	} catch (caught) {
		if (caught instanceof ScannedUploadError) throw caught;
		if (caught instanceof AntivirusError)
			throw new ScannedUploadError(caught.status, caught.message);
		throw new ScannedUploadError(503, 'No se pudo completar el análisis y la subida del archivo.');
	} finally {
		uploadInProgress = false;
	}
}
