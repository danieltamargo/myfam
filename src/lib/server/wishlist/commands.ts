import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';
import type {
	WishlistCoordinationType,
	WishlistItemInput,
	WishlistReservationStatus
} from './schemas';

export class WishlistCommandError extends Error {
	constructor(
		public readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'WishlistCommandError';
	}
}

function throwCommandError(error: PostgrestError, fallback: string): never {
	if (error.code === '42501')
		throw new WishlistCommandError(403, 'No tienes permiso para esta acción.');
	if (error.code === 'P0002') throw new WishlistCommandError(404, 'El regalo no existe.');
	if (error.code === '23505')
		throw new WishlistCommandError(409, 'La operación ya se había aplicado.');
	if (error.code === '40001' || error.code === 'PT409')
		throw new WishlistCommandError(
			409,
			'El regalo cambió. Recarga la página e inténtalo de nuevo.'
		);
	if (error.code === '23514' || error.code === '22023')
		throw new WishlistCommandError(400, error.message || fallback);
	throw new WishlistCommandError(500, fallback);
}

function nullableRpc<T>(value: T | null): T {
	return value as T;
}

async function saveWishlistItem(
	supabase: SupabaseClient<Database>,
	familyId: string,
	ownerId: string,
	itemId: string | null,
	version: number | null,
	input: WishlistItemInput
): Promise<string> {
	const { data, error } = await supabase.rpc('save_wishlist_item', {
		p_item_id: nullableRpc(itemId),
		p_family_id: familyId,
		p_owner_id: ownerId,
		p_version: nullableRpc(version),
		p_name: input.name,
		p_description: nullableRpc(input.description),
		p_links: input.links,
		p_price: nullableRpc(input.price),
		p_currency: input.currency,
		p_priority: input.priority,
		p_desired_quantity: input.desiredQuantity,
		p_status: input.status,
		p_image_path: nullableRpc(input.imagePath),
		p_category_ids: input.eventIds,
		p_calendar_change: input.calendarChange,
		p_calendar_event_id: nullableRpc(input.calendarEventId)
	});
	if (error) throwCommandError(error, 'No se pudo guardar el regalo.');
	return data;
}

export async function createWishlistItem(
	supabase: SupabaseClient<Database>,
	familyId: string,
	ownerId: string,
	input: WishlistItemInput
): Promise<string> {
	return saveWishlistItem(supabase, familyId, ownerId, null, null, input);
}

export async function updateWishlistItem(
	supabase: SupabaseClient<Database>,
	familyId: string,
	ownerId: string,
	itemId: string,
	version: number,
	input: WishlistItemInput
): Promise<void> {
	await saveWishlistItem(supabase, familyId, ownerId, itemId, version, input);
}

export async function deleteWishlistItem(
	supabase: SupabaseClient<Database>,
	ownerId: string,
	itemId: string
): Promise<string | null> {
	const { data, error } = await supabase
		.from('gift_items')
		.delete()
		.eq('id', itemId)
		.eq('owner_id', ownerId)
		.select('id, image_url')
		.maybeSingle();
	if (error) throwCommandError(error, 'No se pudo eliminar el regalo.');
	if (!data) throw new WishlistCommandError(404, 'El regalo no existe.');
	return data.image_url;
}

export async function reserveWishlistItem(
	supabase: SupabaseClient<Database>,
	itemId: string,
	quantity: number,
	status: WishlistReservationStatus
): Promise<void> {
	const { error } = await supabase.rpc('reserve_gift_item', {
		p_item_id: itemId,
		p_quantity: quantity,
		p_status: status
	});
	if (error) throwCommandError(error, 'No se pudo coordinar el regalo.');
}

export async function purchaseWishlistItem(
	supabase: SupabaseClient<Database>,
	itemId: string,
	quantity: number
): Promise<void> {
	const { error } = await supabase.rpc('purchase_gift_item', {
		p_item_id: itemId,
		p_quantity: quantity
	});
	if (error) throwCommandError(error, 'No se pudo marcar el regalo como comprado.');
}

export async function receiveWishlistItem(
	supabase: SupabaseClient<Database>,
	itemId: string,
	version: number
): Promise<void> {
	const { error } = await supabase.rpc('mark_gift_item_received', {
		p_item_id: itemId,
		p_version: version
	});
	if (error) throwCommandError(error, 'No se pudo marcar el regalo como recibido.');
}

export async function revealReceivedWishlistBuyers(
	supabase: SupabaseClient<Database>,
	itemId: string
) {
	const { data, error } = await supabase.rpc('reveal_received_gift_buyers', { p_item_id: itemId });
	if (error) throwCommandError(error, 'No se pudo revelar quién compró el regalo.');
	return data;
}

export async function releaseWishlistItem(
	supabase: SupabaseClient<Database>,
	itemId: string,
	type: WishlistCoordinationType
): Promise<void> {
	const { error } = await supabase.rpc('release_gift_item', {
		p_item_id: itemId,
		p_coordination_type: type
	});
	if (error) throwCommandError(error, 'No se pudo liberar la coordinación del regalo.');
}

export async function createWishlistComment(
	supabase: SupabaseClient<Database>,
	authorId: string,
	itemId: string,
	content: string
): Promise<void> {
	const { error } = await supabase.from('gift_item_comments').insert({
		item_id: itemId,
		author_id: authorId,
		content
	});
	if (error) throwCommandError(error, 'No se pudo crear el comentario.');
}

export async function deleteWishlistComment(
	supabase: SupabaseClient<Database>,
	authorId: string,
	commentId: string
): Promise<void> {
	const { data, error } = await supabase
		.from('gift_item_comments')
		.delete()
		.eq('id', commentId)
		.eq('author_id', authorId)
		.select('id')
		.maybeSingle();
	if (error) throwCommandError(error, 'No se pudo eliminar el comentario.');
	if (!data) throw new WishlistCommandError(404, 'El comentario no existe.');
}
