import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';

export function createSafeSessionReader(
	supabase: SupabaseClient<Database>
): App.Locals['safeGetSession'] {
	let pending: ReturnType<App.Locals['safeGetSession']> | undefined;
	return () => (pending ??= readSession());

	async function readSession() {
		const { data, error: sessionError } = await supabase.auth.getSession();
		if (sessionError || !data.session) return { session: null, user: null };
		const { session } = data;
		const { data: identity, error: userError } = await supabase.auth.getUser(session.access_token);
		if (userError || !identity.user) return { session: null, user: null };
		return { session: { ...session, user: identity.user }, user: identity.user };
	}
}
