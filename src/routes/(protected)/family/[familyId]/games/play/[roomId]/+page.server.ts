import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireFamilyRole } from '$lib/server/auth/authorization';
import { guardModuleActions, requireModuleAvailable } from '$lib/server/modules/availability';
import { loadFamilyGame } from '$lib/server/games/queries';
import {
	gameCommandFailure,
	parseGameMove,
	parseGameVersion,
	parseWordleGuess
} from '$lib/server/games/commands';

export const load: PageServerLoad = async ({ params, locals }) => {
	await requireModuleAvailable(locals.supabase, params.familyId, 'games');
	const { user } = await requireFamilyRole(locals, params.familyId, ['owner', 'admin', 'member']);
	return {
		...(await loadFamilyGame(locals.supabase, params.familyId, params.roomId)),
		currentUserId: user.id
	};
};

const gameActions: Actions = {
	guess: async ({ params, request, locals }) => {
		await loadFamilyGame(locals.supabase, params.familyId, params.roomId);
		const form = await request.formData();
		const version = parseGameVersion(form);
		const guess = parseWordleGuess(form);
		if (!version || !guess)
			return fail(400, {
				error: 'Escribe una palabra de cinco letras del diccionario de la partida.'
			});
		const result = await locals.supabase.rpc('guess_family_wordle', {
			p_room_id: params.roomId,
			p_version: version,
			p_guess: guess
		});
		return result.error ? gameCommandFailure(result.error) : { success: true };
	},
	react: async ({ params, request, locals }) => {
		await loadFamilyGame(locals.supabase, params.familyId, params.roomId);
		const version = parseGameVersion(await request.formData());
		if (!version) return fail(400, { error: 'Versión de partida no válida.' });
		const result = await locals.supabase.rpc('react_family_game', {
			p_room_id: params.roomId,
			p_version: version
		});
		return result.error ? gameCommandFailure(result.error) : { success: true };
	},
	chooseColor: async ({ params, request, locals }) => {
		await loadFamilyGame(locals.supabase, params.familyId, params.roomId);
		const form = await request.formData();
		const version = parseGameVersion(form);
		const choice = form.get('choice');
		if (!version || typeof choice !== 'string' || !/^[a-z]{1,20}$/.test(choice))
			return fail(400, { error: 'Color no válido.' });
		const result = await locals.supabase.rpc('choose_family_game_color', {
			p_room_id: params.roomId,
			p_version: version,
			p_choice: choice
		});
		return result.error ? gameCommandFailure(result.error) : { success: true };
	},
	move: async ({ params, request, locals }) => {
		requireModuleAvailable('games');
		await loadFamilyGame(locals.supabase, params.familyId, params.roomId);
		const move = parseGameMove(await request.formData());
		if (!move) return fail(400, { error: 'Jugada no válida.' });
		const result = await locals.supabase.rpc('move_family_game', {
			p_room_id: params.roomId,
			p_version: move.version,
			p_row: move.row,
			p_col: move.col
		});
		return result.error ? gameCommandFailure(result.error) : { success: true };
	},
	ready: async ({ params, locals }) => {
		requireModuleAvailable('games');
		await loadFamilyGame(locals.supabase, params.familyId, params.roomId);
		const result = await locals.supabase.rpc('ready_family_game', { p_room_id: params.roomId });
		return result.error ? gameCommandFailure(result.error) : { success: true };
	},
	start: async ({ params, locals }) => {
		requireModuleAvailable('games');
		await loadFamilyGame(locals.supabase, params.familyId, params.roomId);
		const result = await locals.supabase.rpc('start_family_game', { p_room_id: params.roomId });
		return result.error ? gameCommandFailure(result.error) : { success: true };
	},
	timeout: async ({ params, locals }) => {
		requireModuleAvailable('games');
		await loadFamilyGame(locals.supabase, params.familyId, params.roomId);
		const result = await locals.supabase.rpc('end_family_game', {
			p_room_id: params.roomId,
			p_reason: 'timeout'
		});
		return result.error ? gameCommandFailure(result.error) : { success: true };
	},
	leave: async ({ params, locals }) => {
		requireModuleAvailable('games');
		await loadFamilyGame(locals.supabase, params.familyId, params.roomId);
		const result = await locals.supabase.rpc('end_family_game', {
			p_room_id: params.roomId,
			p_reason: 'leave'
		});
		if (result.error) return gameCommandFailure(result.error);
		throw redirect(303, `/family/${params.familyId}/games`);
	}
};

export const actions: Actions = guardModuleActions('games', gameActions);
