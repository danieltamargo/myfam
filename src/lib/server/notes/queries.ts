import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '$lib/types/database';
import type { NoteFilter, NoteVisibility } from './schemas';

export class NoteQueryError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'NoteQueryError';
	}
}

export interface NoteMember {
	id: string;
	displayName: string;
	avatarUrl: string | null;
}

export interface FamilyNoteRecord extends Omit<
	Tables<'family_notes'>,
	'visibility' | 'search_vector'
> {
	visibility: NoteVisibility;
	memberIds: string[];
	creatorName: string;
	canEdit: boolean;
}

export interface NotePageData {
	filter: NoteFilter;
	search: string;
	members: NoteMember[];
	notes: FamilyNoteRecord[];
	selectedNoteId: string | null;
	selectedNote: FamilyNoteRecord | null;
}

function assertQuery(error: { message: string } | null, message: string): void {
	if (error) throw new NoteQueryError(`${message}: ${error.message}`);
}

export async function loadNoteFormContext(
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

export async function loadNotePage(
	supabase: SupabaseClient<Database>,
	familyId: string,
	userId: string,
	filter: NoteFilter,
	search: string,
	requestedNoteId: string | null
): Promise<NotePageData> {
	let notesQuery = supabase
		.from('family_notes')
		.select(
			'id, family_id, created_by, title, content, visibility, archived_at, version, created_at, updated_at'
		)
		.eq('family_id', familyId)
		.order('updated_at', { ascending: false });

	if (filter === 'archived') notesQuery = notesQuery.not('archived_at', 'is', null);
	else notesQuery = notesQuery.is('archived_at', null);
	if (filter === 'mine') notesQuery = notesQuery.eq('created_by', userId);
	if (filter === 'shared') notesQuery = notesQuery.neq('visibility', 'private');
	if (search)
		notesQuery = notesQuery.textSearch('search_vector', search, {
			config: 'spanish',
			type: 'websearch'
		});

	const [membersResult, notesResult] = await Promise.all([
		supabase.from('family_members').select('user_id').eq('family_id', familyId).order('joined_at'),
		notesQuery
	]);
	assertQuery(membersResult.error, 'No se pudieron cargar los miembros');
	assertQuery(notesResult.error, 'No se pudieron cargar las notas');

	const profileIds = (membersResult.data ?? [])
		.map((member) => member.user_id)
		.filter((id): id is string => Boolean(id));
	const noteRows = notesResult.data ?? [];
	const noteIds = noteRows.map((note) => note.id);
	const [profilesResult, noteMembersResult] = await Promise.all([
		profileIds.length
			? supabase.from('public_profiles').select('id, display_name, avatar_url').in('id', profileIds)
			: Promise.resolve({ data: [], error: null }),
		noteIds.length
			? supabase.from('family_note_members').select('note_id, user_id').in('note_id', noteIds)
			: Promise.resolve({ data: [], error: null })
	]);
	assertQuery(profilesResult.error, 'No se pudieron cargar los perfiles');
	assertQuery(noteMembersResult.error, 'No se pudieron cargar los lectores de las notas');

	const profileMap = new Map(
		(profilesResult.data ?? []).map((profile) => [
			profile.id,
			{
				displayName: profile.display_name?.trim() || 'Usuario',
				avatarUrl: profile.avatar_url
			}
		])
	);
	const members: NoteMember[] = profileIds.map((id) => ({
		id,
		displayName: profileMap.get(id)?.displayName ?? 'Usuario',
		avatarUrl: profileMap.get(id)?.avatarUrl ?? null
	}));
	const membersByNote = new Map<string, string[]>();
	for (const noteMember of noteMembersResult.data ?? []) {
		const ids = membersByNote.get(noteMember.note_id) ?? [];
		ids.push(noteMember.user_id);
		membersByNote.set(noteMember.note_id, ids);
	}

	const notes: FamilyNoteRecord[] = noteRows.map((note) => ({
		...note,
		visibility: note.visibility as NoteVisibility,
		memberIds: membersByNote.get(note.id) ?? [],
		creatorName: profileMap.get(note.created_by)?.displayName ?? 'Usuario',
		canEdit: note.created_by === userId
	}));
	const selectedNoteId = notes.some((note) => note.id === requestedNoteId)
		? requestedNoteId
		: (notes[0]?.id ?? null);
	const selectedNote = notes.find((note) => note.id === selectedNoteId) ?? null;

	return { filter, search, members, notes, selectedNoteId, selectedNote };
}
