import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { TicTacToeState, TicTacToeBoard, Connect4State, BotDifficulty } from '$lib/types/games';
import { getBotMove } from '$lib/games/ai/tic-tac-toe-ai';

export const load: PageServerLoad = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		throw error(401, 'Unauthorized');
	}

	const roomId = params.roomId;

	// Load room details
	const { data: room, error: roomError } = await supabase
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
		.eq('id', roomId)
		.single();

	if (roomError || !room) {
		console.error('Error loading room:', roomError);
		throw error(404, 'Room not found');
	}

	// Verify user is a participant or family member
	const { data: participation } = await supabase
		.from('room_participants')
		.select('*')
		.eq('room_id', roomId)
		.eq('user_id', user.id)
		.eq('is_active', true)
		.single();

	const isFamilyMember = room.family_id
		? await supabase
				.rpc('is_family_member', {
					family_uuid: room.family_id,
					user_uuid: user.id
				})
				.then((res) => res.data)
		: false;

	if (!participation && !isFamilyMember) {
		throw error(403, 'You are not a participant in this room');
	}

	// Load participants
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
		.eq('room_id', roomId)
		.eq('is_active', true)
		.order('player_number');

	if (participantsError) {
		console.error('Error loading participants:', participantsError);
		throw error(500, 'Failed to load participants');
	}

	// Load current game session (including finished ones to show result modal)
	const { data: session, error: sessionError } = await supabase
		.from('game_sessions')
		.select('*')
		.eq('room_id', roomId)
		.order('started_at', { ascending: false })
		.limit(1)
		.single();

	if (sessionError && sessionError.code !== 'PGRST116') {
		// PGRST116 = no rows returned
		console.error('Error loading session:', sessionError);
		console.error('Session error code:', sessionError.code);
	}

	console.log('Session loaded:', session ? 'Found' : 'Not found');
	console.log('Room status:', room.status);

	// Load moves for current session
	let moves: any[] = [];
	if (session) {
		const { data: movesData, error: movesError } = await supabase
			.from('game_moves')
			.select('*')
			.eq('session_id', session.id)
			.order('move_number');

		if (movesError) {
			console.error('Error loading moves:', movesError);
		} else {
			moves = movesData || [];
		}
	}

	return {
		room,
		participants: participants || [],
		session: session || null,
		moves,
		currentUserId: user.id,
		myParticipant: participation
	};
};

// Helper function to check if there's a winner in Tic-Tac-Toe
function checkTicTacToeWinner(board: TicTacToeBoard): {
	winner: 1 | 2 | null;
	winningLine: Array<{ row: number; col: number }> | null;
} {
	const lines = [
		// Rows
		[
			{ row: 0, col: 0 },
			{ row: 0, col: 1 },
			{ row: 0, col: 2 }
		],
		[
			{ row: 1, col: 0 },
			{ row: 1, col: 1 },
			{ row: 1, col: 2 }
		],
		[
			{ row: 2, col: 0 },
			{ row: 2, col: 1 },
			{ row: 2, col: 2 }
		],
		// Columns
		[
			{ row: 0, col: 0 },
			{ row: 1, col: 0 },
			{ row: 2, col: 0 }
		],
		[
			{ row: 0, col: 1 },
			{ row: 1, col: 1 },
			{ row: 2, col: 1 }
		],
		[
			{ row: 0, col: 2 },
			{ row: 1, col: 2 },
			{ row: 2, col: 2 }
		],
		// Diagonals
		[
			{ row: 0, col: 0 },
			{ row: 1, col: 1 },
			{ row: 2, col: 2 }
		],
		[
			{ row: 0, col: 2 },
			{ row: 1, col: 1 },
			{ row: 2, col: 0 }
		]
	];

	for (const line of lines) {
		const [a, b, c] = line;
		const cellA = board[a.row][a.col];
		const cellB = board[b.row][b.col];
		const cellC = board[c.row][c.col];

		if (cellA && cellA === cellB && cellA === cellC) {
			return {
				winner: cellA === 'X' ? 1 : 2,
				winningLine: line
			};
		}
	}

	return { winner: null, winningLine: null };
}

