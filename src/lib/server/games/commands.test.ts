import { describe, expect, it } from 'vitest';
import { parseGameMove, parseGameVersion, parseWordleGuess } from './commands';
import { FAMILY_WORDLE_WORDS, isFamilyGameType } from '$lib/games/family-games';

function moveForm(version: string, row: string, col: string) {
	const form = new FormData();
	form.set('version', version);
	form.set('row', row);
	form.set('col', col);
	return form;
}

describe('game move validation', () => {
	it('normalizes Spanish guesses while preserving accents', () => {
		const form = new FormData();
		form.set('guess', ' árbol ');
		expect(parseWordleGuess(form)).toBe('ÁRBOL');
		form.set('guess', '<svg>');
		expect(parseWordleGuess(form)).toBeNull();
		form.set('guess', '12345');
		expect(parseWordleGuess(form)).toBeNull();
	});
	it('only offers implemented family games', () => {
		for (const type of ['tic_tac_toe', 'wordle', 'reaction', 'color'])
			expect(isFamilyGameType(type)).toBe(true);
		expect(isFamilyGameType('connect_four')).toBe(false);
		expect(isFamilyGameType(null)).toBe(false);
	});
	it('publishes the complete small Wordle vocabulary without a selected answer', () => {
		expect(FAMILY_WORDLE_WORDS).toHaveLength(40);
		expect(new Set(FAMILY_WORDLE_WORDS).size).toBe(40);
		for (const word of FAMILY_WORDLE_WORDS) expect(word).toMatch(/^[A-ZÁÉÍÓÚÜÑ]{5}$/);
	});
	it('rejects a forged or missing optimistic version', () => {
		const form = new FormData();
		expect(parseGameVersion(form)).toBeNull();
		form.set('version', '9007199254740992');
		expect(parseGameVersion(form)).toBeNull();
		form.set('version', '2');
		expect(parseGameVersion(form)).toBe(2);
	});
	it('accepts a board cell and positive version', () => {
		expect(parseGameMove(moveForm('3', '0', '2'))).toEqual({ version: 3, row: 0, col: 2 });
	});
	it.each([
		['1', '1.5', '0'],
		['1', '-1', '0'],
		['1', '3', '0'],
		['0', '1', '1'],
		['9007199254740992', '1', '1'],
		['1', '', '0']
	])('rejects malformed or out-of-board coordinates %s %s %s', (version, row, col) => {
		expect(parseGameMove(moveForm(version, row, col))).toBeNull();
	});
});
