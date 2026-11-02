import { replaceRecoveryCodes } from '$lib/server/auth/recovery';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ setHeaders, request }) => {
	if (request.method === 'GET') setHeaders({ 'cache-control': 'no-store' });
	return {};
};

export const actions: Actions = {
	generate: async ({ locals, setHeaders }) => {
		setHeaders({ 'cache-control': 'no-store' });
		return { codes: await replaceRecoveryCodes(locals.supabase), revoked: false };
	},
	revoke: async ({ locals, setHeaders }) => {
		setHeaders({ 'cache-control': 'no-store' });
		await replaceRecoveryCodes(locals.supabase, true);
		return { codes: [], revoked: true };
	}
};
