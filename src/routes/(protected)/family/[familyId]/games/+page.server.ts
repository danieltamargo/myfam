import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireFamilyRole } from '$lib/server/auth/authorization';
import { guardModuleActions, requireModuleAvailable } from '$lib/server/modules/availability';
import { loadFamilyGameLobby } from '$lib/server/games/queries';
import { gameCommandFailure } from '$lib/server/games/commands';
import { isFamilyGameType } from '$lib/games/family-games';

export const load: PageServerLoad = async ({ params, locals }) => {
	await requireModuleAvailable(locals.supabase, params.familyId, 'games');
	const { user } = await requireFamilyRole(locals, params.familyId, ['owner', 'admin', 'member']);
	return {
		...(await loadFamilyGameLobby(locals.supabase, params.familyId)),
		currentUserId: user.id,
		familyId: params.familyId
	};
};

const gameActions: Actions = {
	createRoom: async ({ request, params, locals }) => {
		requireModuleAvailable('games');
		await requireFamilyRole(locals, params.familyId, ['owner', 'admin', 'member']);
		const form = await request.formData();
		const opponent = form.get('opponent');
		const name = form.get('name');
		const gameType = form.get('gameType') ?? 'tic_tac_toe';
		if (
			typeof opponent !== 'string' ||
			!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(opponent) ||
			typeof name !== 'string' ||
			!name.trim() ||
			name.length > 100 ||
			!isFamilyGameType(gameType)
		) {
			return fail(400, { error: 'Elige un familiar y escribe un nombre de hasta 100 caracteres.' });
		}
		const result = await locals.supabase.rpc('create_family_game', {
			p_family_id: params.familyId,
			p_opponent_id: opponent,
			p_name: name.trim(),
			p_game_type: gameType
		});
		if (result.error) return gameCommandFailure(result.error);
		throw redirect(303, `/family/${params.familyId}/games/play/${result.data}`);
	}
};

export const actions: Actions = guardModuleActions('games', gameActions);
