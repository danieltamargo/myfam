import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '$lib/types/database';
import type { TaskPriority, TaskRecurrence, TaskStatus, TaskView } from './schemas';

export class TaskQueryError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'TaskQueryError';
	}
}

export interface TaskMember {
	id: string;
	displayName: string;
	avatarUrl: string | null;
	role: 'owner' | 'admin' | 'member';
}

export interface TaskGroup {
	id: string;
	name: string;
}

export interface FamilyTaskRecord extends Omit<
	Tables<'family_tasks'>,
	'priority' | 'status' | 'recurrence_frequency'
> {
	priority: TaskPriority;
	status: TaskStatus;
	recurrence_frequency: TaskRecurrence;
	assigneeIds: string[];
	mentionIds: string[];
	creatorName: string;
	groupName: string | null;
	canManage: boolean;
}

export interface TaskPageData {
	view: TaskView;
	members: TaskMember[];
	groups: TaskGroup[];
	tasks: FamilyTaskRecord[];
}

function assertQuery(error: { message: string } | null, message: string): void {
	if (error) throw new TaskQueryError(`${message}: ${error.message}`);
}

function isoDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}

export async function loadTaskFormContext(
	supabase: SupabaseClient<Database>,
	familyId: string
): Promise<{ memberIds: Set<string>; groupIds: Set<string> }> {
	const [membersResult, groupsResult] = await Promise.all([
		supabase.from('family_members').select('user_id').eq('family_id', familyId),
		supabase.from('task_groups').select('id').eq('family_id', familyId).is('archived_at', null)
	]);
	assertQuery(membersResult.error, 'No se pudieron validar los miembros');
	assertQuery(groupsResult.error, 'No se pudieron validar los grupos');
	return {
		memberIds: new Set(
			(membersResult.data ?? [])
				.map((member) => member.user_id)
				.filter((id): id is string => Boolean(id))
		),
		groupIds: new Set((groupsResult.data ?? []).map((group) => group.id))
	};
}

export async function loadTaskPage(
	supabase: SupabaseClient<Database>,
	familyId: string,
	userId: string,
	userRole: string,
	view: TaskView
): Promise<TaskPageData> {
	const [membersResult, groupsResult, tasksResult, assigneesResult, mentionsResult] =
		await Promise.all([
			supabase
				.from('family_members')
				.select('user_id, role')
				.eq('family_id', familyId)
				.order('joined_at'),
			supabase
				.from('task_groups')
				.select('id, name')
				.eq('family_id', familyId)
				.is('archived_at', null)
				.order('name'),
			supabase
				.from('family_tasks')
				.select('*')
				.eq('family_id', familyId)
				.order('due_on', { ascending: true, nullsFirst: false })
				.order('created_at', { ascending: false }),
			supabase.from('task_assignees').select('task_id, user_id').eq('family_id', familyId),
			supabase.from('task_mentions').select('task_id, user_id').eq('family_id', familyId)
		]);
	assertQuery(membersResult.error, 'No se pudieron cargar los miembros');
	assertQuery(groupsResult.error, 'No se pudieron cargar los grupos');
	assertQuery(tasksResult.error, 'No se pudieron cargar las tareas');
	assertQuery(assigneesResult.error, 'No se pudieron cargar los responsables');
	assertQuery(mentionsResult.error, 'No se pudieron cargar las menciones');

	const membershipRows = (membersResult.data ?? []).filter(
		(member): member is typeof member & { user_id: string } => Boolean(member.user_id)
	);
	const profileIds = membershipRows.map((member) => member.user_id);
	const { data: profiles, error: profilesError } = profileIds.length
		? await supabase
				.from('public_profiles')
				.select('id, display_name, avatar_url')
				.in('id', profileIds)
		: { data: [], error: null };
	assertQuery(profilesError, 'No se pudieron cargar los perfiles');
	const profileMap = new Map(
		(profiles ?? []).map((profile) => [
			profile.id,
			{
				displayName: profile.display_name?.trim() || 'Usuario',
				avatarUrl: profile.avatar_url
			}
		])
	);
	const members: TaskMember[] = membershipRows.map((member) => ({
		id: member.user_id,
		displayName: profileMap.get(member.user_id)?.displayName ?? 'Usuario',
		avatarUrl: profileMap.get(member.user_id)?.avatarUrl ?? null,
		role: member.role as TaskMember['role']
	}));
	const groups = (groupsResult.data ?? []).map((group) => ({ id: group.id, name: group.name }));
	const groupMap = new Map(groups.map((group) => [group.id, group.name]));

	const assigneesByTask = new Map<string, string[]>();
	for (const assignee of assigneesResult.data ?? []) {
		const ids = assigneesByTask.get(assignee.task_id) ?? [];
		ids.push(assignee.user_id);
		assigneesByTask.set(assignee.task_id, ids);
	}
	const mentionsByTask = new Map<string, string[]>();
	for (const mention of mentionsResult.data ?? []) {
		const ids = mentionsByTask.get(mention.task_id) ?? [];
		ids.push(mention.user_id);
		mentionsByTask.set(mention.task_id, ids);
	}

	const today = isoDate(new Date());
	const upcomingLimit = new Date();
	upcomingLimit.setDate(upcomingLimit.getDate() + 7);
	const upcoming = isoDate(upcomingLimit);
	const tasks: FamilyTaskRecord[] = (tasksResult.data ?? [])
		.map((task) => {
			const assigneeIds = assigneesByTask.get(task.id) ?? [];
			return {
				...task,
				priority: task.priority as TaskPriority,
				status: task.status as TaskStatus,
				recurrence_frequency: task.recurrence_frequency as TaskRecurrence,
				assigneeIds,
				mentionIds: mentionsByTask.get(task.id) ?? [],
				creatorName: profileMap.get(task.created_by)?.displayName ?? 'Usuario',
				groupName: task.group_id ? (groupMap.get(task.group_id) ?? null) : null,
				canManage:
					task.created_by === userId ||
					assigneeIds.includes(userId) ||
					userRole === 'owner' ||
					userRole === 'admin'
			};
		})
		.filter((task) => {
			const active = task.status === 'todo' || task.status === 'in_progress';
			if (view === 'mine')
				return active && (task.created_by === userId || task.assigneeIds.includes(userId));
			if (view === 'overdue') return active && Boolean(task.due_on && task.due_on < today);
			if (view === 'upcoming')
				return active && Boolean(task.due_on && task.due_on >= today && task.due_on <= upcoming);
			return true;
		});

	return { view, members, groups, tasks };
}
