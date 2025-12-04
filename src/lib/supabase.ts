import { createBrowserClient, createServerClient, isBrowser } from '@supabase/ssr';
import type { Database } from '$lib/types/database';

export const createClient = () => {
	if (isBrowser()) {
		return createBrowserClient<Database>(
			import.meta.env.VITE_SUPABASE_URL,
			import.meta.env.VITE_SUPABASE_ANON_KEY
		);
	}

	// For server-side rendering
	return createServerClient<Database>(
		import.meta.env.VITE_SUPABASE_URL,
		import.meta.env.VITE_SUPABASE_ANON_KEY,
		{
			cookies: {
				getAll() {
					return [];
				},
				setAll() {}
			}
		}
	);
};
