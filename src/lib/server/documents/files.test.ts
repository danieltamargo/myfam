import { describe, expect, it } from 'vitest';
import { DocumentFileError, validateDocumentFile } from './files';

function formWithFile(file: File): FormData {
	const form = new FormData();
	form.set('document', file);
	return form;
}

describe('document file validation', () => {
	it('acepta un PDF por su firma aunque el nombre no tenga extensión', async () => {
		const file = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])], 'contrato', {
			type: 'application/pdf'
		});
		await expect(validateDocumentFile(formWithFile(file))).resolves.toMatchObject({
			originalName: 'contrato',
			mimeType: 'application/pdf'
		});
	});

	it('rechaza un archivo cuya firma no coincide con el MIME declarado', async () => {
		const file = new File(['esto no es un PDF'], 'engaño.pdf', { type: 'application/pdf' });
		await expect(validateDocumentFile(formWithFile(file))).rejects.toMatchObject({
			name: 'DocumentFileError',
			status: 415
		});
	});

	it('rechaza nombres que contienen rutas aunque el archivo sea válido', async () => {
		const file = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], '../seguro.pdf', {
			type: 'application/pdf'
		});
		await expect(validateDocumentFile(formWithFile(file))).rejects.toBeInstanceOf(
			DocumentFileError
		);
	});

	it('valida el contenedor ZIP de los documentos Office', async () => {
		const file = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14])], 'plan.docx', {
			type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
		});
		await expect(validateDocumentFile(formWithFile(file))).resolves.toMatchObject({
			mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
		});
	});
});
