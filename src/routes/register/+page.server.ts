import { error } from '@sveltejs/kit';

export const load = () => {
	throw error(403, 'El registro está cerrado. Solicita el acceso al administrador.');
};
