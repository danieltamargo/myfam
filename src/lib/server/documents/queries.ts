import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '$lib/types/database';
import { DOCUMENT_LIMITS, type DocumentVisibility } from './schemas';

export class DocumentQueryError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'DocumentQueryError';
	}
}

export interface DocumentMember {
	id: string;
	displayName: string;
	avatarUrl: string | null;
}

export interface FamilyDocumentRecord extends Omit<Tables<'family_documents'>, 'visibility'> {
	visibility: DocumentVisibility;
	memberIds: string[];
	ownerName: string;
	canManage: boolean;
}

export interface DocumentPageData {
	members: DocumentMember[];
	documents: FamilyDocumentRecord[];
	folders: string[];
	selectedFolder: string | null;
	nextCursor: string | null;
}

function assertQuery(error: { message: string } | null, message: string): void {
	if (error) throw new DocumentQueryError(`${message}: ${error.message}`);
}

export async function loadDocumentFormContext(
	supabase: SupabaseClient<Database>,
	familyId: string
): Promise<Set<string>> {
	const { data, error } = await supabase
		.from('family_members')
		.select('user_id')
		.eq('family_id', familyId);
	assertQuery(error, 'No se pudieron validar los miembros');
	return new Set(
		(data ?? []).map((member) => member.user_id).filter((id): id is string => Boolean(id))
	);
}

export async function loadDocumentDownloadName(
	supabase: SupabaseClient<Database>,
	documentId: string
): Promise<string> {
	const { data, error } = await supabase
		.from('family_documents')
		.select('original_name')
		.eq('id', documentId)
		.single();
	assertQuery(error, 'No se pudo cargar el documento');
	if (!data) throw new DocumentQueryError('El documento ya no está disponible.');
	return data.original_name;
}

export async function loadDocumentPage(
	supabase: SupabaseClient<Database>,
	familyId: string,
	userId: string,
	selectedFolder: string | null,
	cursor: string | null
): Promise<DocumentPageData> {
	let documentsQuery = supabase
		.from('family_documents')
		.select(
			'id, family_id, owner_id, display_name, original_name, mime_type, size_bytes, storage_path, folder_name, visibility, expires_at, status, version, created_at, updated_at'
		)
		.eq('family_id', familyId)
		.eq('status', 'active')
		.order('updated_at', { ascending: false })
		.order('id', { ascending: false })
		.limit(DOCUMENT_LIMITS.pageSize + 1);
	if (selectedFolder) documentsQuery = documentsQuery.eq('folder_name', selectedFolder);
	if (cursor) documentsQuery = documentsQuery.lt('updated_at', cursor);

	const [membersResult, documentsResult, foldersResult] = await Promise.all([
		supabase.from('family_members').select('user_id').eq('family_id', familyId).order('joined_at'),
		documentsQuery,
		supabase
			.from('family_documents')
			.select('folder_name')
			.eq('family_id', familyId)
			.eq('status', 'active')
			.not('folder_name', 'is', null)
			.limit(500)
	]);
	assertQuery(membersResult.error, 'No se pudieron cargar los miembros');
	assertQuery(documentsResult.error, 'No se pudieron cargar los documentos');
	assertQuery(foldersResult.error, 'No se pudieron cargar las carpetas');

	const profileIds = (membersResult.data ?? [])
		.map((member) => member.user_id)
		.filter((id): id is string => Boolean(id));
	const allRows = documentsResult.data ?? [];
	const hasNextPage = allRows.length > DOCUMENT_LIMITS.pageSize;
	const rows = allRows.slice(0, DOCUMENT_LIMITS.pageSize);
	const documentIds = rows.map((document) => document.id);
	const [profilesResult, readersResult] = await Promise.all([
		profileIds.length
			? supabase.from('public_profiles').select('id, display_name, avatar_url').in('id', profileIds)
			: Promise.resolve({ data: [], error: null }),
		documentIds.length
			? supabase
					.from('family_document_members')
					.select('document_id, user_id')
					.in('document_id', documentIds)
			: Promise.resolve({ data: [], error: null })
	]);
	assertQuery(profilesResult.error, 'No se pudieron cargar los perfiles');
	assertQuery(readersResult.error, 'No se pudieron cargar los permisos');

	const profileMap = new Map(
		(profilesResult.data ?? []).map((profile) => [
			profile.id,
			{
				displayName: profile.display_name?.trim() || 'Usuario',
				avatarUrl: profile.avatar_url
			}
		])
	);
	const members: DocumentMember[] = profileIds.map((id) => ({
		id,
		displayName: profileMap.get(id)?.displayName ?? 'Usuario',
		avatarUrl: profileMap.get(id)?.avatarUrl ?? null
	}));
	const readersByDocument = new Map<string, string[]>();
	for (const reader of readersResult.data ?? []) {
		const ids = readersByDocument.get(reader.document_id) ?? [];
		ids.push(reader.user_id);
		readersByDocument.set(reader.document_id, ids);
	}
	const documents: FamilyDocumentRecord[] = rows.map((document) => ({
		...document,
		visibility: document.visibility as DocumentVisibility,
		memberIds: readersByDocument.get(document.id) ?? [],
		ownerName: profileMap.get(document.owner_id)?.displayName ?? 'Usuario',
		canManage: document.owner_id === userId
	}));
	const folders = [
		...new Set(
			(foldersResult.data ?? [])
				.map((row) => row.folder_name)
				.filter((folder): folder is string => Boolean(folder))
		)
	].sort((left, right) => left.localeCompare(right, 'es'));
	const nextCursor = hasNextPage ? (documents.at(-1)?.updated_at ?? null) : null;
	return { members, documents, folders, selectedFolder, nextCursor };
}
