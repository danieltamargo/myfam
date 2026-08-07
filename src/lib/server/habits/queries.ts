import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '$lib/types/database';
import { habitWeek, type HabitVisibility } from './schemas';

export class HabitQueryError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'HabitQueryError';
	}
}

export interface HabitMember {
	id: string;
	displayName: string;
	avatarUrl: string | null;
}

export interface HabitRecord extends Omit<Tables<'family_habits'>, 'visibility'> {
	visibility: HabitVisibility;
	selectedMemberIds: string[];
	completedDates: string[];
	creatorName: string;
	canManage: boolean;
}

export interface HabitPageData {
	days: string[];
	members: HabitMember[];
	habits: HabitRecord[];
}

function assertQuery(error: { message: string } | null, message: string): void {
	if (error) throw new HabitQueryError(`${message}: ${error.message}`);
}

export async function loadHabitFormContext(
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

export async function loadHabitPage(
	supabase: SupabaseClient<Database>,
	familyId: string,
	userId: string,
	today = new Date()
): Promise<HabitPageData> {
	const days = habitWeek(today);
	const [memberResult, habitResult, completionResult] = await Promise.all([
		supabase.from('family_members').select('user_id').eq('family_id', familyId).order('joined_at'),
		supabase
			.from('family_habits')
			.select('*')
			.eq('family_id', familyId)
			.is('archived_at', null)
			.order('updated_at', { ascending: false }),
		supabase
			.from('habit_completions')
			.select('habit_id, completed_on')
			.eq('family_id', familyId)
			.gte('completed_on', days[0])
			.lte('completed_on', days[6])
	]);
	assertQuery(memberResult.error, 'No se pudieron cargar los miembros');
	assertQuery(habitResult.error, 'No se pudieron cargar los hábitos');
	assertQuery(completionResult.error, 'No se pudo cargar el cumplimiento');

	const memberIds = (memberResult.data ?? [])
		.map((member) => member.user_id)
		.filter((id): id is string => Boolean(id));
	const habitRows = habitResult.data ?? [];
	const habitIds = habitRows.map((habit) => habit.id);
	const [profileResult, selectedResult] = await Promise.all([
		memberIds.length
			? supabase.from('public_profiles').select('id, display_name, avatar_url').in('id', memberIds)
			: Promise.resolve({ data: [], error: null }),
		habitIds.length
			? supabase.from('family_habit_members').select('habit_id, user_id').in('habit_id', habitIds)
			: Promise.resolve({ data: [], error: null })
	]);
	assertQuery(profileResult.error, 'No se pudieron cargar los perfiles');
	assertQuery(selectedResult.error, 'No se pudo cargar la audiencia de los hábitos');
	const profileMap = new Map(
		(profileResult.data ?? []).map((profile) => [
			profile.id,
			{
				displayName: profile.display_name?.trim() || 'Usuario',
				avatarUrl: profile.avatar_url
			}
		])
	);
	const selectedByHabit = new Map<string, string[]>();
	for (const selected of selectedResult.data ?? []) {
		const values = selectedByHabit.get(selected.habit_id) ?? [];
		values.push(selected.user_id);
		selectedByHabit.set(selected.habit_id, values);
	}
	const completedByHabit = new Map<string, string[]>();
	for (const completion of completionResult.data ?? []) {
		const values = completedByHabit.get(completion.habit_id) ?? [];
		values.push(completion.completed_on);
		completedByHabit.set(completion.habit_id, values);
	}

	return {
		days,
		members: memberIds.map((id) => ({
			id,
			displayName: profileMap.get(id)?.displayName ?? 'Usuario',
			avatarUrl: profileMap.get(id)?.avatarUrl ?? null
		})),
		habits: habitRows.map((habit) => ({
			...habit,
			visibility: habit.visibility as HabitVisibility,
			selectedMemberIds: selectedByHabit.get(habit.id) ?? [],
			completedDates: completedByHabit.get(habit.id) ?? [],
			creatorName: profileMap.get(habit.created_by)?.displayName ?? 'Usuario',
			canManage: habit.created_by === userId
		}))
	};
}
