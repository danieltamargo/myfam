// =====================================================
// TIC-TAC-TOE AI
// =====================================================
// Simple AI for Tic-Tac-Toe with different difficulty levels

import type { TicTacToeBoard, TicTacToeCell, TicTacToeMove, BotDifficulty } from '$lib/types/games';

/**
 * Get the best move for the AI based on difficulty level
 */
export function getBotMove(
	board: TicTacToeBoard,
	botPlayer: 1 | 2,
	difficulty: BotDifficulty = 'medium'
): TicTacToeMove {
	switch (difficulty) {
		case 'easy':
			return getRandomMove(board);
		case 'medium':
			return getMediumMove(board, botPlayer);
		case 'hard':
			return getHardMove(board, botPlayer);
		default:
			return getRandomMove(board);
	}
}

/**
 * Easy difficulty: Random valid move
 */
function getRandomMove(board: TicTacToeBoard): TicTacToeMove {
	const emptyPositions: TicTacToeMove[] = [];

	for (let row = 0; row < 3; row++) {
		for (let col = 0; col < 3; col++) {
			if (board[row][col] === null) {
				emptyPositions.push({ row, col });
			}
		}
	}

	if (emptyPositions.length === 0) {
		throw new Error('No valid moves available');
	}

	const randomIndex = Math.floor(Math.random() * emptyPositions.length);
	return emptyPositions[randomIndex];
}

/**
 * Medium difficulty: Block opponent's winning moves, otherwise random
 */
function getMediumMove(board: TicTacToeBoard, botPlayer: 1 | 2): TicTacToeMove {
	const opponent = botPlayer === 1 ? 2 : 1;

	// Try to win
	const winningMove = findWinningMove(board, botPlayer);
	if (winningMove) return winningMove;

	// Block opponent from winning
	const blockingMove = findWinningMove(board, opponent);
	if (blockingMove) return blockingMove;

	// Take center if available
	if (board[1][1] === null) {
		return { row: 1, col: 1 };
	}

	// Otherwise random
	return getRandomMove(board);
}

/**
 * Hard difficulty: Minimax algorithm (unbeatable)
 */
function getHardMove(board: TicTacToeBoard, botPlayer: 1 | 2): TicTacToeMove {
	const opponent = botPlayer === 1 ? 2 : 1;
	let bestScore = -Infinity;
	let bestMove: TicTacToeMove | null = null;

	for (let row = 0; row < 3; row++) {
		for (let col = 0; col < 3; col++) {
			if (board[row][col] === null) {
				// Try this move
				board[row][col] = botPlayer === 1 ? 'X' : 'O';
				const score = minimax(board, 0, false, botPlayer, opponent);
				board[row][col] = null;

				if (score > bestScore) {
					bestScore = score;
					bestMove = { row, col };
				}
			}
		}
	}

	if (!bestMove) {
		throw new Error('No valid moves available');
	}

	return bestMove;
}

/**
 * Minimax algorithm with alpha-beta pruning
 */
function minimax(
	board: TicTacToeBoard,
	depth: number,
	isMaximizing: boolean,
	botPlayer: 1 | 2,
	opponent: 1 | 2
): number {
	const winner = checkWinner(board);

	// Terminal states
	if (winner === botPlayer) return 10 - depth;
	if (winner === opponent) return depth - 10;
	if (isBoardFull(board)) return 0;

	if (isMaximizing) {
		let bestScore = -Infinity;
		for (let row = 0; row < 3; row++) {
			for (let col = 0; col < 3; col++) {
				if (board[row][col] === null) {
					board[row][col] = botPlayer === 1 ? 'X' : 'O';
					const score = minimax(board, depth + 1, false, botPlayer, opponent);
					board[row][col] = null;
					bestScore = Math.max(score, bestScore);
				}
			}
		}
		return bestScore;
	} else {
		let bestScore = Infinity;
		for (let row = 0; row < 3; row++) {
			for (let col = 0; col < 3; col++) {
				if (board[row][col] === null) {
					board[row][col] = opponent === 1 ? 'X' : 'O';
					const score = minimax(board, depth + 1, true, botPlayer, opponent);
					board[row][col] = null;
					bestScore = Math.min(score, bestScore);
				}
			}
		}
		return bestScore;
	}
}

/**
 * Find a move that would result in a win for the given player
 */
function findWinningMove(board: TicTacToeBoard, player: 1 | 2): TicTacToeMove | null {
	const symbol: TicTacToeCell = player === 1 ? 'X' : 'O';

	for (let row = 0; row < 3; row++) {
		for (let col = 0; col < 3; col++) {
			if (board[row][col] === null) {
				// Try this move
				board[row][col] = symbol;
				const winner = checkWinner(board);
				board[row][col] = null;

				if (winner === player) {
					return { row, col };
				}
			}
		}
	}

	return null;
}

/**
 * Check if there's a winner (simplified version)
 */
function checkWinner(board: TicTacToeBoard): 1 | 2 | null {
	const lines = [
		// Rows
		[{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }],
		[{ row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 }],
		[{ row: 2, col: 0 }, { row: 2, col: 1 }, { row: 2, col: 2 }],
		// Columns
		[{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 2, col: 0 }],
		[{ row: 0, col: 1 }, { row: 1, col: 1 }, { row: 2, col: 1 }],
		[{ row: 0, col: 2 }, { row: 1, col: 2 }, { row: 2, col: 2 }],
		// Diagonals
		[{ row: 0, col: 0 }, { row: 1, col: 1 }, { row: 2, col: 2 }],
		[{ row: 0, col: 2 }, { row: 1, col: 1 }, { row: 2, col: 0 }]
	];

	for (const line of lines) {
		const [a, b, c] = line;
		const cellA = board[a.row][a.col];

		if (cellA && cellA === board[b.row][b.col] && cellA === board[c.row][c.col]) {
			return cellA === 'X' ? 1 : 2;
		}
	}

	return null;
}

/**
 * Check if board is full
 */
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
