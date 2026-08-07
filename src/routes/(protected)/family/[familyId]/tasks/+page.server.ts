import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { guardModuleActions, requireModuleAvailable } from '$lib/server/modules/availability';
import {
	createFamilyTask,
	createTaskGroup,
	setFamilyTaskStatus,
	TaskCommandError,
	updateFamilyTask
} from '$lib/server/tasks/commands';
import { loadTaskFormContext, loadTaskPage, TaskQueryError } from '$lib/server/tasks/queries';
import {
	parseTaskForm,
	parseTaskGroupForm,
	parseTaskIdentity,
	parseTaskStatus,
	parseTaskView,
	type TaskValidationErrors
} from '$lib/server/tasks/schemas';

function invalidForm(errors: TaskValidationErrors) {
	return fail(400, {
		error: Object.values(errors)[0] ?? 'Los datos enviados no son válidos.',
		fieldErrors: errors
	});
}

function commandFailure(caught: unknown, fallback: string) {
	if (caught instanceof TaskCommandError) return fail(caught.status, { error: caught.message });
	if (caught instanceof TaskQueryError) return fail(500, { error: caught.message });
	console.error(fallback, caught);
	return fail(500, { error: fallback });
}

export const load: PageServerLoad = async ({
	parent,
	url,
	params,
	locals: { supabase, safeGetSession }
}) => {
	await requireModuleAvailable(supabase, params.familyId, 'tasks');
	const { user } = await safeGetSession();
	if (!user) throw error(401, 'Unauthorized');
	const { userRole } = await parent();
	try {
		return {
			...(await loadTaskPage(
				supabase,
				params.familyId,
				user.id,
				userRole,
				parseTaskView(url.searchParams)
			)),
			familyId: params.familyId
		};
	} catch (caught) {
		if (caught instanceof TaskQueryError) console.error(caught.message);
		else console.error('Unexpected task query failure', caught);
		throw error(500, 'No se pudieron cargar las tareas.');
	}
};

async function parseTaskRequest(
	request: Request,
	supabase: Parameters<typeof loadTaskFormContext>[0],
	familyId: string
) {
	const [formData, context] = await Promise.all([
		request.formData(),
		loadTaskFormContext(supabase, familyId)
	]);
	return {
		formData,
		parsed: parseTaskForm(formData, context.memberIds, context.groupIds)
	};
}

const moduleActions: Actions = {
	createGroup: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		const parsed = parseTaskGroupForm(await request.formData());
		if (!parsed.success) return invalidForm(parsed.errors);
		try {
			await createTaskGroup(supabase, params.familyId, parsed.data.name);
			return { success: true, message: 'Grupo creado.' };
		} catch (caught) {
			return commandFailure(caught, 'No se pudo crear el grupo.');
		}
	},

	createTask: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		try {
			const { parsed } = await parseTaskRequest(request, supabase, params.familyId);
			if (!parsed.success) return invalidForm(parsed.errors);
			const taskId = await createFamilyTask(supabase, params.familyId, parsed.data);
			return { success: true, message: 'Tarea creada.', taskId };
		} catch (caught) {
			return commandFailure(caught, 'No se pudo crear la tarea.');
		}
	},

	updateTask: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		try {
			const { formData, parsed } = await parseTaskRequest(request, supabase, params.familyId);
			const identity = parseTaskIdentity(formData);
			if (!identity.success) return invalidForm(identity.errors);
			if (!parsed.success) return invalidForm(parsed.errors);
			await updateFamilyTask(supabase, identity.data.taskId, identity.data.version, parsed.data);
			return { success: true, message: 'Tarea actualizada.' };
		} catch (caught) {
			return commandFailure(caught, 'No se pudo actualizar la tarea.');
		}
	},

	setStatus: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		const parsed = parseTaskStatus(await request.formData());
		if (!parsed.success) return invalidForm(parsed.errors);
		try {
			await setFamilyTaskStatus(
				supabase,
				parsed.data.taskId,
				parsed.data.version,
				parsed.data.status
			);
			return {
				success: true,
				message: parsed.data.status === 'completed' ? 'Tarea completada.' : 'Estado actualizado.'
			};
		} catch (caught) {
			return commandFailure(caught, 'No se pudo cambiar el estado de la tarea.');
		}
	}
};

export const actions: Actions = guardModuleActions('tasks', moduleActions);
