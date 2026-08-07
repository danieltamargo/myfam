import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireModuleAvailable } from '$lib/server/modules/availability';
import {
	archiveFamilyHabit,
	createFamilyHabit,
	HabitCommandError,
	setFamilyHabitCompletion
} from '$lib/server/habits/commands';
import { loadHabitFormContext, loadHabitPage, HabitQueryError } from '$lib/server/habits/queries';
import {
	parseHabitCompletion,
	parseHabitForm,
	parseHabitId,
	type HabitValidationErrors
} from '$lib/server/habits/schemas';

function invalidForm(errors: HabitValidationErrors) {
	return fail(400, {
		error: Object.values(errors)[0] ?? 'Los datos enviados no son válidos.',
		fieldErrors: errors
	});
}

function commandFailure(caught: unknown, fallback: string) {
	if (caught instanceof HabitCommandError) return fail(caught.status, { error: caught.message });
	if (caught instanceof HabitQueryError) return fail(500, { error: caught.message });
	console.error(fallback, caught);
	return fail(500, { error: fallback });
}

export const load: PageServerLoad = async ({ params, locals: { supabase, safeGetSession } }) => {
	requireModuleAvailable('habits');
	const { user } = await safeGetSession();
	if (!user) throw error(401, 'Unauthorized');
	try {
		return {
			...(await loadHabitPage(supabase, params.familyId, user.id)),
			familyId: params.familyId,
			currentUserId: user.id
		};
	} catch (caught) {
		if (caught instanceof HabitQueryError) console.error(caught.message);
		else console.error('Unexpected habit query failure', caught);
		throw error(500, 'No se pudieron cargar los hábitos.');
	}
};

export const actions: Actions = {
	createHabit: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		try {
			const [formData, memberIds] = await Promise.all([
				request.formData(),
				loadHabitFormContext(supabase, params.familyId)
			]);
			const parsed = parseHabitForm(formData, memberIds, user.id);
			if (!parsed.success) return invalidForm(parsed.errors);
			const habitId = await createFamilyHabit(supabase, params.familyId, parsed.data);
			return { success: true, message: 'Hábito creado.', habitId };
		} catch (caught) {
			return commandFailure(caught, 'No se pudo crear el hábito.');
		}
	},

	setCompletion: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		const parsed = parseHabitCompletion(await request.formData());
		if (!parsed.success) return invalidForm(parsed.errors);
		try {
			await setFamilyHabitCompletion(
				supabase,
				parsed.data.habitId,
				parsed.data.completedOn,
				parsed.data.completed
			);
			return {
				success: true,
				message: parsed.data.completed ? 'Día registrado.' : 'Día desmarcado.'
			};
		} catch (caught) {
			return commandFailure(caught, 'No se pudo registrar el día.');
		}
	},

	archiveHabit: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		const parsed = parseHabitId(await request.formData());
		if (!parsed.success) return invalidForm(parsed.errors);
		try {
			await archiveFamilyHabit(supabase, parsed.data.habitId);
			return { success: true, message: 'Hábito archivado.' };
		} catch (caught) {
			return commandFailure(caught, 'No se pudo archivar el hábito.');
		}
	}
};
