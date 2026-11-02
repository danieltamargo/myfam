import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { guardModuleActions, requireModuleAvailable } from '$lib/server/modules/availability';
import {
	createFamilyNote,
	NoteCommandError,
	setFamilyNoteArchived,
	updateFamilyNote
} from '$lib/server/notes/commands';
import { loadNoteFormContext, loadNotePage, NoteQueryError } from '$lib/server/notes/queries';
import {
	parseMemberFilter,
	parseFamilyNoteForm,
	parseNoteFilter,
	parseNoteIdentity,
	type NoteValidationErrors
} from '$lib/server/notes/schemas';

function invalidForm(errors: NoteValidationErrors) {
	return fail(400, {
		error: Object.values(errors)[0] ?? 'Los datos enviados no son válidos.',
		fieldErrors: errors
	});
}

function commandFailure(caught: unknown, fallback: string) {
	if (caught instanceof NoteCommandError) return fail(caught.status, { error: caught.message });
	if (caught instanceof NoteQueryError) return fail(500, { error: caught.message });
	console.error(fallback, caught);
	return fail(500, { error: fallback });
}

export const load: PageServerLoad = async ({
	url,
	params,
	locals: { supabase, safeGetSession }
}) => {
	await requireModuleAvailable(supabase, params.familyId, 'notes');
	const { user } = await safeGetSession();
	if (!user) throw error(401, 'Unauthorized');
	const { filter, search, noteId } = parseNoteFilter(url.searchParams);
	try {
		return {
			...(await loadNotePage(
				supabase,
				params.familyId,
				user.id,
				filter,
				search,
				noteId,
				parseMemberFilter(url.searchParams)
			)),
			familyId: params.familyId,
			currentUserId: user.id
		};
	} catch (caught) {
		if (caught instanceof NoteQueryError) console.error(caught.message);
		else console.error('Unexpected note query failure', caught);
		throw error(500, 'No se pudieron cargar las notas.');
	}
};

async function parseNoteRequest(
	request: Request,
	supabase: Parameters<typeof loadNoteFormContext>[0],
	familyId: string,
	userId: string
) {
	const [formData, memberIds] = await Promise.all([
		request.formData(),
		loadNoteFormContext(supabase, familyId)
	]);
	return {
		formData,
		parsed: parseFamilyNoteForm(formData, memberIds, userId)
	};
}

const moduleActions: Actions = {
	createNote: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		try {
			const { parsed } = await parseNoteRequest(request, supabase, params.familyId, user.id);
			if (!parsed.success) return invalidForm(parsed.errors);
			const noteId = await createFamilyNote(supabase, params.familyId, parsed.data);
			return { success: true, message: 'Nota creada.', noteId };
		} catch (caught) {
			return commandFailure(caught, 'No se pudo crear la nota.');
		}
	},

	updateNote: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		try {
			const { formData, parsed } = await parseNoteRequest(
				request,
				supabase,
				params.familyId,
				user.id
			);
			const identity = parseNoteIdentity(formData);
			if (!identity.success) return invalidForm(identity.errors);
			if (!parsed.success) return invalidForm(parsed.errors);
			await updateFamilyNote(supabase, identity.data.noteId, identity.data.version, parsed.data);
			return { success: true, message: 'Nota actualizada.' };
		} catch (caught) {
			return commandFailure(caught, 'No se pudo actualizar la nota.');
		}
	},

	setArchived: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		const formData = await request.formData();
		const identity = parseNoteIdentity(formData);
		if (!identity.success) return invalidForm(identity.errors);
		const archived = formData.get('archived') === 'true';
		try {
			await setFamilyNoteArchived(supabase, identity.data.noteId, identity.data.version, archived);
			return {
				success: true,
				message: archived ? 'Nota archivada.' : 'Nota restaurada.'
			};
		} catch (caught) {
			return commandFailure(caught, 'No se pudo cambiar el archivo de la nota.');
		}
	}
};

export const actions: Actions = guardModuleActions('notes', moduleActions);
