// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import { createClient } from 'jsr:@supabase/supabase-js@2';

function getAuthenticatorLevel(token: string): string | null {
	try {
		const encodedPayload = token.split('.')[1];
		if (!encodedPayload) return null;

		const normalized = encodedPayload.replaceAll('-', '+').replaceAll('_', '/');
		const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
		const payload = JSON.parse(atob(padded)) as { aal?: string };
		return payload.aal ?? null;
	} catch {
		return null;
	}
}

function getServiceKey(): string {
	const namedKeys = Deno.env.get('SUPABASE_SECRET_KEYS');
	if (namedKeys) {
		let keys: unknown;
		try {
			keys = JSON.parse(namedKeys);
		} catch {
			throw new Error('Invalid server key configuration');
		}
		if (
			keys &&
			typeof keys === 'object' &&
			'default' in keys &&
			typeof keys.default === 'string' &&
			keys.default
		) {
			return keys.default;
		}
		throw new Error('Default server key is not configured');
	}
	return Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
}

Deno.serve(async (req) => {
	// CORS headers
	if (req.method === 'OPTIONS') {
		return new Response(null, {
			headers: {
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'POST, OPTIONS',
				'Access-Control-Allow-Headers': 'authorization, content-type'
			}
		});
	}
	if (req.method !== 'POST') {
		return new Response(JSON.stringify({ error: 'Method not allowed' }), {
			status: 405,
			headers: { 'Content-Type': 'application/json', Allow: 'POST, OPTIONS' }
		});
	}

	try {
		// Create Supabase client with service role
		const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', getServiceKey(), {
			auth: {
				autoRefreshToken: false,
				persistSession: false
			}
		});

		// Get user from authorization header
		const authHeader = req.headers.get('Authorization');
		if (!authHeader) {
			return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
				status: 401,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const token = authHeader.replace('Bearer ', '');

		// Verify token and get user
		const {
			data: { user },
			error: userError
		} = await supabaseAdmin.auth.getUser(token);

		if (userError || !user) {
			return new Response(JSON.stringify({ error: 'Invalid token' }), {
				status: 401,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		// The token was verified above; now enforce recent MFA assurance before
		// allowing this irreversible operation.
		if (getAuthenticatorLevel(token) !== 'aal2') {
			return new Response(JSON.stringify({ error: 'Two-factor verification is required' }), {
				status: 403,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const caller = createClient(
			Deno.env.get('SUPABASE_URL') ?? '',
			Deno.env.get('SUPABASE_ANON_KEY') ?? '',
			{
				global: { headers: { Authorization: `Bearer ${token}` } },
				auth: { autoRefreshToken: false, persistSession: false }
			}
		);
		const { data: profile, error: accessError } = await caller.rpc('get_my_profile').maybeSingle();
		if (accessError || !profile || profile.id !== user.id) {
			return new Response(JSON.stringify({ error: 'Account is not authorized' }), {
				status: 403,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		// Check if user is sole owner of any family
		const { data: ownedFamilies, error: familiesError } = await supabaseAdmin
			.from('family_members')
			.select('family_id')
			.eq('user_id', user.id)
			.eq('role', 'owner');

		if (familiesError) {
			return new Response(JSON.stringify({ error: familiesError.message }), {
				status: 500,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		if (ownedFamilies && ownedFamilies.length > 0) {
			for (const owned of ownedFamilies) {
				const { data: owners, error: ownersError } = await supabaseAdmin
					.from('family_members')
					.select('id')
					.eq('family_id', owned.family_id)
					.eq('role', 'owner');
				if (ownersError || !owners) {
					return new Response(JSON.stringify({ error: 'Could not verify family ownership' }), {
						status: 500,
						headers: { 'Content-Type': 'application/json' }
					});
				}

				if (owners && owners.length === 1) {
					return new Response(
						JSON.stringify({
							error: 'Cannot delete account. You are the only owner of one or more families.'
						}),
						{ status: 400, headers: { 'Content-Type': 'application/json' } }
					);
				}
			}
		}

		// Delete user (cascades to profiles and family_members)
		const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);

		if (deleteError) {
			return new Response(JSON.stringify({ error: deleteError.message }), {
				status: 500,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		return new Response(
			JSON.stringify({ success: true, message: 'Account deleted successfully' }),
			{ status: 200, headers: { 'Content-Type': 'application/json' } }
		);
	} catch (error) {
		return new Response(
			JSON.stringify({
				error: error instanceof Error ? error.message : 'An unexpected error occurred'
			}),
			{ status: 500, headers: { 'Content-Type': 'application/json' } }
		);
	}
});
