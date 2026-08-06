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
	if (error.code === '23514' || error.code === '22023')
		throw new WishlistCommandError(400, error.message || fallback);
	throw new WishlistCommandError(500, fallback);
}

async function validateEventIds(
	supabase: SupabaseClient<Database>,
	familyId: string,
	eventIds: string[]
): Promise<string[]> {
	const uniqueIds = [...new Set(eventIds)];
	if (uniqueIds.length === 0) return [];
	const { data, error } = await supabase
		.from('gift_event_categories')
		.select('id')
		.eq('family_id', familyId)
		.in('id', uniqueIds);
	if (error) throwCommandError(error, 'No se pudieron validar las categorías.');
	if ((data ?? []).length !== uniqueIds.length)
		throw new WishlistCommandError(400, 'Alguna categoría no pertenece a esta familia.');
	return uniqueIds;
}

async function replaceEventLinks(
	supabase: SupabaseClient<Database>,
	itemId: string,
	eventIds: string[]
): Promise<void> {
	const { error: deleteError } = await supabase
		.from('gift_item_events')
		.delete()
		.eq('item_id', itemId);
	if (deleteError) throwCommandError(deleteError, 'No se pudieron actualizar las categorías.');
	if (eventIds.length === 0) return;
	const { error: insertError } = await supabase.from('gift_item_events').insert(
		eventIds.map((eventCategoryId) => ({
			item_id: itemId,
			event_category_id: eventCategoryId
		}))
	);
	if (insertError) throwCommandError(insertError, 'No se pudieron actualizar las categorías.');
}

export async function createWishlistItem(
	supabase: SupabaseClient<Database>,
	familyId: string,
	ownerId: string,
	input: WishlistItemInput
): Promise<string> {
	const eventIds = await validateEventIds(supabase, familyId, input.eventIds);
	const { data: item, error } = await supabase
		.from('gift_items')
		.insert({
			family_id: familyId,
			owner_id: ownerId,
			name: input.name,
			description: input.description,
			links: input.links,
			price: input.price,
			currency: input.currency,
			priority: input.priority,
			desired_quantity: input.desiredQuantity,
			status: input.status,
			image_url: input.imagePath
		})
		.select('id')
		.single();
	if (error) throwCommandError(error, 'No se pudo crear el regalo.');

	try {
		await replaceEventLinks(supabase, item.id, eventIds);
	} catch (linkError) {
		await supabase.from('gift_items').delete().eq('id', item.id).eq('owner_id', ownerId);
		throw linkError;
	}

	return item.id;
}

export async function updateWishlistItem(
	supabase: SupabaseClient<Database>,
	familyId: string,
	ownerId: string,
	itemId: string,
	version: number,
	input: WishlistItemInput
): Promise<void> {
	const eventIds = await validateEventIds(supabase, familyId, input.eventIds);
	const { data: item, error } = await supabase
		.from('gift_items')
		.update({
			name: input.name,
			description: input.description,
			links: input.links,
			price: input.price,
			currency: input.currency,
			priority: input.priority,
			desired_quantity: input.desiredQuantity,
			status: input.status,
			image_url: input.imagePath
		})
		.eq('id', itemId)
		.eq('family_id', familyId)
		.eq('owner_id', ownerId)
		.eq('version', version)
		.select('id')
		.maybeSingle();
	if (error) throwCommandError(error, 'No se pudo actualizar el regalo.');
	if (!item)
		throw new WishlistCommandError(
			409,
			'El regalo cambió mientras lo editabas. Recarga la página e inténtalo de nuevo.'
		);
	await replaceEventLinks(supabase, itemId, eventIds);
}

export async function deleteWishlistItem(
	supabase: SupabaseClient<Database>,
	ownerId: string,
	itemId: string
): Promise<void> {
	const { data, error } = await supabase
		.from('gift_items')
		.delete()
		.eq('id', itemId)
		.eq('owner_id', ownerId)
		.select('id')
		.maybeSingle();
	if (error) throwCommandError(error, 'No se pudo eliminar el regalo.');
	if (!data) throw new WishlistCommandError(404, 'El regalo no existe.');
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
