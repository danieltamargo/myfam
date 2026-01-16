import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { GameType, BotDifficulty, TicTacToeState, TicTacToeBoard } from '$lib/types/games';
import { getBotMove } from '$lib/games/ai/tic-tac-toe-ai';

export const load: PageServerLoad = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		throw error(401, 'Unauthorized');
	}

	const familyId = params.familyId;

	// Load family members for participant selection
	const { data: members, error: membersError } = await supabase
		.from('family_members')
		.select(
			`
			user_id,
			role,
			profiles (
				id,
				display_name,
				avatar_url
			)
		`
		)
		.eq('family_id', familyId);

	if (membersError) {
		console.error('Error loading members:', membersError);
		throw error(500, 'Failed to load family members');
	}

	// Load active game rooms for this family
	const { data: rooms, error: roomsError } = await supabase
		.from('game_rooms')
		.select(
			`
			*,
			creator:profiles!game_rooms_created_by_fkey (
				id,
				display_name,
				avatar_url
			)
		`
		)
		.eq('family_id', familyId)
		.in('status', ['waiting', 'in_progress'])
		.order('created_at', { ascending: false });

	if (roomsError) {
		console.error('Error loading rooms:', roomsError);
		throw error(500, 'Failed to load game rooms');
	}

	// Load participants for each room
	const roomIds = rooms?.map((r) => r.id) || [];
	const { data: participants, error: participantsError } = await supabase
		.from('room_participants')
		.select(
			`
			*,
			profile:profiles (
				id,
				display_name,
				avatar_url
			)
		`
		)
		.in('room_id', roomIds)
		.eq('is_active', true)
		.order('player_number');

	if (participantsError) {
		console.error('Error loading participants:', participantsError);
	}

	// Load recent finished sessions for history
	const { data: recentSessions, error: sessionsError } = await supabase
		.from('game_sessions')
		.select(
			`
			*,
			room:game_rooms (
				id,
				name,
				game_type
			),
			winner:profiles (
				id,
				display_name,
				avatar_url
			)
		`
		)
		.in(
			'room_id',
			await supabase
				.from('game_rooms')
				.select('id')
				.eq('family_id', familyId)
				.then((res) => res.data?.map((r) => r.id) || [])
		)
		.not('finished_at', 'is', null)
		.order('finished_at', { ascending: false })
		.limit(10);

	if (sessionsError) {
		console.error('Error loading sessions:', sessionsError);
	}

	// Load leaderboards for each game type
	const gameTypes: GameType[] = ['tic_tac_toe', 'connect_four', 'wordle'];
	const leaderboards: Record<GameType, any[]> = {
		tic_tac_toe: [],
		connect_four: [],
		wordle: []
	};

	for (const gameType of gameTypes) {
		const { data, error: leaderboardError } = await supabase.rpc('get_game_leaderboard', {
			p_family_id: familyId,
			p_game_type: gameType,
			p_limit: 5
		});

		if (leaderboardError) {
			console.error(`Error loading ${gameType} leaderboard:`, leaderboardError);
		} else {
			leaderboards[gameType] = data || [];
		}
	}

	// Check if user is already in a room
	const { data: userParticipation } = await supabase
		.from('room_participants')
		.select('room_id')
		.eq('user_id', user.id)
		.eq('is_active', true)
		.in('room_id', roomIds);

	return {
		members: members || [],
		rooms: rooms || [],
		participants: participants || [],
		recentSessions: recentSessions || [],
		leaderboards,
		currentUserId: user.id,
		userParticipation: userParticipation || []
	};
};

