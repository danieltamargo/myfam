// =====================================================
// GAMES MODULE TYPES
// =====================================================
// These types will be merged into database.ts after running migrations
// For now, we define them here for development

export type GameType = 'tic_tac_toe' | 'connect_four' | 'wordle';

export type RoomStatus = 'waiting' | 'in_progress' | 'finished' | 'cancelled';

// =====================================================
// GAME ROOM
// =====================================================
export interface GameRoom {
	id: string;
	family_id: string | null;
	created_by: string;
	name: string;
	game_type: GameType;
	status: RoomStatus;
	is_public: boolean;
	join_code: string | null;
	max_players: number;
	config: Record<string, any>;
	created_at: string;
	started_at: string | null;
	finished_at: string | null;
}

export interface GameRoomInsert {
	id?: string;
	family_id?: string | null;
	created_by: string;
	name: string;
	game_type: GameType;
	status?: RoomStatus;
	is_public?: boolean;
	join_code?: string | null;
	max_players?: number;
	config?: Record<string, any>;
	created_at?: string;
	started_at?: string | null;
	finished_at?: string | null;
}

export interface GameRoomUpdate {
	name?: string;
	status?: RoomStatus;
	started_at?: string | null;
	finished_at?: string | null;
	config?: Record<string, any>;
}

// =====================================================
// ROOM PARTICIPANT
// =====================================================
export type BotDifficulty = 'easy' | 'medium' | 'hard';

export interface RoomParticipant {
	id: string;
	room_id: string;
	user_id: string | null;
	guest_name: string | null;
	guest_identifier: string | null;
	player_number: number | null;
	is_ready: boolean;
	is_active: boolean;
	is_bot: boolean;
	bot_difficulty: BotDifficulty | null;
	joined_at: string;
	left_at: string | null;
}

export interface RoomParticipantInsert {
	id?: string;
	room_id: string;
	user_id?: string | null;
	guest_name?: string | null;
	guest_identifier?: string | null;
	player_number?: number | null;
	is_ready?: boolean;
	is_active?: boolean;
	is_bot?: boolean;
	bot_difficulty?: BotDifficulty | null;
	joined_at?: string;
	left_at?: string | null;
}

export interface RoomParticipantUpdate {
	is_ready?: boolean;
	is_active?: boolean;
	left_at?: string | null;
}

// =====================================================
// GAME SESSION
// =====================================================
export interface GameSession {
	id: string;
	room_id: string;
	game_type: GameType;
	status: 'active' | 'finished';
	winner_id: string | null;
	winner_player_number: number | null;
	is_draw: boolean;
	has_bots: boolean;
	game_state: Record<string, any>;
	final_state: Record<string, any> | null;
	started_at: string;
	finished_at: string | null;
	duration_seconds: number | null;
}

export interface GameSessionInsert {
	id?: string;
	room_id: string;
	game_type?: GameType;
	status?: 'active' | 'finished';
	winner_id?: string | null;
	winner_player_number?: number | null;
	is_draw?: boolean;
	has_bots?: boolean;
	game_state?: Record<string, any>;
	final_state?: Record<string, any> | null;
	started_at?: string;
	finished_at?: string | null;
	duration_seconds?: number | null;
}

export interface GameSessionUpdate {
	winner_id?: string | null;
	winner_player_number?: number | null;
	is_draw?: boolean;
	game_state?: Record<string, any>;
	final_state?: Record<string, any> | null;
	finished_at?: string | null;
	duration_seconds?: number | null;
}

// =====================================================
// GAME MOVE
// =====================================================
export interface GameMove {
	id: string;
	session_id: string;
	player_id: string | null;
	player_number: number;
	move_number: number;
	move_data: Record<string, any>;
	state_after: Record<string, any>;
	created_at: string;
	time_taken_ms: number | null;
}

export interface GameMoveInsert {
	id?: string;
	session_id: string;
	player_id?: string | null;
	player_number: number;
	move_number: number;
	move_data: Record<string, any>;
	state_after: Record<string, any>;
	created_at?: string;
	time_taken_ms?: number | null;
}

// =====================================================
// GAME STATS
// =====================================================
export interface GameStats {
	id: string;
	user_id: string;
	family_id: string | null;
	game_type: GameType;
	games_played: number;
	games_won: number;
	games_lost: number;
	games_drawn: number;
	current_win_streak: number;
	best_win_streak: number;
	total_time_played_seconds: number;
	average_move_time_ms: number | null;
	game_specific_stats: Record<string, any>;
	elo_rating: number;
	last_played_at: string | null;
	updated_at: string;
}

export interface GameStatsInsert {
	id?: string;
	user_id: string;
	family_id?: string | null;
	game_type: GameType;
	games_played?: number;
	games_won?: number;
	games_lost?: number;
	games_drawn?: number;
	current_win_streak?: number;
	best_win_streak?: number;
	total_time_played_seconds?: number;
	average_move_time_ms?: number | null;
	game_specific_stats?: Record<string, any>;
	elo_rating?: number;
	last_played_at?: string | null;
	updated_at?: string;
}

