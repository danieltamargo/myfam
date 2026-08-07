import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { guardModuleActions, requireModuleAvailable } from '$lib/server/modules/availability';
import {
	createFamilyDocument,
	deleteFamilyDocument,
	DocumentCommandError,
	prepareFamilyDocumentDownload,
	updateFamilyDocumentAccess
} from '$lib/server/documents/commands';
import { DocumentFileError, validateDocumentFile } from '$lib/server/documents/files';
import {
	loadDocumentDownloadName,
	loadDocumentFormContext,
	loadDocumentPage,
	DocumentQueryError
} from '$lib/server/documents/queries';
import {
	parseDocumentAccessForm,
	parseDocumentId,
	parseDocumentIdentity,
	parseDocumentPageQuery,
	parseDocumentUploadForm,
	type DocumentValidationErrors
} from '$lib/server/documents/schemas';

function invalidForm(errors: DocumentValidationErrors) {
	return fail(400, {
		error: Object.values(errors)[0] ?? 'Los datos enviados no son válidos.',
		fieldErrors: errors
	});
}

function commandFailure(caught: unknown, fallback: string) {
	if (caught instanceof DocumentCommandError || caught instanceof DocumentFileError)
		return fail(caught.status, { error: caught.message });
	if (caught instanceof DocumentQueryError) return fail(500, { error: caught.message });
	console.error(fallback, caught);
	return fail(500, { error: fallback });
}

export const load: PageServerLoad = async ({
	url,
	params,
	locals: { supabase, safeGetSession }
}) => {
	await requireModuleAvailable(supabase, params.familyId, 'documents');
	const { user } = await safeGetSession();
	if (!user) throw error(401, 'Unauthorized');
	const query = parseDocumentPageQuery(url.searchParams);
	try {
		return {
			...(await loadDocumentPage(supabase, params.familyId, user.id, query.folder, query.cursor)),
			familyId: params.familyId,
			currentUserId: user.id
		};
	} catch (caught) {
		if (caught instanceof DocumentQueryError) console.error(caught.message);
		else console.error('Unexpected document query failure', caught);
		throw error(500, 'No se pudieron cargar los documentos.');
	}
};

const moduleActions: Actions = {
	uploadDocument: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		try {
			const formData = await request.formData();
			const [validMemberIds, validatedFile] = await Promise.all([
				loadDocumentFormContext(supabase, params.familyId),
				validateDocumentFile(formData)
			]);
			const parsed = parseDocumentUploadForm(formData, validMemberIds, user.id);
			if (!parsed.success) return invalidForm(parsed.errors);
			const documentId = await createFamilyDocument(
				supabase,
				params.familyId,
				parsed.data,
				validatedFile
			);
			return { success: true, message: 'Documento privado subido.', documentId };
		} catch (caught) {
			return commandFailure(caught, 'No se pudo subir el documento.');
		}
	},

	updateAccess: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		try {
			const formData = await request.formData();
			const [identity, validMemberIds] = await Promise.all([
				Promise.resolve(parseDocumentIdentity(formData)),
				loadDocumentFormContext(supabase, params.familyId)
			]);
			if (!identity.success) return invalidForm(identity.errors);
			const parsed = parseDocumentAccessForm(formData, validMemberIds, user.id);
			if (!parsed.success) return invalidForm(parsed.errors);
			await updateFamilyDocumentAccess(
				supabase,
				identity.data.documentId,
				identity.data.version,
				parsed.data
			);
			return { success: true, message: 'Privacidad y carpeta actualizadas.' };
		} catch (caught) {
			return commandFailure(caught, 'No se pudieron actualizar los permisos.');
		}
	},

	downloadDocument: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		let signedUrl: string;
		try {
			const parsed = parseDocumentId(await request.formData());
			if (!parsed.success) return invalidForm(parsed.errors);
			const downloadName = await loadDocumentDownloadName(supabase, parsed.data.documentId);
			signedUrl = await prepareFamilyDocumentDownload(
				supabase,
				parsed.data.documentId,
				downloadName
			);
		} catch (caught) {
			return commandFailure(caught, 'No se pudo descargar el documento.');
		}
		throw redirect(303, signedUrl);
	},

	deleteDocument: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		const identity = parseDocumentIdentity(await request.formData());
		if (!identity.success) return invalidForm(identity.errors);
		try {
			await deleteFamilyDocument(supabase, identity.data.documentId, identity.data.version);
			return { success: true, message: 'Documento borrado de forma permanente.' };
		} catch (caught) {
			return commandFailure(caught, 'No se pudo borrar el documento.');
		}
	}
};

export const actions: Actions = guardModuleActions('documents', moduleActions);
