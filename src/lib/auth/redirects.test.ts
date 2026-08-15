import { describe, expect, it } from 'vitest';
import { safeInternalPath } from './redirects';

describe('safeInternalPath', () => {
	it.each([
		['dashboard', '/dashboard', '/dashboard'],
		['porcentaje codificado en query', '/search?q=100%25', '/search?q=100%25'],
		[
			'query interna',
			'/family/family-a?tab=members&filter=active',
			'/family/family-a?tab=members&filter=active'
		],
		['fragmento interno', '/dashboard#recent', '/dashboard#recent']
	])('acepta %s', (_label, value, expected) => {
		expect(safeInternalPath(value)).toBe(expected);
	});

	it.each([
		['URL absoluta', 'https://evil.example'],
		['URL relativa al protocolo', '//evil.example'],
		['backslash inicial', '/\\evil.example'],
		['backslash intermedio', '/dashboard\\evil.example'],
		['slash codificado', '/%2F%2Fevil.example'],
		['backslash codificado', '/%5Cevil.example'],
		['doble codificación', '/%252F%252Fevil.example'],
		['escape malformado', '/dashboard%2'],
		['carácter de control', '/dashboard\n'],
		['ruta relativa', 'dashboard'],
		['vacío', ''],
		['ausente', null]
	])('rechaza %s', (_label, value) => {
		expect(safeInternalPath(value)).toBe('/dashboard');
	});

	it('permite elegir un fallback interno explícito', () => {
		expect(safeInternalPath('//evil.example', '/families')).toBe('/families');
	});
});
