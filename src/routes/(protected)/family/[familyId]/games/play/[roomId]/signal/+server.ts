import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireModuleAvailable } from '$lib/server/modules/availability';

export const GET: RequestHandler = async ({ params, locals }) => {
	await requireModuleAvailable(locals.supabase, params.familyId, 'games');
	const room = await locals.supabase
		.from('game_rooms')
		.select('id')
		.eq('id', params.roomId)
		.eq('family_id', params.familyId)
		.maybeSingle();
	if (room.error) throw error(500, 'No se pudo comprobar la señal.');
	if (!room.data) throw error(404, 'Partida no disponible.');
	const result = await locals.supabase.rpc('read_family_game_signal', { p_room_id: params.roomId });
	if (result.error)
		throw error(result.error.code === '42501' ? 403 : 500, 'No se pudo comprobar la señal.');
	return json({ ready: result.data }, { headers: { 'Cache-Control': 'no-store' } });
};