// Helper function to check if board is full (draw)
function isBoardFull(board: TicTacToeBoard): boolean {
	for (let row = 0; row < 3; row++) {
		for (let col = 0; col < 3; col++) {
			if (board[row][col] === null) {
				return false;
			}
		}
	}
	return true;
}

/**
 * Helper function to execute a bot's turn
 */
async function executeBotTurn(
	supabase: any,
	sessionId: string,
	roomId: string,
	botPlayerNumber: number,
	botDifficulty: BotDifficulty,
	currentState: TicTacToeState
) {
	// Get bot move from AI
	const botMove = getBotMove(currentState.board, botPlayerNumber as 1 | 2, botDifficulty);

	// Make the move
	const symbol = botPlayerNumber === 1 ? 'X' : 'O';
	const newBoard: TicTacToeBoard = currentState.board.map((r, rowIndex) =>
		r.map((cell, colIndex) =>
			rowIndex === botMove.row && colIndex === botMove.col ? symbol : cell
		)
	) as TicTacToeBoard;

	// Check for winner
	const { winner, winningLine } = checkTicTacToeWinner(newBoard);
	const isDraw = !winner && isBoardFull(newBoard);

	// Create new state
	const newState: TicTacToeState = {
		board: newBoard,
		currentPlayer: botPlayerNumber === 1 ? 2 : 1,
		winner,
		isDraw,
		winningLine
	};

	// Get move number
	const { count } = await supabase
		.from('game_moves')
		.select('*', { count: 'exact', head: true })
		.eq('session_id', sessionId);

	const moveNumber = (count || 0) + 1;

	// Insert bot move (with null player_id since it's a bot)
	await supabase.from('game_moves').insert({
		session_id: sessionId,
		player_id: null,
		player_number: botPlayerNumber,
		move_number: moveNumber,
		move_data: botMove,
		state_after: newState
	});

	// Update session state
	const updateData: any = {
		game_state: newState
	};

	// If game is over, update session
	if (winner || isDraw) {
		updateData.status = 'finished';
		updateData.finished_at = new Date().toISOString();
		updateData.final_state = newState;
		updateData.is_draw = isDraw;

		if (winner) {
			// Winner is a bot (no user_id)
			updateData.winner_player_number = winner;
		}

		// Also update room status
		await supabase
			.from('game_rooms')
			.update({ status: 'finished', finished_at: new Date().toISOString() })
			.eq('id', roomId);
	}

	await supabase.from('game_sessions').update(updateData).eq('id', sessionId);

	return { newState, winner, isDraw };
}

