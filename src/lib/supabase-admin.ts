import { createClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';
import { env } from '$env/dynamic/private';

// Admin client that bypasses RLS - use with caution!
// Only use for operations that need elevated privileges
export const supabaseAdmin = createClient<Database>(
	env.VITE_SUPABASE_URL!,
	env.SUPABASE_SECRET_KEY!,
	{
		auth: {
			autoRefreshToken: false,
			persistSession: false
		}
	}
);
