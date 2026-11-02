export const FAMILY_GAME_TYPES = ['tic_tac_toe', 'wordle', 'reaction', 'color'] as const;
export type FamilyGameType = (typeof FAMILY_GAME_TYPES)[number];

export const FAMILY_GAME_NAMES: Record<FamilyGameType, string> = {
	tic_tac_toe: 'Tres en raya',
	wordle: 'Wordle compartido',
	reaction: 'Reacción',
	color: 'Acertar el color'
};

export const FAMILY_WORDLE_WORDS = [
	'ABRIL',
	'ACTOR',
	'AGUAS',
	'AUDIO',
	'AVIÓN',
	'ÁRBOL',
	'BARCO',
	'BOLSA',
	'CALOR',
	'CAMPO',
	'CASAS',
	'CIELO',
	'CLASE',
	'COCHE',
	'COLOR',
	'CORTO',
	'DULCE',
	'FELIZ',
	'FLOTA',
	'FRESA',
	'FRUTA',
	'GATOS',
	'HIELO',
	'HORNO',
	'JUEGO',
	'LÁPIZ',
	'LECHE',
	'LIBRO',
	'LLAVE',
	'LUCHA',
	'LUCES',
	'MANOS',
	'MESAS',
	'METRO',
	'MONTE',
	'NUBES',
	'PERRO',
	'PIANO',
	'PLAYA',
	'QUESO'
] as const;

export interface FamilyWordleState {
	currentPlayer: number;
	winner: number | null;
	isDraw: boolean;
	guesses: {
		player: number;
		word: string;
		result: { letter: string; status: 'correct' | 'present' | 'absent' }[];
	}[];
	attempts: Record<string, number>;
	maxGuesses: number;
}

export interface FamilyReactionState {
	currentPlayer: number;
	winner: number | null;
	isDraw: boolean;
	endReason?: 'false_start' | 'reaction' | 'leave' | 'timeout';
	reactionMs?: number;
}

export interface FamilyColorState {
	currentPlayer: number;
	winner: number | null;
	isDraw: boolean;
	round: number;
	scores: Record<string, number>;
	target: string;
	choices: { id: string; name: string; hex: string }[];
	lastAnswerCorrect?: boolean;
}

export function isFamilyGameType(value: unknown): value is FamilyGameType {
	return typeof value === 'string' && FAMILY_GAME_TYPES.some((type) => type === value);
}