export const actions: Actions = {
	// Make a move in Tic-Tac-Toe
	makeMove: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) {
			return fail(401, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const row = parseInt(formData.get('row') as string);
		const col = parseInt(formData.get('col') as string);
		const sessionId = formData.get('session_id') as string;

		// Validate input
		if (isNaN(row) || isNaN(col) || row < 0 || row > 2 || col < 0 || col > 2) {
			return fail(400, { error: 'Invalid move coordinates' });
		}

		// Load session
		const { data: session, error: sessionError } = await supabase
			.from('game_sessions')
			.select('*, room:game_rooms(*)')
			.eq('id', sessionId)
			.single();

		if (sessionError || !session) {
			return fail(404, { error: 'Session not found' });
		}

		// Load participant to get player number
		const { data: participant } = await supabase
			.from('room_participants')
			.select('player_number')
			.eq('room_id', session.room_id)
			.eq('user_id', user.id)
			.single();

		if (!participant) {
			return fail(403, { error: 'You are not a participant in this game' });
		}

		const state = session.game_state as TicTacToeState;

		// Validate it's this player's turn
		if (state.currentPlayer !== participant.player_number) {
			return fail(400, { error: 'Not your turn' });
		}

		// Validate cell is empty
		if (state.board[row][col] !== null) {
			return fail(400, { error: 'Cell is already occupied' });
		}

		// Make the move
		const symbol = participant.player_number === 1 ? 'X' : 'O';
		const newBoard: TicTacToeBoard = state.board.map((r, rowIndex) =>
			r.map((cell, colIndex) => (rowIndex === row && colIndex === col ? symbol : cell))
		) as TicTacToeBoard;

		// Check for winner
		const { winner, winningLine } = checkTicTacToeWinner(newBoard);
		const isDraw = !winner && isBoardFull(newBoard);

		// Create new state
		const newState: TicTacToeState = {
			board: newBoard,
			currentPlayer: state.currentPlayer === 1 ? 2 : 1,
			winner,
			isDraw,
			winningLine
		};

		// Get move number
		const { count } = await supabase
			.from('game_moves')
			.select('*', { count: 'exact', head: true })
			.eq('session_id', sessionId);

		const moveNumber = (count || 0) + 1;

		// Insert move
		const { error: moveError } = await supabase.from('game_moves').insert({
			session_id: sessionId,
			player_id: user.id,
			player_number: participant.player_number,
			move_number: moveNumber,
			move_data: { row, col },
			state_after: newState
		});

		if (moveError) {
			console.error('Error inserting move:', moveError);
			return fail(500, { error: 'Failed to record move' });
		}

		// Update session state
		const updateData: any = {
			game_state: newState
		};

		// If game is over, update session
		if (winner || isDraw) {
			updateData.status = 'finished';
			updateData.finished_at = new Date().toISOString();
			updateData.final_state = newState;
			updateData.is_draw = isDraw;

			if (winner) {
				// Find winner's user_id
				const { data: winnerParticipant } = await supabase
					.from('room_participants')
					.select('user_id, is_bot')
					.eq('room_id', session.room_id)
					.eq('player_number', winner)
					.single();

				if (winnerParticipant) {
					if (winnerParticipant.is_bot) {
						// Bot winner - use player_number
						updateData.winner_player_number = winner;
					} else {
						// Human winner - use user_id
						updateData.winner_id = winnerParticipant.user_id;
					}
				}
			}

			// Also update room status
			await supabase
				.from('game_rooms')
				.update({ status: 'finished', finished_at: new Date().toISOString() })
				.eq('id', session.room_id);
		}

		const { error: updateError } = await supabase
			.from('game_sessions')
			.update(updateData)
			.eq('id', sessionId);

		if (updateError) {
			console.error('Error updating session:', updateError);
			return fail(500, { error: 'Failed to update game state' });
		}

		// After successful move, check if next player is a bot
		if (!winner && !isDraw) {
			const nextPlayerNumber = newState.currentPlayer;

			// Check if next player is a bot
			const { data: nextParticipant } = await supabase
				.from('room_participants')
				.select('is_bot, bot_difficulty')
				.eq('room_id', session.room_id)
				.eq('player_number', nextPlayerNumber)
				.eq('is_active', true)
				.single();

			if (nextParticipant?.is_bot && nextParticipant.bot_difficulty) {
				// Execute bot turn
				try {
					await executeBotTurn(
						supabase,
						sessionId,
						session.room_id,
						nextPlayerNumber,
						nextParticipant.bot_difficulty as BotDifficulty,
						newState
					);
				} catch (botError) {
					console.error('Error executing bot turn:', botError);
					// Don't fail the user's move, just log the error
				}
			}
		}

		return { success: true };
	},

	// Rematch - create a new session in the same room
	rematch: async ({ params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) {
			return fail(401, { error: 'Unauthorized' });
		}

		const roomId = params.roomId;

		// Verify room exists and user is participant
		const { data: room } = await supabase
			.from('game_rooms')
			.select('*')
			.eq('id', roomId)
			.single();

		if (!room) {
			return fail(404, { error: 'Room not found' });
		}

		// Reset all participants to not ready
		await supabase
			.from('room_participants')
			.update({ is_ready: false })
			.eq('room_id', roomId);

		// Update room status
		await supabase
			.from('game_rooms')
			.update({ status: 'waiting', started_at: null, finished_at: null })
			.eq('id', roomId);

		return { success: true };
	},

	// Leave game and return to lobby
	leaveGame: async ({ params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) {
			return fail(401, { error: 'Unauthorized' });
		}

		const roomId = params.roomId;

		// Mark as inactive
		await supabase
			.from('room_participants')
			.update({
				is_active: false,
				left_at: new Date().toISOString()
			})
			.eq('room_id', roomId)
			.eq('user_id', user.id);

		// Redirect to games lobby
		throw redirect(303, `/family/${params.familyId}/games`);
	}
};
