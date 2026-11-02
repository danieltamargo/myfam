import { fail } from '@sveltejs/kit';
import type { PostgrestError } from '@supabase/supabase-js';

export function gameCommandFailure(error: PostgrestError) {
	const status =
		error.code === '42501'
			? 403
			: error.code === '40001' || error.code === 'PT409'
				? 409
				: error.code === '22023'
					? 400
					: 500;
	const message =
		status === 403
			? 'No tienes permiso para esta jugada.'
			: status === 409
				? 'La partida cambió. Recarga y comprueba el turno.'
				: status === 400
					? 'La acción no es válida en el estado actual de la partida.'
					: 'No se pudo guardar la partida. Inténtalo de nuevo.';
	return fail(status, { error: message });
}

export function parseGameMove(form: FormData) {
	const values = ['version', 'row', 'col'].map((name) => form.get(name));
	if (values.some((value) => typeof value !== 'string' || !/^\d+$/.test(value))) return null;
	const [version, row, col] = values.map(Number);
	if (!Number.isSafeInteger(version) || version < 1 || row > 2 || col > 2) return null;
	return { version, row, col };
}

export function parseGameVersion(form: FormData) {
	const value = form.get('version');
	if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
	const version = Number(value);
	return Number.isSafeInteger(version) && version > 0 ? version : null;
}

export function parseWordleGuess(form: FormData) {
	const value = form.get('guess');
	if (typeof value !== 'string') return null;
	const guess = value.trim().toLocaleUpperCase('es');
	return /^[A-ZÁÉÍÓÚÜÑ]{5}$/.test(guess) ? guess : null;
}
