export const TASK_LIMITS = {
	title: 160,
	description: 4_000,
	groupName: 80,
	maxPeople: 100
} as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TaskStatus = 'todo' | 'in_progress' | 'completed' | 'cancelled';
export type TaskRecurrence = 'none' | 'daily' | 'weekly' | 'monthly';
export type TaskView = 'mine' | 'family' | 'overdue' | 'upcoming';
export type TaskValidationErrors = Record<string, string>;
export type TaskValidationResult<T> =
	| { success: true; data: T }
	| { success: false; errors: TaskValidationErrors };

export interface TaskInput {
	groupId: string | null;
	title: string;
	description: string | null;
	dueOn: string | null;
	priority: TaskPriority;
	assigneeIds: string[];
	mentionIds: string[];
	recurrenceFrequency: TaskRecurrence;
	recurrenceInterval: number;
	recurrenceUntil: string | null;
}

export interface TaskIdentity {
	taskId: string;
	version: number;
}

function textValue(formData: FormData, field: string): string {
	const value = formData.get(field);
	return typeof value === 'string' ? value.trim() : '';
}

function isUuid(value: string): boolean {
	return UUID_PATTERN.test(value);
}

function isDate(value: string): boolean {
	if (!DATE_PATTERN.test(value)) return false;
	const [year, month, day] = value.split('-').map(Number);
	const parsed = new Date(Date.UTC(year, month - 1, day));
	return (
		parsed.getUTCFullYear() === year &&
		parsed.getUTCMonth() === month - 1 &&
		parsed.getUTCDate() === day
	);
}

function uniqueIds(formData: FormData, field: string): string[] {
	return [
		...new Set(
			formData
				.getAll(field)
				.filter((value): value is string => typeof value === 'string' && value.length > 0)
		)
	];
}

export function parseTaskView(searchParams: URLSearchParams): TaskView {
	const view = searchParams.get('view');
	return view === 'family' || view === 'overdue' || view === 'upcoming' ? view : 'mine';
}

export function parseTaskGroupForm(formData: FormData): TaskValidationResult<{ name: string }> {
	const name = textValue(formData, 'name');
	const errors: TaskValidationErrors = {};
	if (!name) errors.name = 'El nombre del grupo es obligatorio.';
	else if (name.length > TASK_LIMITS.groupName)
		errors.name = `El nombre no puede superar ${TASK_LIMITS.groupName} caracteres.`;
	return Object.keys(errors).length > 0
		? { success: false, errors }
		: { success: true, data: { name } };
}

export function parseTaskForm(
	formData: FormData,
	validMemberIds: ReadonlySet<string>,
	validGroupIds: ReadonlySet<string>
): TaskValidationResult<TaskInput> {
	const errors: TaskValidationErrors = {};
	const groupId = textValue(formData, 'group_id');
	const title = textValue(formData, 'title');
	const description = textValue(formData, 'description');
	const dueOn = textValue(formData, 'due_on');
	const priority = textValue(formData, 'priority') || 'normal';
	const assigneeIds = uniqueIds(formData, 'assignee_ids');
	const mentionIds = uniqueIds(formData, 'mention_ids');
	const recurrenceFrequency = textValue(formData, 'recurrence_frequency') || 'none';
	const recurrenceInterval = Number(textValue(formData, 'recurrence_interval') || '1');
	const recurrenceUntil = textValue(formData, 'recurrence_until');

	if (!title) errors.title = 'El título es obligatorio.';
	else if (title.length > TASK_LIMITS.title)
		errors.title = `El título no puede superar ${TASK_LIMITS.title} caracteres.`;
	if (description.length > TASK_LIMITS.description)
		errors.description = `La descripción no puede superar ${TASK_LIMITS.description} caracteres.`;
	if (groupId && (!isUuid(groupId) || !validGroupIds.has(groupId)))
		errors.group_id = 'El grupo no pertenece a esta familia.';
	if (dueOn && !isDate(dueOn)) errors.due_on = 'La fecha de vencimiento no es válida.';
	if (!['low', 'normal', 'high', 'urgent'].includes(priority))
		errors.priority = 'La prioridad seleccionada no es válida.';

	for (const [field, ids] of [
		['assignee_ids', assigneeIds],
		['mention_ids', mentionIds]
	] as const) {
		if (ids.length > TASK_LIMITS.maxPeople)
			errors[field] = 'Se han seleccionado demasiadas personas.';
		else if (ids.some((id) => !isUuid(id) || !validMemberIds.has(id)))
			errors[field] = 'Todas las personas deben pertenecer a la familia.';
	}

	if (!['none', 'daily', 'weekly', 'monthly'].includes(recurrenceFrequency))
		errors.recurrence_frequency = 'La repetición seleccionada no es válida.';
	if (!Number.isInteger(recurrenceInterval) || recurrenceInterval < 1 || recurrenceInterval > 30)
		errors.recurrence_interval = 'El intervalo debe estar entre 1 y 30.';
	if (recurrenceFrequency !== 'none') {
		if (!dueOn) errors.due_on = 'Las tareas repetidas necesitan una fecha de vencimiento.';
		if (!isDate(recurrenceUntil)) errors.recurrence_until = 'Indica hasta cuándo se repite.';
		else if (dueOn && recurrenceUntil < dueOn)
			errors.recurrence_until = 'La repetición no puede terminar antes del vencimiento.';
		else if (dueOn) {
			const maximum = new Date(`${dueOn}T00:00:00Z`);
			maximum.setUTCDate(maximum.getUTCDate() + 730);
			if (new Date(`${recurrenceUntil}T00:00:00Z`) > maximum)
				errors.recurrence_until = 'La repetición no puede superar dos años.';
		}
	}

	if (Object.keys(errors).length > 0) return { success: false, errors };
	return {
		success: true,
		data: {
			groupId: groupId || null,
			title,
			description: description || null,
			dueOn: dueOn || null,
			priority: priority as TaskPriority,
			assigneeIds,
			mentionIds,
			recurrenceFrequency: recurrenceFrequency as TaskRecurrence,
			recurrenceInterval,
			recurrenceUntil: recurrenceFrequency === 'none' ? null : recurrenceUntil
		}
	};
}

export function parseTaskIdentity(formData: FormData): TaskValidationResult<TaskIdentity> {
	const taskId = textValue(formData, 'task_id');
	const version = Number(textValue(formData, 'version'));
	const errors: TaskValidationErrors = {};
	if (!isUuid(taskId)) errors.task_id = 'La tarea seleccionada no es válida.';
	if (!Number.isSafeInteger(version) || version < 1)
		errors.version = 'La versión de la tarea no es válida.';
	return Object.keys(errors).length > 0
		? { success: false, errors }
		: { success: true, data: { taskId, version } };
}

export function parseTaskStatus(
	formData: FormData
): TaskValidationResult<TaskIdentity & { status: TaskStatus }> {
	const identity = parseTaskIdentity(formData);
	if (!identity.success) return identity;
	const status = textValue(formData, 'status');
	if (!['todo', 'in_progress', 'completed', 'cancelled'].includes(status)) {
		return { success: false, errors: { status: 'El estado seleccionado no es válido.' } };
	}
	return { success: true, data: { ...identity.data, status: status as TaskStatus } };
}
