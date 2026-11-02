import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';
import { isExpenseReceiptPath } from './schemas';
import { ScannedUploadError, uploadScannedObject } from '$lib/server/security/upload-storage';

const BUCKET = 'expense-receipts';
const MAX_RECEIPT_SIZE = 8 * 1024 * 1024;
const RECEIPT_EXTENSIONS = new Map([
	['image/jpeg', 'jpg'],
	['image/png', 'png'],
	['image/webp', 'webp'],
	['application/pdf', 'pdf']
]);

export class ExpenseReceiptError extends Error {
	constructor(
		public readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'ExpenseReceiptError';
	}
}

export interface PreparedExpenseReceipt {
	context: { collectionId: string; ownerId: string; expenseId?: string };
	file: File | null;
	previousPath: string | null;
	finalPath: string | null;
	uploadedPath: string | null;
}

export function prepareExpenseReceipt(
	formData: FormData,
	collectionId: string,
	uploaderId: string,
	previousPath: string | null,
	expenseId?: string
): PreparedExpenseReceipt {
	if (previousPath && !isExpenseReceiptPath(previousPath, collectionId)) {
		throw new ExpenseReceiptError(400, 'El recibo actual no pertenece a esta colección.');
	}

	const value = formData.get('receipt');
	const file = value instanceof File && value.size > 0 ? value : null;
	if (file && !RECEIPT_EXTENSIONS.has(file.type))
		throw new ExpenseReceiptError(400, 'El recibo debe ser PDF, JPG, PNG o WebP.');
	if (file && file.size > MAX_RECEIPT_SIZE)
		throw new ExpenseReceiptError(400, 'El recibo no puede superar 8 MB.');

	const extension = file ? RECEIPT_EXTENSIONS.get(file.type) : null;
	const uploadedPath = file
		? `${collectionId}/${uploaderId}/${crypto.randomUUID()}.${extension}`
		: null;
	const removeReceipt = formData.get('remove_receipt') === 'true';
	const finalPath = uploadedPath ?? (removeReceipt ? null : previousPath);
	formData.set('receipt_path', finalPath ?? '');
	return {
		file,
		previousPath,
		finalPath,
		uploadedPath,
		context: { collectionId, ownerId: uploaderId, expenseId }
	};
}

export async function uploadExpenseReceipt(
	supabase: SupabaseClient<Database>,
	prepared: PreparedExpenseReceipt
): Promise<void> {
	if (!prepared.file || !prepared.uploadedPath) return;
	try {
		await uploadScannedObject(
			supabase,
			{ bucket: BUCKET, ...prepared.context },
			prepared.uploadedPath,
			prepared.file
		);
	} catch (caught) {
		if (caught instanceof ScannedUploadError)
			throw new ExpenseReceiptError(caught.status, caught.message);
		throw new ExpenseReceiptError(503, 'No se pudo analizar el recibo de forma segura.');
	}
}

async function removeReceiptPath(
	supabase: SupabaseClient<Database>,
	path: string,
	message: string
): Promise<void> {
	const { error } = await supabase.storage.from(BUCKET).remove([path]);
	if (error) console.error(message, error);
}

export async function rollbackExpenseReceipt(
	supabase: SupabaseClient<Database>,
	prepared: PreparedExpenseReceipt
): Promise<void> {
	if (prepared.uploadedPath)
		await removeReceiptPath(supabase, prepared.uploadedPath, 'Could not roll back expense receipt');
}

export async function finalizeExpenseReceipt(
	supabase: SupabaseClient<Database>,
	prepared: PreparedExpenseReceipt
): Promise<void> {
	if (prepared.previousPath && prepared.previousPath !== prepared.finalPath)
		await removeReceiptPath(supabase, prepared.previousPath, 'Could not remove replaced receipt');
}

export async function removeExpenseReceipt(
	supabase: SupabaseClient<Database>,
	path: string | null
): Promise<void> {
	if (path) await removeReceiptPath(supabase, path, 'Could not remove deleted expense receipt');
}

export async function signExpenseReceiptUrls(
	supabase: SupabaseClient<Database>,
	paths: string[]
): Promise<Map<string, string>> {
	const uniquePaths = [...new Set(paths.filter(Boolean))];
	if (uniquePaths.length === 0) return new Map();
	const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(uniquePaths, 300);
	if (error) throw new ExpenseReceiptError(500, 'No se pudieron preparar los recibos privados.');
	return new Map(
		(data ?? [])
			.filter((item): item is typeof item & { path: string; signedUrl: string } =>
				Boolean(item.path && item.signedUrl && !item.error)
			)
			.map((item) => [item.path, item.signedUrl])
	);
}
