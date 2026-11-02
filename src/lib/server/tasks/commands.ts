import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';
import type { TaskInput, TaskStatus } from './schemas';

export class TaskCommandError extends Error {
	constructor(
		public readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'TaskCommandError';
	}
}

function throwTaskCommandError(error: PostgrestError, fallback: string): never {
	if (error.code === '42501')
		throw new TaskCommandError(403, 'No tienes permiso para modificar esta tarea.');
	if (error.code === 'P0002') throw new TaskCommandError(404, 'La tarea ya no está disponible.');
	if (error.code === '40001' || error.code === 'PT409')
		throw new TaskCommandError(
			409,
			'La tarea cambió mientras la editabas. Recarga la página e inténtalo de nuevo.'
		);
	if (
		error.code === '23503' ||
		error.code === '23505' ||
		error.code === '23514' ||
		error.code === '22023'
	)
		throw new TaskCommandError(400, 'Los datos de la tarea no son válidos.');
	throw new TaskCommandError(500, fallback);
}

function nullableRpc<T>(value: T | null): T {
	return value as T;
}

function taskArgs(input: TaskInput) {
	return {
		p_group_id: nullableRpc(input.groupId),
		p_title: input.title,
		p_description: nullableRpc(input.description),
		p_due_on: nullableRpc(input.dueOn),
		p_priority: input.priority,
		p_assignee_ids: input.assigneeIds,
		p_mention_ids: input.mentionIds,
		p_recurrence_frequency: input.recurrenceFrequency,
		p_recurrence_interval: input.recurrenceInterval,
		p_recurrence_until: nullableRpc(input.recurrenceUntil)
	};
}

export async function createTaskGroup(
	supabase: SupabaseClient<Database>,
	familyId: string,
	name: string
): Promise<string> {
	const { data, error } = await supabase.rpc('create_task_group', {
		p_family_id: familyId,
		p_name: name
	});
	if (error) throwTaskCommandError(error, 'No se pudo crear el grupo.');
	return data;
}

export async function createFamilyTask(
	supabase: SupabaseClient<Database>,
	familyId: string,
	input: TaskInput
): Promise<string> {
	const { data, error } = await supabase.rpc('create_family_task', {
		p_family_id: familyId,
		...taskArgs(input)
	});
	if (error) throwTaskCommandError(error, 'No se pudo crear la tarea.');
	return data;
}

export async function updateFamilyTask(
	supabase: SupabaseClient<Database>,
	taskId: string,
	version: number,
	input: TaskInput
): Promise<void> {
	const { error } = await supabase.rpc('update_family_task', {
		p_task_id: taskId,
		p_version: version,
		...taskArgs(input)
	});
	if (error) throwTaskCommandError(error, 'No se pudo actualizar la tarea.');
}

export async function setFamilyTaskStatus(
	supabase: SupabaseClient<Database>,
	taskId: string,
	version: number,
	status: TaskStatus
): Promise<number> {
	const { data, error } = await supabase.rpc('set_family_task_status', {
		p_task_id: taskId,
		p_version: version,
		p_status: status
	});
	if (error) throwTaskCommandError(error, 'No se pudo cambiar el estado de la tarea.');
	return data;
}
