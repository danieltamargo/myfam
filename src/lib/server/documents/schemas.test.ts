import { describe, expect, it } from 'vitest';
import { parseMemberFilter } from './schemas';
import {
	parseDocumentAccessForm,
	parseDocumentIdentity,
	parseDocumentPageQuery,
	parseDocumentUploadForm
} from './schemas';

const ownerId = '60000000-0000-4000-8000-000000000001';
const memberId = '60000000-0000-4000-8000-000000000002';
const now = new Date('2026-08-07T12:00:00Z');

describe('document schemas', () => {
	it('normaliza nombres y mantiene privada una subida por defecto', () => {
		const form = new FormData();
		form.set('display_name', '  Seguro médico  ');
		form.set('folder_name', '  Salud  ');
		form.set('visibility', 'private');
		form.set('member_ids', memberId);
		expect(parseDocumentUploadForm(form, new Set([ownerId, memberId]), ownerId, now)).toEqual({
			success: true,
			data: {
				displayName: 'Seguro médico',
				folderName: 'Salud',
				visibility: 'private',
				memberIds: [],
				expiresAt: null
			}
		});
	});

	it('rechaza carpetas que intentan introducir una ruta', () => {
		const form = new FormData();
		form.set('display_name', 'Documento');
		form.set('folder_name', '../privado');
		form.set('visibility', 'private');
		expect(parseDocumentUploadForm(form, new Set([ownerId]), ownerId, now)).toMatchObject({
			success: false,
			errors: { folder_name: expect.any(String) }
		});
	});

	it('exige lectores familiares explícitos para compartir', () => {
		const form = new FormData();
		form.set('visibility', 'selected_members');
		expect(parseDocumentAccessForm(form, new Set([ownerId]), ownerId, now)).toMatchObject({
			success: false,
			errors: { member_ids: expect.any(String) }
		});
	});

	it('convierte la caducidad a fin de día UTC y limita diez años', () => {
		const valid = new FormData();
		valid.set('visibility', 'private');
		valid.set('expires_at', '2026-08-08');
		expect(parseDocumentAccessForm(valid, new Set([ownerId]), ownerId, now)).toMatchObject({
			success: true,
			data: { expiresAt: '2026-08-08T23:59:59.999Z' }
		});
		const invalid = new FormData();
		invalid.set('visibility', 'private');
		invalid.set('expires_at', '2037-01-01');
		expect(parseDocumentAccessForm(invalid, new Set([ownerId]), ownerId, now).success).toBe(false);
		invalid.set('expires_at', '2026-02-31');
		expect(parseDocumentAccessForm(invalid, new Set([ownerId]), ownerId, now).success).toBe(false);
	});

	it('valida identidades y cursores antes de consultar', () => {
		const form = new FormData();
		form.set('document_id', ownerId);
		form.set('version', '2');
		expect(parseDocumentIdentity(form)).toEqual({
			success: true,
			data: { documentId: ownerId, version: 2 }
		});
		const query = new URLSearchParams({
			folder: 'Salud',
			cursor: '2026-08-07T10:00:00.000Z'
		});
		expect(parseDocumentPageQuery(query)).toEqual({
			folder: 'Salud',
			cursor: '2026-08-07T10:00:00.000Z'
		});
	});
});

it('acepta una persona válida e ignora filtros malformados', () => {
	expect(parseMemberFilter(new URLSearchParams({ member: memberId }))).toBe(memberId);
	for (const member of ['', 'invalid', 'or=(id.gt.0)']) {
		expect(parseMemberFilter(new URLSearchParams({ member }))).toBe('');
	}
});