export const actions: Actions = {
	// Create a new game room
	createRoom: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) {
			return fail(401, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const name = formData.get('name') as string;
		const gameType = formData.get('game_type') as GameType;
		const maxPlayers = parseInt(formData.get('max_players') as string) || 2;
		const isPublic = formData.get('is_public') === 'true';

		// Validation
		if (!name || name.trim().length === 0) {
			return fail(400, { error: 'Room name is required' });
		}

		if (!gameType || !['tic_tac_toe', 'connect_four', 'wordle'].includes(gameType)) {
			return fail(400, { error: 'Invalid game type' });
		}

		// Generate join code if public
		let joinCode: string | null = null;
		if (isPublic) {
			const { data: codeData, error: codeError } = await supabase.rpc('generate_join_code');
			if (codeError) {
				console.error('Error generating join code:', codeError);
				return fail(500, { error: 'Failed to generate join code' });
			}
			joinCode = codeData;
		}

		// Create the room
		const { data: room, error: roomError } = await supabase
			.from('game_rooms')
			.insert({
				family_id: params.familyId,
				created_by: user.id,
				name: name.trim(),
				game_type: gameType,
				max_players: maxPlayers,
				is_public: isPublic,
				join_code: joinCode,
				status: 'waiting'
			})
			.select()
			.single();

		if (roomError) {
			console.error('Error creating room:', roomError);
			return fail(500, { error: 'Failed to create room' });
		}

		// Auto-join creator to the room
		const { error: joinError } = await supabase.from('room_participants').insert({
			room_id: room.id,
			user_id: user.id,
			is_ready: true
		});

		if (joinError) {
			console.error('Error auto-joining creator:', joinError);
			// Room created but creator not joined - not critical
		}

		return { success: true, roomId: room.id, joinCode };
	},

	// Join an existing room
	joinRoom: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) {
			return fail(401, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const roomId = formData.get('room_id') as string;
		const joinCode = formData.get('join_code') as string;

		if (!roomId && !joinCode) {
			return fail(400, { error: 'Room ID or join code is required' });
		}

		let targetRoomId = roomId;

		// If joining via code, find the room
		if (joinCode) {
			const { data: room, error: roomError } = await supabase
				.from('game_rooms')
				.select('id, status, max_players')
				.eq('join_code', joinCode.toUpperCase())
				.eq('is_public', true)
				.single();

			if (roomError || !room) {
				return fail(404, { error: 'Room not found with that code' });
			}

			if (room.status !== 'waiting') {
				return fail(400, { error: 'Room is not accepting new players' });
			}

			targetRoomId = room.id;
		}

		// Check if room is full
		const { count, error: countError } = await supabase
			.from('room_participants')
			.select('*', { count: 'exact', head: true })
			.eq('room_id', targetRoomId)
			.eq('is_active', true);

		if (countError) {
			console.error('Error counting participants:', countError);
			return fail(500, { error: 'Failed to check room capacity' });
		}

		const { data: room } = await supabase
			.from('game_rooms')
			.select('max_players')
			.eq('id', targetRoomId)
			.single();

		if (count && room && count >= room.max_players) {
			return fail(400, { error: 'Room is full' });
		}

		// Check if already in room
		const { data: existing } = await supabase
			.from('room_participants')
			.select('id')
			.eq('room_id', targetRoomId)
			.eq('user_id', user.id)
			.eq('is_active', true)
			.single();

		if (existing) {
			return fail(400, { error: 'You are already in this room' });
		}

		// Join the room
		const { error: joinError } = await supabase.from('room_participants').insert({
			room_id: targetRoomId,
			user_id: user.id
		});

		if (joinError) {
			console.error('Error joining room:', joinError);
			return fail(500, { error: 'Failed to join room' });
		}

		return { success: true, roomId: targetRoomId };
	},

	// Leave a room
	leaveRoom: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) {
			return fail(401, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const roomId = formData.get('room_id') as string;

		if (!roomId) {
			return fail(400, { error: 'Room ID is required' });
		}

		// Mark as inactive instead of deleting (for history)
		const { error: leaveError } = await supabase
			.from('room_participants')
			.update({
				is_active: false,
				left_at: new Date().toISOString()
			})
			.eq('room_id', roomId)
			.eq('user_id', user.id);

		if (leaveError) {
			console.error('Error leaving room:', leaveError);
			return fail(500, { error: 'Failed to leave room' });
		}

		return { success: true };
	},

	// Toggle ready status
	toggleReady: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) {
			return fail(401, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const roomId = formData.get('room_id') as string;
		const isReady = formData.get('is_ready') === 'true';

		if (!roomId) {
			return fail(400, { error: 'Room ID is required' });
		}

		const { error: updateError } = await supabase
			.from('room_participants')
			.update({ is_ready: isReady })
			.eq('room_id', roomId)
			.eq('user_id', user.id);

		if (updateError) {
			console.error('Error updating ready status:', updateError);
			return fail(500, { error: 'Failed to update ready status' });
		}

		return { success: true };
	},

	// Start game (only creator can start)
	startGame: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) {
			return fail(401, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const roomId = formData.get('room_id') as string;

		if (!roomId) {
			return fail(400, { error: 'Room ID is required' });
		}

		// Verify user is the creator
		const { data: room, error: roomError } = await supabase
			.from('game_rooms')
			.select('created_by, game_type, max_players')
			.eq('id', roomId)
			.single();

		if (roomError || !room) {
			return fail(404, { error: 'Room not found' });
		}

		if (room.created_by !== user.id) {
			return fail(403, { error: 'Only the room creator can start the game' });
		}

		// Check if all players are ready
		const { data: participants, error: participantsError } = await supabase
			.from('room_participants')
			.select('is_ready')
			.eq('room_id', roomId)
			.eq('is_active', true);

		if (participantsError) {
			console.error('Error checking participants:', participantsError);
			return fail(500, { error: 'Failed to check participants' });
		}

		const allReady = participants?.every((p) => p.is_ready);
		if (!allReady) {
			return fail(400, { error: 'Not all players are ready' });
		}

		// Minimum 2 players
		if (!participants || participants.length < 2) {
			return fail(400, { error: 'At least 2 players required to start' });
		}

		// Update room status
		const { error: updateError } = await supabase
			.from('game_rooms')
			.update({
				status: 'in_progress',
				started_at: new Date().toISOString()
			})
			.eq('id', roomId);

		if (updateError) {
			console.error('Error starting game:', updateError);
			return fail(500, { error: 'Failed to start game' });
		}

		// Create game session with initial state
		let initialState = {};

		switch (room.game_type) {
			case 'tic_tac_toe':
				initialState = {
					board: [
						[null, null, null],
						[null, null, null],
						[null, null, null]
					],
					currentPlayer: 1,
					winner: null,
					isDraw: false,
					winningLine: null
				};
				break;

			case 'connect_four':
				initialState = {
					board: Array(6)
						.fill(null)
						.map(() => Array(7).fill(null)),
					currentPlayer: 1,
					winner: null,
					isDraw: false,
					winningCells: null,
					lastMove: null
				};
				break;

			case 'wordle':
				// For Wordle, generate random word (this should be done server-side)
				// For now, placeholder
				initialState = {
					targetWord: 'AUDIO', // This should be random from dictionary
					guesses: [],
					currentGuess: 0,
					isWon: false,
					isLost: false,
					maxGuesses: 6,
					language: 'es'
				};
				break;
		}

		// Check if there are any bots in the game
		const hasBots = participants?.some((p: any) => p.is_bot) || false;

		const { data: sessionData, error: sessionError } = await supabase
			.from('game_sessions')
			.insert({
				room_id: roomId,
				game_type: room.game_type,
				game_state: initialState,
				has_bots: hasBots,
				status: 'active'
			})
			.select()
			.single();

		if (sessionError) {
			console.error('Error creating game session:', sessionError);
			console.error('Session error details:', {
				message: sessionError.message,
				details: sessionError.details,
				hint: sessionError.hint,
				code: sessionError.code
			});
			return fail(500, { error: `Failed to create game session: ${sessionError.message}` });
		}

		console.log('Game session created successfully:', sessionData);

		// If player 1 is a bot, auto-play the first move for Tic-Tac-Toe
		if (room.game_type === 'tic_tac_toe' && hasBots) {
			const player1 = participants?.find((p: any) => p.player_number === 1);

			if (player1?.is_bot && player1.bot_difficulty) {
				try {
					const state = initialState as TicTacToeState;
					const botMove = getBotMove(state.board, 1, player1.bot_difficulty as BotDifficulty);

					// Make the bot's first move
					const newBoard: TicTacToeBoard = state.board.map((r, rowIndex) =>
						r.map((cell, colIndex) =>
							rowIndex === botMove.row && colIndex === botMove.col ? 'X' : cell
						)
					) as TicTacToeBoard;

					const newState: TicTacToeState = {
						board: newBoard,
						currentPlayer: 2,
						winner: null,
						isDraw: false,
						winningLine: null
					};

					// Insert bot's first move
					await supabase.from('game_moves').insert({
						session_id: sessionData.id,
						player_id: null,
						player_number: 1,
						move_number: 1,
						move_data: botMove,
						state_after: newState
					});

					// Update session with new state
					await supabase
						.from('game_sessions')
						.update({ game_state: newState })
						.eq('id', sessionData.id);
				} catch (botError) {
					console.error('Error executing first bot move:', botError);
					// Don't fail game start, just log the error
				}
			}
		}

		return { success: true };
	},

	// Delete/cancel room (only creator)
	deleteRoom: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) {
			return fail(401, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const roomId = formData.get('room_id') as string;

		if (!roomId) {
			return fail(400, { error: 'Room ID is required' });
		}

		const { error: deleteError } = await supabase
			.from('game_rooms')
			.delete()
			.eq('id', roomId)
			.eq('created_by', user.id);

		if (deleteError) {
			console.error('Error deleting room:', deleteError);
			return fail(500, { error: 'Failed to delete room' });
		}

		return { success: true };
	},

	// Add bot to room (only creator)
	addBot: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) {
			return fail(401, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const roomId = formData.get('room_id') as string;
		const difficulty = (formData.get('difficulty') as BotDifficulty) || 'medium';

		if (!roomId) {
			return fail(400, { error: 'Room ID is required' });
		}

		// Verify user is the creator
		const { data: room, error: roomError } = await supabase
			.from('game_rooms')
			.select('created_by, status, max_players')
			.eq('id', roomId)
			.single();

		if (roomError || !room) {
			return fail(404, { error: 'Room not found' });
		}

		if (room.created_by !== user.id) {
			return fail(403, { error: 'Only the room creator can add bots' });
		}

		if (room.status !== 'waiting') {
			return fail(400, { error: 'Cannot add bots to a game in progress' });
		}

		// Check if room is full
		const { count, error: countError } = await supabase
			.from('room_participants')
			.select('*', { count: 'exact', head: true })
			.eq('room_id', roomId)
			.eq('is_active', true);

		if (countError) {
			console.error('Error counting participants:', countError);
			return fail(500, { error: 'Failed to check room capacity' });
		}

		if (count && count >= room.max_players) {
			return fail(400, { error: 'Room is full' });
		}

		// Use the database function to add bot
		const { data: botId, error: botError } = await supabase.rpc('add_bot_to_room', {
			p_room_id: roomId,
			p_difficulty: difficulty
		});

		if (botError) {
			console.error('Error adding bot:', botError);
			return fail(500, { error: `Failed to add bot: ${botError.message}` });
		}

		return { success: true, botId };
	},

	// Remove bot from room (only creator)
	removeBot: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) {
			return fail(401, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const roomId = formData.get('room_id') as string;
		const botId = formData.get('bot_id') as string;

		if (!roomId || !botId) {
			return fail(400, { error: 'Room ID and Bot ID are required' });
		}

		// Verify user is the creator
		const { data: room, error: roomError } = await supabase
			.from('game_rooms')
			.select('created_by, status')
			.eq('id', roomId)
			.single();

		if (roomError || !room) {
			return fail(404, { error: 'Room not found' });
		}

		if (room.created_by !== user.id) {
			return fail(403, { error: 'Only the room creator can remove bots' });
		}

		if (room.status !== 'waiting') {
			return fail(400, { error: 'Cannot remove bots from a game in progress' });
		}

		// Remove the bot participant
		const { error: removeError } = await supabase
			.from('room_participants')
			.delete()
			.eq('id', botId)
			.eq('room_id', roomId)
			.eq('is_bot', true);

		if (removeError) {
			console.error('Error removing bot:', removeError);
			return fail(500, { error: 'Failed to remove bot' });
		}

		return { success: true };
	}
};
