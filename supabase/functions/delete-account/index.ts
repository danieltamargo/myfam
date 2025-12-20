// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import { createClient } from 'jsr:@supabase/supabase-js@2';

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

	try {
		// Create Supabase client with service role
		const supabaseAdmin = createClient(
			Deno.env.get('SUPABASE_URL') ?? '',
			Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
			{
				auth: {
					autoRefreshToken: false,
					persistSession: false
				}
			}
		);

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
				const { data: owners } = await supabaseAdmin
					.from('family_members')
					.select('id')
					.eq('family_id', owned.family_id)
					.eq('role', 'owner');

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

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/delete-account' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