export interface GameStatsUpdate {
	games_played?: number;
	games_won?: number;
	games_lost?: number;
	games_drawn?: number;
	current_win_streak?: number;
	best_win_streak?: number;
	total_time_played_seconds?: number;
	average_move_time_ms?: number | null;
	game_specific_stats?: Record<string, any>;
	elo_rating?: number;
	last_played_at?: string | null;
	updated_at?: string;
}

// =====================================================
// GAME ACHIEVEMENT
// =====================================================
export interface GameAchievement {
	id: string;
	user_id: string;
	family_id: string | null;
	game_type: GameType | null;
	achievement_key: string;
	unlocked_at: string;
	session_id: string | null;
	metadata: Record<string, any>;
}

export interface GameAchievementInsert {
	id?: string;
	user_id: string;
	family_id?: string | null;
	game_type?: GameType | null;
	achievement_key: string;
	unlocked_at?: string;
	session_id?: string | null;
	metadata?: Record<string, any>;
}

// =====================================================
// LEADERBOARD ENTRY (from DB function)
// =====================================================
export interface LeaderboardEntry {
	user_id: string;
	display_name: string;
	avatar_url: string | null;
	games_played: number;
	games_won: number;
	win_rate: number;
	elo_rating: number;
	best_win_streak: number;
	rank: number;
}

// =====================================================
// GAME-SPECIFIC TYPES
// =====================================================

// Tic-Tac-Toe
export type TicTacToeCell = 'X' | 'O' | null;
export type TicTacToeBoard = [
	[TicTacToeCell, TicTacToeCell, TicTacToeCell],
	[TicTacToeCell, TicTacToeCell, TicTacToeCell],
	[TicTacToeCell, TicTacToeCell, TicTacToeCell]
];

export interface TicTacToeMove {
	row: number;
	col: number;
}

export interface TicTacToeState {
	board: TicTacToeBoard;
	currentPlayer: 1 | 2;
	winner: number | null;
	isDraw: boolean;
	winningLine: Array<{ row: number; col: number }> | null;
}

// Connect Four
export type Connect4Cell = 1 | 2 | null;
export type Connect4Board = Connect4Cell[][]; // 6 rows x 7 columns

export interface Connect4Move {
	column: number;
}

export interface Connect4State {
	board: Connect4Board;
	currentPlayer: 1 | 2;
	winner: number | null;
	isDraw: boolean;
	winningCells: Array<{ row: number; col: number }> | null;
	lastMove: { row: number; col: number } | null;
}

// Wordle
export type WordleLetterStatus = 'correct' | 'present' | 'absent' | 'empty';

export interface WordleLetterResult {
	letter: string;
	status: WordleLetterStatus;
}

export interface WordleGuess {
	word: string;
	result: WordleLetterResult[];
}

export interface WordleMove {
	guess: string;
	result: WordleLetterResult[];
}

export interface WordleState {
	targetWord: string; // Only visible to server
	guesses: WordleGuess[];
	currentGuess: number;
	isWon: boolean;
	isLost: boolean;
	maxGuesses: number;
	language: 'es' | 'en';
}

// =====================================================
// UI HELPER TYPES
// =====================================================
export interface RoomWithParticipants extends GameRoom {
	participants: (RoomParticipant & {
		profile?: {
			display_name: string;
			avatar_url: string | null;
		};
	})[];
	creator?: {
		display_name: string;
		avatar_url: string | null;
	};
}

export interface SessionWithMoves extends GameSession {
	moves: GameMove[];
	room: GameRoom;
	participants: RoomParticipant[];
}

// Game metadata
export interface GameMetadata {
	type: GameType;
	name: string;
	description: string;
	minPlayers: number;
	maxPlayers: number;
	icon: string;
	color: string;
	estimatedDuration: string;
}

export const GAME_METADATA: Record<GameType, GameMetadata> = {
	tic_tac_toe: {
		type: 'tic_tac_toe',
		name: 'Tres en Raya',
		description: 'Clásico juego de conectar 3 símbolos en línea',
		minPlayers: 2,
		maxPlayers: 2,
		icon: '❌⭕',
		color: 'bg-blue-500',
		estimatedDuration: '2-5 min'
	},
	connect_four: {
		type: 'connect_four',
		name: 'Conecta 4',
		description: 'Conecta 4 fichas del mismo color en línea',
		minPlayers: 2,
		maxPlayers: 2,
		icon: '🔴🟡',
		color: 'bg-red-500',
		estimatedDuration: '5-10 min'
	},
	wordle: {
		type: 'wordle',
		name: 'Wordle',
		description: 'Adivina la palabra oculta en 6 intentos',
		minPlayers: 2,
		maxPlayers: 10,
		icon: '📝',
		color: 'bg-green-500',
		estimatedDuration: '3-8 min'
	}
};
