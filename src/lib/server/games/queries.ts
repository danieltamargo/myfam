import { error } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';

export async function loadFamilyGameLobby(supabase: SupabaseClient<Database>, familyId: string) {
	const [rooms, members] = await Promise.all([
		supabase
			.from('game_rooms')
			.select('id, name, game_type, status, created_at')
			.eq('family_id', familyId)
			.eq('protocol_version', 1)
			.order('created_at', { ascending: false })
			.limit(30),
		supabase
			.from('family_members')
			.select('user_id, profile:public_profiles(id, display_name, avatar_url)')
			.eq('family_id', familyId)
	]);
	if (rooms.error || members.error) throw error(500, 'No se pudieron cargar las partidas.');
	return { rooms: rooms.data, members: members.data };
}

export async function loadFamilyGame(
	supabase: SupabaseClient<Database>,
	familyId: string,
	roomId: string
) {
	const room = await supabase
		.from('game_rooms')
		.select('*')
		.eq('id', roomId)
		.eq('family_id', familyId)
		.eq('protocol_version', 1)
		.maybeSingle();
	if (room.error) throw error(500, 'No se pudo cargar la partida.');
	if (!room.data) throw error(404, 'Partida no disponible.');
	const [players, session] = await Promise.all([
		supabase
			.from('room_participants')
			.select(
				'id, user_id, player_number, is_ready, is_active, profile:public_profiles(id, display_name, avatar_url)'
			)
			.eq('room_id', roomId)
			.order('player_number'),
		supabase
			.from('game_sessions')
			.select('*')
			.eq('room_id', roomId)
			.order('started_at', { ascending: false })
			.limit(1)
			.maybeSingle()
	]);
	if (players.error || session.error) throw error(500, 'No se pudo actualizar la partida.');
	return { room: room.data, players: players.data, session: session.data, serverTime: Date.now() };
}
