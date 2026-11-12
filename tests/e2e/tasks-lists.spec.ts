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
	const executable = 'supabase';
	const args = ['status', '-o', 'json'];
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
	await page.getByLabel('Correo electrónico').fill(email);
	await page.getByLabel('Contraseña').fill(password);
	await page.getByRole('button', { name: 'Iniciar sesión' }).click();
	await page.waitForURL('**/dashboard', { timeout: 15_000 });
}

function futureDate(days: number): string {
	const date = new Date();
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

test('coordina tareas y una lista seleccionada con reconciliación en tiempo real', async ({
	page
}, testInfo) => {
	test.setTimeout(150_000);
	page.setDefaultTimeout(10_000);
	const status = getLocalSupabaseStatus();
	const admin = createClient<Database>(status.API_URL, status.SECRET_KEY, {
		auth: { autoRefreshToken: false, persistSession: false }
	});
	const suffix = randomUUID();
	const password = 'TasksListsE2E-2026!';
	const ownerEmail = `tasks-owner-${suffix}@example.test`;
	const selectedEmail = `tasks-selected-${suffix}@example.test`;
	const memberEmail = `tasks-member-${suffix}@example.test`;
	const createdUserIds: string[] = [];
	let familyId: string | undefined;

	try {
		for (const [email, name] of [
			[ownerEmail, 'Owner Tareas'],
			[selectedEmail, 'Invitada Tareas'],
			[memberEmail, 'Miembro Tareas']
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
		const selectedId = createdUserIds[1]!;
		const memberId = createdUserIds[2]!;
		const owner = createUserClient(status, ownerId, ownerEmail);
		const selected = createUserClient(status, selectedId, selectedEmail);
		const member = createUserClient(status, memberId, memberEmail);
		const { data: createdFamilyId, error: familyError } = await owner.rpc('create_family', {
			p_name: `Tareas E2E ${suffix}`
		});
		expect(familyError).toBeNull();
		familyId = createdFamilyId ?? undefined;
		expect(familyId).toBeTruthy();

		for (const [client, email] of [
			[selected, selectedEmail],
			[member, memberEmail]
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

		await signIn(page, ownerEmail, password);
		await page.goto(`/family/${familyId}/tasks?view=family`);
		await expect(page.getByRole('heading', { name: 'Tareas familiares' })).toBeVisible();
		await page.waitForTimeout(750);
		const ownNotification = `Aviso propio ${suffix}`;
		const otherNotification = `Aviso ajeno ${suffix}`;
		expect(
			(
				await admin.from('notifications').insert([
					{ user_id: selectedId, type: 'mention', title: otherNotification, read: false },
					{ user_id: ownerId, type: 'mention', title: ownNotification, read: false }
				])
			).error
		).toBeNull();
		await page.getByRole('button', { name: 'Notificaciones', exact: true }).click();
		await expect(page.getByText(ownNotification, { exact: true })).toBeVisible();
		await expect(page.getByText(otherNotification, { exact: true })).toHaveCount(0);
		await page.getByRole('button', { name: 'Close notifications', exact: true }).click();

		await page.getByRole('button', { name: '+ Nueva tarea' }).click();

		const taskSection = page.locator('#nueva-tarea');
		await expect(taskSection).toBeVisible();
		await taskSection.getByPlaceholder('Nuevo grupo').fill('Colegio');
		await taskSection.getByRole('button', { name: 'Crear grupo' }).click();
		await expect(page.getByText('Grupo creado.')).toBeVisible();

		const taskName = `Preparar mochilas ${suffix}`;
		await taskSection.getByLabel('Título').fill(taskName);
		await taskSection.getByLabel('Descripción').fill('Revisar agenda y material');
		await taskSection.locator('select[name="group_id"]').selectOption({ label: 'Colegio' });
		await taskSection.getByLabel('Prioridad').selectOption('high');
		await taskSection.getByLabel('Vencimiento').fill(futureDate(1));
		await taskSection.locator(`input[name="assignee_ids"][value="${selectedId}"]`).check();
		await taskSection.locator(`input[name="mention_ids"][value="${memberId}"]`).check();
		await taskSection.getByRole('button', { name: 'Crear tarea' }).click();

		await expect(page.getByText('Tarea creada.')).toBeVisible();
		await expect(page.getByText(taskName, { exact: true })).toBeVisible();
		const { data: storedTask, error: taskError } = await owner
			.from('family_tasks')
			.select('id, priority, status, version')
			.eq('family_id', familyId!)
			.eq('title', taskName)
			.single();
		expect(taskError).toBeNull();
		expect(storedTask).toMatchObject({ priority: 'high', status: 'todo', version: 1 });
		expect(
			(
				await selected
					.from('task_assignees')
					.select('user_id')
					.eq('task_id', storedTask!.id)
					.eq('user_id', selectedId)
			).data
		).toHaveLength(1);
		expect(
			(
				await member
					.from('task_mentions')
					.select('user_id')
					.eq('task_id', storedTask!.id)
					.eq('user_id', memberId)
			).data
		).toHaveLength(1);

		const { data: assignmentNotification } = await selected
			.from('notifications')
			.select('link, type')
			.eq('reference_id', storedTask!.id)
			.eq('type', 'task_assigned')
			.single();
		expect(assignmentNotification?.link).toBe(`/family/${familyId}/tasks?task=${storedTask!.id}`);
		const { data: mentionNotification } = await member
			.from('notifications')
			.select('link, type')
			.eq('reference_id', storedTask!.id)
			.eq('type', 'task_mention')
			.single();
		expect(mentionNotification?.link).toBe(`/family/${familyId}/tasks?task=${storedTask!.id}`);

		await page.getByRole('link', { name: 'Próximas' }).click();
		await expect(page.getByText(taskName, { exact: true })).toBeVisible();
		await page.getByRole('link', { name: 'Familia' }).click();
		await page.getByRole('button', { name: `Completar ${taskName}` }).click();
		await expect(page.getByText('Tarea completada.')).toBeVisible();
		await expect
			.poll(async () => {
				const { data } = await owner
					.from('family_tasks')
					.select('status, completed_by')
					.eq('id', storedTask!.id)
					.single();
				return data;
			})
			.toMatchObject({ status: 'completed', completed_by: ownerId });

		await page.goto(`/family/${familyId}/lists`);
		await expect(page.getByRole('heading', { name: 'Listas compartidas' })).toBeVisible();
		await page.waitForTimeout(750);
		await page.getByRole('button', { name: '+ Nueva lista' }).click();
		const listName = `Compra compartida ${suffix}`;
		const listForm = page.getByRole('heading', { name: 'Crear lista' }).locator('..');
		await listForm.getByLabel('Nombre').fill(listName);
		await listForm.getByLabel('Tipo de lista').selectOption('shopping');
		await listForm.getByLabel('Visibilidad').selectOption('selected_members');
		await listForm.getByLabel('Descripción').fill('Solo para quienes hacen la compra');
		await listForm.locator(`input[name="member_ids"][value="${selectedId}"]`).check();
		await listForm.getByRole('button', { name: 'Crear lista' }).click();
		await expect(page.getByText('Lista creada.')).toBeVisible();
		await expect(page.getByRole('heading', { name: listName }).first()).toBeVisible();

		const { data: storedList, error: listError } = await owner
			.from('family_lists')
			.select('id, visibility, list_type')
			.eq('family_id', familyId!)
			.eq('title', listName)
			.single();
		expect(listError).toBeNull();
		expect(storedList?.visibility).toBe('selected_members');
		expect(storedList?.list_type).toBe('shopping');
		expect(
			(await selected.from('family_lists').select('id').eq('id', storedList!.id)).data
		).toHaveLength(1);
		expect((await member.from('family_lists').select('id').eq('id', storedList!.id)).data).toEqual(
			[]
		);

		await page.getByLabel('Artículo', { exact: true }).fill('Tomates');
		await page.getByLabel('Cantidad').fill('2.5');
		await page.getByLabel('Unidad').fill('kg');
		await page.getByRole('button', { name: 'Añadir' }).click();
		await expect(page.getByText('Artículo añadido.')).toBeVisible();
		await expect(page.getByText('Tomates', { exact: true })).toBeVisible();
		let releaseWrite!: () => void;
		const writeGate = new Promise<void>((resolve) => {
			releaseWrite = resolve;
		});
		await page.route(
			'**/rest/v1/rpc/set_family_list_item_completed',
			async (route) => {
				await writeGate;
				await route.continue();
			},
			{ times: 1 }
		);
		await page.getByRole('checkbox', { name: 'Marcar Tomates como comprado' }).click();
		try {
			await expect(page.getByRole('button', { name: 'Añadir', exact: true })).toBeDisabled();
		} finally {
			releaseWrite();
		}
		await expect(page.getByText('Completados · 1')).toBeVisible();
		await expect
			.poll(async () => {
				const { data } = await owner
					.from('family_list_items')
					.select('completed_by')
					.eq('list_id', storedList!.id)
					.eq('title', 'Tomates')
					.single();
				return data?.completed_by;
			})
			.toBe(ownerId);
		await page.getByRole('button', { name: 'Deshacer último marcado de Tomates' }).click();
		await expect(
			page.getByRole('checkbox', { name: 'Marcar Tomates como comprado' })
		).toBeEnabled();
		await expect
			.poll(async () => {
				const { data } = await owner
					.from('family_list_items')
					.select('completed_at')
					.eq('list_id', storedList!.id)
					.eq('title', 'Tomates')
					.single();
				return data?.completed_at;
			})
			.toBeNull();
		await expect(
			page.getByRole('button', { name: 'Deshacer último marcado de Tomates' })
		).toHaveCount(0);
		await page.getByRole('checkbox', { name: 'Marcar Tomates como comprado' }).click();
		await expect(
			page.getByRole('button', { name: 'Deshacer último marcado de Tomates' })
		).toBeEnabled();
		await page.getByRole('button', { name: 'Últimos marcados', exact: true }).click();
		await expect(
			page.getByRole('checkbox', { name: 'Devolver Tomates a pendientes' })
		).toBeVisible();
		await page.getByTitle('Invitada Tareas', { exact: true }).click();
		await expect(page.getByRole('checkbox', { name: 'Devolver Tomates a pendientes' })).toHaveCount(
			0
		);
		await page.getByTitle('Owner Tareas', { exact: true }).click();
		await expect(
			page.getByRole('checkbox', { name: 'Devolver Tomates a pendientes' })
		).toBeVisible();
		await page.getByTitle('Todas las personas', { exact: true }).click();

		const { error: remoteItemError } = await selected.rpc('add_family_list_item', {
			p_list_id: storedList!.id,
			p_title: 'Pan',
			p_quantity: 2,
			p_unit: 'barras'
		});
		expect(remoteItemError).toBeNull();
		await page.getByRole('button', { name: 'Lista', exact: true }).click();
		await expect(page.getByText('Pan', { exact: true })).toBeVisible({ timeout: 15_000 });
		await expect(page.getByText('2 barras', { exact: true })).toBeVisible();

		const { data: remoteTomatoes, error: remoteTomatoesError } = await selected
			.from('family_list_items')
			.select('id, version')
			.eq('list_id', storedList!.id)
			.eq('title', 'Tomates')
			.single();
		expect(remoteTomatoesError).toBeNull();
		expect(
			(
				await selected.rpc('set_family_list_item_completed', {
					p_item_id: remoteTomatoes!.id,
					p_version: remoteTomatoes!.version,
					p_completed: false
				})
			).error
		).toBeNull();
		await expect(
			page.getByRole('checkbox', { name: 'Marcar Tomates como comprado' })
		).toBeVisible();
		await page.getByRole('button', { name: 'Deshacer último marcado de Tomates' }).click();
		await expect(
			page.getByText('Otra persona cambió el artículo. Se han cargado sus cambios.')
		).toBeVisible();
		await expect(
			page.getByRole('checkbox', { name: 'Marcar Tomates como comprado' })
		).toBeEnabled();
		const { data: afterConflict } = await selected
			.from('family_list_items')
			.select('version, completed_at')
			.eq('id', remoteTomatoes!.id)
			.single();
		expect(afterConflict).toEqual({ version: remoteTomatoes!.version + 1, completed_at: null });

		await page.route('**/rest/v1/rpc/set_family_list_item_completed', (route) => route.abort(), {
			times: 1
		});
		await page.getByRole('checkbox', { name: 'Marcar Tomates como comprado' }).click();
		await expect(page.getByText('No se pudo guardar el cambio. Inténtalo de nuevo.')).toBeVisible();
		await expect(
			page.getByRole('checkbox', { name: 'Marcar Tomates como comprado' })
		).toBeEnabled();

		const { data: historyId, error: historyError } = await owner.rpc('create_typed_family_list', {
			p_family_id: familyId!,
			p_title: `Histórico ${suffix}`,
			p_description: '',
			p_visibility: 'family',
			p_member_ids: [],
			p_list_type: 'shopping'
		});
		expect(historyError).toBeNull();
		expect(
			(
				await owner.rpc('add_family_list_item', {
					p_list_id: historyId!,
					p_title: 'Café molido',
					p_quantity: 0.5,
					p_unit: 'kg'
				})
			).error
		).toBeNull();
		await page.goto(`/family/${familyId}/lists?list=${storedList!.id}`);
		await page.getByLabel('Artículo', { exact: true }).fill('cafe');
		await page.getByRole('button', { name: /Café molido · 0,5 kg/ }).click();
		await expect(page.getByLabel('Artículo', { exact: true })).toHaveValue('Café molido');
		await expect(page.getByLabel('Cantidad')).toHaveValue('0.5');
		await expect(page.getByLabel('Unidad')).toHaveValue('kg');
		await page.getByLabel('Tipo de lista', { exact: true }).selectOption('home');
		await page.getByRole('button', { name: 'Guardar tipo' }).click();
		await expect(page.getByText('Tipo de lista actualizado.')).toBeVisible();
		await expect(page.getByLabel('Tipo de lista', { exact: true })).toHaveValue('home');

		const { data: privateHistoryId, error: privateHistoryError } = await owner.rpc(
			'create_typed_family_list',
			{
				p_family_id: familyId!,
				p_title: `Privada ${suffix}`,
				p_description: '',
				p_visibility: 'private',
				p_member_ids: [],
				p_list_type: 'shopping'
			}
		);
		expect(privateHistoryError).toBeNull();
		expect(
			(
				await owner.rpc('add_family_list_item', {
					p_list_id: privateHistoryId!,
					p_title: 'Plátanos',
					p_quantity: 2,
					p_unit: 'kg'
				})
			).error
		).toBeNull();
		await page.reload();
		await page.getByRole('button', { name: '+ Nueva lista' }).click();
		await listForm.getByLabel('Empezar desde tu histórico').selectOption(privateHistoryId!);
		await expect(listForm.getByLabel('Visibilidad')).toHaveValue('private');
		await listForm.getByLabel('Nombre').fill(`Copia privada ${suffix}`);
		await listForm.getByRole('button', { name: 'Crear lista' }).click();
		await expect(page.getByText('Lista creada.')).toBeVisible();
		const { data: privateCopy } = await owner
			.from('family_lists')
			.select('id, visibility')
			.eq('title', `Copia privada ${suffix}`)
			.single();
		expect(privateCopy?.visibility).toBe('private');
		expect(
			(await member.from('family_list_items').select('id').eq('list_id', privateCopy!.id)).data
		).toEqual([]);

		if (testInfo.project.name === 'mobile-chromium') {
			await page.goto(`/family/${familyId}/lists?list=${storedList!.id}`);
			const bodyWidth = await page.locator('body').evaluate((element) => element.scrollWidth);
			expect(bodyWidth).toBeLessThanOrEqual(testInfo.project.use.viewport!.width + 1);
			await expect(page.getByRole('checkbox', { name: 'Marcar Pan como comprado' })).toHaveCSS(
				'width',
				'32px'
			);
		}
	} finally {
		if (familyId) await admin.from('families').delete().eq('id', familyId);
		for (const userId of createdUserIds) await admin.auth.admin.deleteUser(userId);
	}
});
