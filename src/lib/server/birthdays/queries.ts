import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';
import { upcomingBirthdays, type BirthdayMember } from '$lib/birthdays/upcoming';

export async function loadBirthdayMembers(
	supabase: SupabaseClient<Database>,
	familyId: string
): Promise<BirthdayMember[]> {
	const [members, birthdays] = await Promise.all([
		supabase.from('family_members').select('user_id').eq('family_id', familyId).order('joined_at'),
		supabase.from('family_member_birthdays').select('user_id, month, day').eq('family_id', familyId)
	]);
	if (members.error || birthdays.error) throw new Error('No se pudieron cargar los cumpleaños.');
	const ids = (members.data ?? []).flatMap((member) => (member.user_id ? [member.user_id] : []));
	if (!ids.length) return [];
	const profiles = await supabase.from('public_profiles').select('id, display_name').in('id', ids);
	if (profiles.error) throw new Error('No se pudieron cargar los nombres familiares.');
	const names = new Map((profiles.data ?? []).map((profile) => [profile.id, profile.display_name]));
	const dates = new Map((birthdays.data ?? []).map((birthday) => [birthday.user_id, birthday]));
	return ids.map((id) => ({
		userId: id,
		displayName: names.get(id)?.trim() || 'Usuario',
		month: dates.get(id)?.month ?? null,
		day: dates.get(id)?.day ?? null
	}));
}

export async function loadBirthdayAlerts(
	supabase: SupabaseClient<Database>,
	familyId: string,
	wishlistEnabled: boolean,
	now = new Date()
) {
	if (!wishlistEnabled) return [];
	return upcomingBirthdays(await loadBirthdayMembers(supabase, familyId), familyId, now);
}
