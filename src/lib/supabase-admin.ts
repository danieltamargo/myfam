import { createClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';
import { env } from '$env/dynamic/private';

export function getSupabaseAdmin() {
	const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
	if (!key) throw new Error('El servicio administrativo no está configurado.');
	return createClient<Database>(
		env.SUPABASE_PROJECT_URL || env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL,
		key,
		{
			auth: {
				autoRefreshToken: false,
				persistSession: false
			}
		}
	);
}
