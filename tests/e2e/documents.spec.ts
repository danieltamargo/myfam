import { createHmac, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import type { Database } from '../../src/lib/types/database';

interface LocalSupabaseStatus {
	ANON_KEY: string;
	API_URL: string;
	JWT_SECRET: string;
	SECRET_KEY: string;
}

function getLocalSupabaseStatus(): LocalSupabaseStatus {
	const executable = process.platform === 'win32' ? 'powershell.exe' : 'npx';
	const args =
		process.platform === 'win32'
			? ['-NoProfile', '-Command', 'npx supabase status -o json']
			: ['supabase', 'status', '-o', 'json'];
	return JSON.parse(
		execFileSync(executable, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
	) as LocalSupabaseStatus;
}

function encode(value: unknown): string {
	return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function createUserToken(secret: string, userId: string, email: string): string {
	const issuedAt = Math.floor(Date.now() / 1000);
	const header = encode({ alg: 'HS256', typ: 'JWT' });
	const payload = encode({
		sub: userId,
		email,
		role: 'authenticated',
		aal: 'aal1',
		session_id: randomUUID(),
		iat: issuedAt,
		exp: issuedAt + 900
	});
	const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
	return `${header}.${payload}.${signature}`;
}

function createUserClient(
	status: LocalSupabaseStatus,
	userId: string,
	email: string
): SupabaseClient<Database> {
	return createClient<Database>(status.API_URL, status.ANON_KEY, {
		global: {
			headers: { Authorization: `Bearer ${createUserToken(status.JWT_SECRET, userId, email)}` }
		},
		auth: { autoRefreshToken: false, persistSession: false }
	});
}

async function signIn(page: Page, email: string, password: string): Promise<void> {
	await page.goto('/login');
	await page.waitForTimeout(750);
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Sign In' }).click();
	await page.waitForURL('**/dashboard', { timeout: 15_000 });
}

test('protege, comparte, descarga y elimina un documento sin confiar en su extensión', async ({
	page
}, testInfo) => {
	test.setTimeout(150_000);
	page.setDefaultTimeout(12_000);
	const status = getLocalSupabaseStatus();
	const admin = createClient<Database>(status.API_URL, status.SECRET_KEY, {
		auth: { autoRefreshToken: false, persistSession: false }
	});
	const suffix = randomUUID();
	const password = 'DocumentsE2E-2026!';
	const ownerEmail = `documents-family-owner-${suffix}@example.test`;
	const authorEmail = `documents-author-${suffix}@example.test`;
	const readerEmail = `documents-reader-${suffix}@example.test`;
	const createdUserIds: string[] = [];
	let familyId: string | undefined;

	try {
		for (const [email, name] of [
			[ownerEmail, 'Owner familiar'],
			[authorEmail, 'Autora documentos'],
			[readerEmail, 'Lector elegido']
		] as const) {
			const result = await admin.auth.admin.createUser({
				email,
				password,
				email_confirm: true,
				user_metadata: { name }
			});
			expect(result.error).toBeNull();
			expect(result.data.user?.id).toBeTruthy();
			createdUserIds.push(result.data.user!.id);
		}

		const ownerId = createdUserIds[0]!;
		const authorId = createdUserIds[1]!;
		const readerId = createdUserIds[2]!;
		const owner = createUserClient(status, ownerId, ownerEmail);
		const author = createUserClient(status, authorId, authorEmail);
		const reader = createUserClient(status, readerId, readerEmail);
		const { data: createdFamilyId, error: familyError } = await owner.rpc('create_family', {
			p_name: `Documentos E2E ${suffix}`
		});
		expect(familyError).toBeNull();
		familyId = createdFamilyId ?? undefined;
		expect(familyId).toBeTruthy();

		for (const [client, email] of [
			[author, authorEmail],
			[reader, readerEmail]
		] as const) {
			const { data: invitationId, error: invitationError } = await owner.rpc(
				'invite_family_member',
				{ p_family_id: familyId!, p_email: email }
			);
			expect(invitationError).toBeNull();
			expect(
				(await client.rpc('accept_family_invitation', { p_invitation_id: invitationId! })).error
			).toBeNull();
		}

		await signIn(page, authorEmail, password);
		await page.goto(`/family/${familyId}/documents`);
		await expect(page.getByRole('heading', { name: 'Documentos privados' })).toBeVisible();
		await page.waitForTimeout(750);
		await page.getByRole('button', { name: '+ Subir documento' }).click();

		const uploadForm = page.locator('#upload-document-form');
		await uploadForm.locator('input[name="document"]').setInputFiles({
			name: 'engaño.pdf',
			mimeType: 'application/pdf',
			buffer: Buffer.from('contenido que no es PDF')
		});
		await uploadForm.getByLabel('Nombre visible').fill('Archivo sospechoso');
		await uploadForm.getByRole('button', { name: 'Subir de forma privada' }).click();
		await expect(page.getByText('El contenido del archivo no coincide')).toBeVisible();

		const documentName = `Póliza médica ${suffix}`;
		await uploadForm.locator('input[name="document"]').setInputFiles({
			name: 'poliza-segura',
			mimeType: 'application/pdf',
			buffer: Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF')
		});
		await uploadForm.getByLabel('Nombre visible').fill(documentName);
		await uploadForm.getByLabel('Carpeta lógica').fill('Salud');
		await uploadForm.getByRole('button', { name: 'Subir de forma privada' }).click();
		await expect(page.getByText('Documento privado subido.')).toBeVisible();

		const { data: storedDocument, error: documentError } = await author
			.from('family_documents')
			.select('id, storage_path, visibility, version')
			.eq('family_id', familyId!)
			.eq('display_name', documentName)
			.single();
		expect(documentError).toBeNull();
		expect(storedDocument).toMatchObject({ visibility: 'private', version: 2 });
		expect(storedDocument!.storage_path).toBe(`${familyId}/${authorId}/${storedDocument!.id}`);
		expect(
			(await owner.from('family_documents').select('id').eq('id', storedDocument!.id)).data
		).toEqual([]);
		expect(
			(await reader.from('family_documents').select('id').eq('id', storedDocument!.id)).data
		).toEqual([]);
		expect(
			(await owner.rpc('prepare_family_document_download', { p_document_id: storedDocument!.id }))
				.error?.code
		).toBe('42501');

		const documentCard = page.locator('article').filter({ hasText: documentName });
		await documentCard.getByText('Gestionar').click();
		await documentCard.getByLabel('Privacidad').selectOption('selected_members');
		await documentCard.getByText('Lector elegido', { exact: true }).click();
		await expect(
			documentCard.locator(`input[name="member_ids"][value="${readerId}"]`)
		).toBeChecked();
		await documentCard.getByRole('button', { name: 'Guardar acceso' }).click();
		await expect(page.getByText('Privacidad y carpeta actualizadas.')).toBeVisible();
		expect(
			(await reader.from('family_documents').select('id').eq('id', storedDocument!.id)).data
		).toHaveLength(1);
		expect(
			(await owner.from('family_documents').select('id').eq('id', storedDocument!.id)).data
		).toEqual([]);

		await page.context().clearCookies();
		await signIn(page, ownerEmail, password);
		await page.goto(`/family/${familyId}/documents`);
		await expect(page.getByText('Todavía no hay documentos aquí')).toBeVisible();

		await page.context().clearCookies();
		await signIn(page, readerEmail, password);
		await page.goto(`/family/${familyId}/documents`);
		const sharedCard = page.locator('article').filter({ hasText: documentName });
		await expect(sharedCard).toBeVisible();
		await expect(sharedCard.getByText('Compartido', { exact: false })).toBeVisible();
		const downloadPromise = page.waitForEvent('download');
		await sharedCard.getByRole('button', { name: 'Descargar' }).click();
		const download = await downloadPromise;
		expect(download.suggestedFilename()).toBe('poliza-segura');

		if (testInfo.project.name === 'mobile-chromium') {
			const bodyWidth = await page.locator('body').evaluate((element) => element.scrollWidth);
			expect(bodyWidth).toBeLessThanOrEqual(testInfo.project.use.viewport!.width + 1);
		}

		await page.context().clearCookies();
		await signIn(page, authorEmail, password);
		await page.goto(`/family/${familyId}/documents`);
		const ownedCard = page.locator('article').filter({ hasText: documentName });
		await ownedCard.getByText('Gestionar').click();
		await ownedCard.getByRole('button', { name: 'Borrar permanentemente' }).click();
		await expect(page.getByText('Documento borrado de forma permanente.')).toBeVisible();
		const deletedDocument = await admin
			.from('family_documents')
			.select('id')
			.eq('id', storedDocument!.id);
		expect(deletedDocument.error).toBeNull();
		expect(deletedDocument.data).toEqual([]);
		expect(
			(
				await admin.from('audit_logs').select('action').eq('resource_id', storedDocument!.id)
			).data?.map(({ action }) => action)
		).toEqual(
			expect.arrayContaining([
				'documents.uploaded',
				'documents.access_changed',
				'documents.downloaded',
				'documents.deleted'
			])
		);
	} finally {
		if (familyId) {
			const owners = await admin.storage.from('family-documents').list(familyId);
			const paths: string[] = [];
			for (const ownerFolder of owners.data ?? []) {
				const ownerPath = `${familyId}/${ownerFolder.name}`;
				const objects = await admin.storage.from('family-documents').list(ownerPath);
				paths.push(...(objects.data ?? []).map((item) => `${ownerPath}/${item.name}`));
			}
			if (paths.length) await admin.storage.from('family-documents').remove(paths);
			await admin.from('families').delete().eq('id', familyId);
		}
		for (const userId of createdUserIds) await admin.auth.admin.deleteUser(userId);
	}
});
