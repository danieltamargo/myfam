export const HABIT_LIMITS = { title: 120, description: 2_000, maxMembers: 100 } as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type HabitVisibility = 'private' | 'selected_members';
export type HabitValidationErrors = Record<string, string>;
export type HabitValidationResult<T> =
	| { success: true; data: T }
	| { success: false; errors: HabitValidationErrors };

export interface HabitInput {
	title: string;
	description: string | null;
	visibility: HabitVisibility;
	memberIds: string[];
	startOn: string;
}

function textValue(formData: FormData, field: string): string {
	const value = formData.get(field);
	return typeof value === 'string' ? value.trim() : '';
}

function isIsoDate(value: string): boolean {
	if (!ISO_DATE_PATTERN.test(value)) return false;
	const [year, month, day] = value.split('-').map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));
	return (
		date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
	);
}

function addDays(value: string, days: number): string {
	const [year, month, day] = value.split('-').map(Number);
	return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function habitWeek(today = new Date()): string[] {
	const todayIso = today.toISOString().slice(0, 10);
	return Array.from({ length: 7 }, (_, index) => addDays(todayIso, index - 6));
}

export function parseHabitForm(
	formData: FormData,
	validMemberIds: ReadonlySet<string>,
	currentUserId: string,
	today = new Date()
): HabitValidationResult<HabitInput> {
	const errors: HabitValidationErrors = {};
	const title = textValue(formData, 'title');
	const description = textValue(formData, 'description').replaceAll('\r\n', '\n');
	const visibility = textValue(formData, 'visibility');
	const startOn = textValue(formData, 'start_on');
	const memberIds = [
		...new Set(
			formData
				.getAll('member_ids')
				.filter((value): value is string => typeof value === 'string' && value !== currentUserId)
		)
	];
	const todayIso = today.toISOString().slice(0, 10);

	if (!title || title.length > HABIT_LIMITS.title)
		errors.title = `El título debe tener entre 1 y ${HABIT_LIMITS.title} caracteres.`;
	if (description.length > HABIT_LIMITS.description)
		errors.description = `La descripción no puede superar ${HABIT_LIMITS.description} caracteres.`;
	if (visibility !== 'private' && visibility !== 'selected_members')
		errors.visibility = 'La privacidad seleccionada no es válida.';
	if (!isIsoDate(startOn) || startOn < addDays(todayIso, -366) || startOn > addDays(todayIso, 30))
		errors.start_on = 'La fecha de inicio debe estar entre hace un año y dentro de 30 días.';
	if (
		memberIds.length > HABIT_LIMITS.maxMembers ||
		memberIds.some((id) => !UUID_PATTERN.test(id) || !validMemberIds.has(id))
	)
		errors.member_ids = 'Todos los participantes deben pertenecer a la familia.';
	if (visibility === 'selected_members' && memberIds.length === 0)
		errors.member_ids = 'Selecciona al menos a otra persona para compartir el hábito.';

	return Object.keys(errors).length > 0
		? { success: false, errors }
		: {
				success: true,
				data: {
					title,
					description: description || null,
					visibility: visibility as HabitVisibility,
					memberIds: visibility === 'private' ? [] : memberIds,
					startOn
				}
			};
}

export function parseHabitCompletion(
	formData: FormData,
	today = new Date()
): HabitValidationResult<{ habitId: string; completedOn: string; completed: boolean }> {
	const errors: HabitValidationErrors = {};
	const habitId = textValue(formData, 'habit_id');
	const completedOn = textValue(formData, 'completed_on');
	const completedValue = textValue(formData, 'completed');
	const todayIso = today.toISOString().slice(0, 10);
	if (!UUID_PATTERN.test(habitId)) errors.habit_id = 'El hábito seleccionado no es válido.';
	if (!isIsoDate(completedOn) || completedOn < addDays(todayIso, -366) || completedOn > todayIso)
		errors.completed_on = 'Solo puedes registrar días pasados o el día de hoy.';
	if (completedValue !== 'true' && completedValue !== 'false')
		errors.completed = 'El estado enviado no es válido.';
	return Object.keys(errors).length > 0
		? { success: false, errors }
		: { success: true, data: { habitId, completedOn, completed: completedValue === 'true' } };
}

export function parseHabitId(formData: FormData): HabitValidationResult<{ habitId: string }> {
	const habitId = textValue(formData, 'habit_id');
	return UUID_PATTERN.test(habitId)
		? { success: true, data: { habitId } }
		: { success: false, errors: { habit_id: 'El hábito seleccionado no es válido.' } };
}
