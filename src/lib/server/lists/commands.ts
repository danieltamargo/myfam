import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';
import type { FamilyListInput, FamilyListItemInput } from './schemas';

export class ListCommandError extends Error {
	constructor(
		public readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'ListCommandError';
	}
}

function throwListCommandError(error: PostgrestError, fallback: string): never {
	if (error.code === '42501')
		throw new ListCommandError(403, 'No tienes permiso para modificar esta lista.');
	if (error.code === 'P0002')
		throw new ListCommandError(404, 'La lista o el artículo ya no están disponibles.');
	if (error.code === '40001' || error.code === 'PT409')
		throw new ListCommandError(
			409,
			'La lista cambió mientras la usabas. Se recargará para conservar los cambios.'
		);
	if (
		error.code === '23503' ||
		error.code === '23505' ||
		error.code === '23514' ||
		error.code === '22023'
	)
		throw new ListCommandError(400, 'Los datos de la lista no son válidos.');
	throw new ListCommandError(500, fallback);
}

function nullableRpc<T>(value: T | null): T {
	return value as T;
}

export async function createFamilyList(
	supabase: SupabaseClient<Database>,
	familyId: string,
	input: FamilyListInput
): Promise<string> {
	const { data, error } = await supabase.rpc('create_typed_family_list', {
		p_family_id: familyId,
		p_title: input.title,
		p_description: nullableRpc(input.description),
		p_visibility: input.visibility,
		p_member_ids: input.memberIds,
		p_list_type: input.listType,
		p_source_list_id: nullableRpc(input.sourceListId)
	});
	if (error) throwListCommandError(error, 'No se pudo crear la lista.');
	return data;
}

export async function setFamilyListType(
	supabase: SupabaseClient<Database>,
	listId: string,
	version: number,
	listType: string
): Promise<void> {
	const { error } = await supabase.rpc('set_family_list_type', {
		p_list_id: listId,
		p_version: version,
		p_list_type: listType
	});
	if (error) throwListCommandError(error, 'No se pudo cambiar el tipo de lista.');
}

export async function addFamilyListItem(
	supabase: SupabaseClient<Database>,
	listId: string,
	input: FamilyListItemInput
): Promise<string> {
	const { data, error } = await supabase.rpc('add_family_list_item', {
		p_list_id: listId,
		p_title: input.title,
		p_quantity: input.quantity,
		p_unit: nullableRpc(input.unit)
	});
	if (error) throwListCommandError(error, 'No se pudo añadir el artículo.');
	return data;
}

export async function setFamilyListItemCompleted(
	supabase: SupabaseClient<Database>,
	itemId: string,
	version: number,
	completed: boolean
): Promise<number> {
	const { data, error } = await supabase.rpc('set_family_list_item_completed', {
		p_item_id: itemId,
		p_version: version,
		p_completed: completed
	});
	if (error) throwListCommandError(error, 'No se pudo actualizar el artículo.');
	return data;
}

export async function deleteFamilyListItem(
	supabase: SupabaseClient<Database>,
	itemId: string,
	version: number
): Promise<void> {
	const { error } = await supabase.rpc('delete_family_list_item', {
		p_item_id: itemId,
		p_version: version
	});
	if (error) throwListCommandError(error, 'No se pudo eliminar el artículo.');
}
