import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';
import { isOwnedImagePath, type WishlistItemContext } from './schemas';

const BUCKET = 'gift-images';
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const IMAGE_EXTENSIONS = new Map([
	['image/jpeg', 'jpg'],
	['image/png', 'png'],
	['image/gif', 'gif'],
	['image/webp', 'webp']
]);

export class WishlistImageError extends Error {
	constructor(
		public readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'WishlistImageError';
	}
}

export interface PreparedWishlistImage {
	file: File | null;
	previousPath: string | null;
	finalPath: string | null;
	uploadedPath: string | null;
}

export function prepareWishlistImage(
	formData: FormData,
	context: WishlistItemContext,
	previousPath: string | null
): PreparedWishlistImage {
	if (previousPath && !isOwnedImagePath(previousPath, context)) {
		throw new WishlistImageError(400, 'La imagen actual no pertenece a este regalo.');
	}

	const imageValue = formData.get('image');
	const file = imageValue instanceof File && imageValue.size > 0 ? imageValue : null;
	if (file && !IMAGE_EXTENSIONS.has(file.type)) {
		throw new WishlistImageError(400, 'Usa una imagen JPG, PNG, GIF o WebP.');
	}
	if (file && file.size > MAX_IMAGE_SIZE) {
		throw new WishlistImageError(400, 'La imagen no puede superar 5 MB.');
	}

	const removeImage = formData.get('remove_image') === 'true';
	const extension = file ? IMAGE_EXTENSIONS.get(file.type) : null;
	const uploadedPath = file
		? `${context.familyId}/${context.ownerId}/${crypto.randomUUID()}.${extension}`
		: null;
	const finalPath = uploadedPath ?? (removeImage ? null : previousPath);
	formData.set('image_url', finalPath ?? '');

	return { file, previousPath, finalPath, uploadedPath };
}

export async function loadWishlistImagePath(
	supabase: SupabaseClient<Database>,
	context: WishlistItemContext,
	itemId: string
): Promise<string | null> {
	const { data, error } = await supabase
		.from('gift_items')
		.select('image_url')
		.eq('id', itemId)
		.eq('family_id', context.familyId)
		.eq('owner_id', context.ownerId)
		.maybeSingle();
	if (error) throw new WishlistImageError(500, 'No se pudo comprobar la imagen actual.');
	if (!data) throw new WishlistImageError(404, 'El regalo no existe.');
	return data.image_url;
}

export async function uploadWishlistImage(
	supabase: SupabaseClient<Database>,
	prepared: PreparedWishlistImage
): Promise<void> {
	if (!prepared.file || !prepared.uploadedPath) return;
	const { error } = await supabase.storage
		.from(BUCKET)
		.upload(prepared.uploadedPath, prepared.file, {
			contentType: prepared.file.type,
			upsert: false
		});
	if (error) throw new WishlistImageError(500, 'No se pudo subir la imagen privada.');
}

async function removePath(
	supabase: SupabaseClient<Database>,
	path: string,
	message: string
): Promise<void> {
	const { error } = await supabase.storage.from(BUCKET).remove([path]);
	if (error) console.error(message, error);
}

export async function rollbackWishlistImage(
	supabase: SupabaseClient<Database>,
	prepared: PreparedWishlistImage
): Promise<void> {
	if (prepared.uploadedPath) {
		await removePath(supabase, prepared.uploadedPath, 'Could not roll back wishlist image upload');
	}
}

export async function finalizeWishlistImage(
	supabase: SupabaseClient<Database>,
	prepared: PreparedWishlistImage
): Promise<void> {
	if (prepared.previousPath && prepared.previousPath !== prepared.finalPath) {
		await removePath(supabase, prepared.previousPath, 'Could not remove replaced wishlist image');
	}
}

export async function removeWishlistImage(
	supabase: SupabaseClient<Database>,
	path: string | null
): Promise<void> {
	if (path) await removePath(supabase, path, 'Could not remove deleted wishlist image');
}
