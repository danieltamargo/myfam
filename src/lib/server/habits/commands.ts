import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';
import type { HabitInput } from './schemas';

export class HabitCommandError extends Error {
	constructor(
		public readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'HabitCommandError';
	}
}

function throwHabitCommandError(error: PostgrestError, fallback: string): never {
	if (error.code === '42501')
		throw new HabitCommandError(403, 'Solo quien creó el hábito puede modificarlo.');
	if (error.code === 'P0002') throw new HabitCommandError(404, 'El hábito ya no está disponible.');
	if (['23503', '23505', '23514', '22023', '22P02'].includes(error.code))
		throw new HabitCommandError(400, 'Los datos del hábito no son válidos.');
	throw new HabitCommandError(500, fallback);
}

function nullableRpc<T>(value: T | null): T {
	return value as T;
}

export async function createFamilyHabit(
	supabase: SupabaseClient<Database>,
	familyId: string,
	input: HabitInput
): Promise<string> {
	const { data, error } = await supabase.rpc('create_family_habit', {
		p_family_id: familyId,
		p_title: input.title,
		p_description: nullableRpc(input.description),
		p_visibility: input.visibility,
		p_member_ids: input.memberIds,
		p_start_on: input.startOn
	});
	if (error) throwHabitCommandError(error, 'No se pudo crear el hábito.');
	return data;
}

export async function setFamilyHabitCompletion(
	supabase: SupabaseClient<Database>,
	habitId: string,
	completedOn: string,
	completed: boolean
): Promise<boolean> {
	const { data, error } = await supabase.rpc('set_family_habit_completion', {
		p_habit_id: habitId,
		p_completed_on: completedOn,
		p_completed: completed
	});
	if (error) throwHabitCommandError(error, 'No se pudo registrar el día.');
	return data;
}

export async function archiveFamilyHabit(
	supabase: SupabaseClient<Database>,
	habitId: string
): Promise<void> {
	const { error } = await supabase.rpc('archive_family_habit', { p_habit_id: habitId });
	if (error) throwHabitCommandError(error, 'No se pudo archivar el hábito.');
}
