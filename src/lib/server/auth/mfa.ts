import { error, redirect } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { safeInternalPath } from '$lib/auth/redirects';
import type { Database } from '$lib/types/database';

const MFA_VERIFICATION_PATH = '/verify-2fa';

export async function enforceMfaForProtectedRoute(
	supabase: SupabaseClient<Database>,
	url: URL
): Promise<void> {
	if (
		url.pathname === MFA_VERIFICATION_PATH ||
		url.pathname.startsWith(`${MFA_VERIFICATION_PATH}/`)
	) {
		return;
	}

	const { data, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

	if (assuranceError || !data) {
		throw error(503, 'No se pudo verificar el nivel de autenticación');
	}

	if (data.currentLevel === 'aal1' && data.nextLevel === 'aal2') {
		const returnTo = safeInternalPath(`${url.pathname}${url.search}`);
		const search = new URLSearchParams({ next: returnTo });
		throw redirect(303, `${MFA_VERIFICATION_PATH}?${search.toString()}`);
	}
}
