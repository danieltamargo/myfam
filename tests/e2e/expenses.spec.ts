import { createHmac, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
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

test('filtra, exporta y gestiona repartos respetando el acceso de solo lectura', async ({
	page
}) => {
	test.setTimeout(120_000);
	const status = getLocalSupabaseStatus();
	const admin = createClient<Database>(status.API_URL, status.SECRET_KEY, {
		auth: { autoRefreshToken: false, persistSession: false }
	});
	const suffix = randomUUID();
	const password = 'ExpensesE2E-2026!';
	const ownerEmail = `expenses-owner-${suffix}@example.test`;
	const viewerEmail = `expenses-viewer-${suffix}@example.test`;
	const createdUserIds: string[] = [];
	let familyId: string | undefined;
	let collectionId: string | undefined;

	try {
		const createdUsers = await Promise.all(
			[
				[ownerEmail, 'Owner Gastos'],
				[viewerEmail, 'Viewer Gastos']
			].map(([email, name]) =>
				admin.auth.admin.createUser({
					email,
					password,
					email_confirm: true,
					user_metadata: { name }
				})
			)
		);
		for (const result of createdUsers) {
			expect(result.error).toBeNull();
			expect(result.data.user?.id).toBeTruthy();
			createdUserIds.push(result.data.user!.id);
		}

		const ownerId = createdUserIds[0]!;
		const viewerId = createdUserIds[1]!;
		const owner = createUserClient(status, ownerId, ownerEmail);
		const viewer = createUserClient(status, viewerId, viewerEmail);
		const { data: createdFamilyId, error: familyError } = await owner.rpc('create_family', {
			p_name: `Gastos E2E ${suffix}`
		});
		expect(familyError).toBeNull();
		familyId = createdFamilyId ?? undefined;
		expect(familyId).toBeTruthy();

		const { data: familyInvitationId, error: inviteFamilyError } = await owner.rpc(
			'invite_family_member',
			{ p_family_id: familyId!, p_email: viewerEmail }
		);
		expect(inviteFamilyError).toBeNull();
		expect(
			(await viewer.rpc('accept_family_invitation', { p_invitation_id: familyInvitationId! })).error
		).toBeNull();

		const { data: createdCollectionId, error: collectionError } = await owner.rpc(
			'create_expense_collection',
			{ p_family_id: familyId!, p_name: `Casa ${suffix}`, p_currency: 'EUR' }
		);
		expect(collectionError).toBeNull();
		collectionId = createdCollectionId ?? undefined;
		expect(collectionId).toBeTruthy();
		expect(
			(
				await owner.rpc('invite_expense_collection_member', {
					p_collection_id: collectionId!,
					p_user_id: viewerId,
					p_role: 'viewer'
				})
			).error
		).toBeNull();
		expect(
			(
				await viewer.rpc('accept_expense_collection_invitation', {
					p_collection_id: collectionId!
				})
			).error
		).toBeNull();

		const { data: categories, error: categoriesError } = await owner
			.from('expense_categories')
			.select('id, name')
			.eq('collection_id', collectionId!);
		expect(categoriesError).toBeNull();
		const foodCategory = categories!.find((category) => category.name === 'Alimentación')!;
		const homeCategory = categories!.find((category) => category.name === 'Hogar')!;
		const { error: seedError } = await owner.from('expenses').insert([
			{
				collection_id: collectionId!,
				category_id: foodCategory.id,
				created_by: ownerId,
				paid_by: ownerId,
				description: `Supermercado ${suffix}`,
				amount: 75.5,
				occurred_on: '2026-08-03'
			},
			{
				collection_id: collectionId!,
				category_id: homeCategory.id,
				created_by: ownerId,
				paid_by: viewerId,
				description: `Electricidad ${suffix}`,
				amount: 50,
				occurred_on: '2026-08-12'
			},
			{
				collection_id: collectionId!,
				category_id: foodCategory.id,
				created_by: ownerId,
				paid_by: ownerId,
				description: `Fuera de periodo ${suffix}`,
				amount: 999,
				occurred_on: '2026-09-01'
			}
		]);
		expect(seedError).toBeNull();
		const eventId = randomUUID();
		const otherEventId = randomUUID();
		expect(
			(
				await admin.from('calendar_events').insert([
					{
						id: eventId,
						family_id: familyId!,
						created_by: ownerId,
						title: `Viaje ${suffix}`,
						starts_at: '2026-08-20T10:00:00Z',
						ends_at: '2026-08-20T11:00:00Z',
						timezone: 'UTC',
						visibility: 'family'
					},
					{
						id: otherEventId,
						family_id: familyId!,
						created_by: ownerId,
						title: `Celebración ${suffix}`,
						starts_at: '2026-08-21T10:00:00Z',
						ends_at: '2026-08-21T11:00:00Z',
						timezone: 'UTC',
						visibility: 'family'
					}
				])
			).error
		).toBeNull();

		expect(
			(
				await admin
					.from('profiles')
					.update({ avatar_url: 'http://127.0.0.1:5173/missing-avatar.png' })
					.eq('id', ownerId)
			).error
		).toBeNull();
		await signIn(page, ownerEmail, password);
		await page.goto(`/family/${familyId}/expenses/${collectionId}?period=month&anchor=2026-08-15`);
		await expect(page.getByRole('heading', { name: `Casa ${suffix}` })).toBeVisible();
		await expect(page.getByTestId('expenses-current-total')).toContainText('125,50');
		await expect(page.getByText(`Supermercado ${suffix}`, { exact: true }).first()).toBeVisible();
		await expect(page.getByText(`Fuera de periodo ${suffix}`)).toHaveCount(0);
		await expect(page.getByRole('link', { name: 'Añadir gasto' })).toBeVisible();

		await page.waitForTimeout(750);
		const categoryFilter = page.getByTestId('expenses-filter-category');
		await page.getByTitle('Owner Gastos', { exact: true }).click();
		await expect(
			page.getByTitle('Owner Gastos', { exact: true }).getByText('OG', { exact: true })
		).toBeVisible();
		await categoryFilter.selectOption(foodCategory.id);
		await expect(categoryFilter).toHaveValue(foodCategory.id);
		await page.getByRole('button', { name: 'Aplicar filtros' }).click();
		await expect(page).toHaveURL(new RegExp(`category=${foodCategory.id}`));
		await expect(page).toHaveURL(new RegExp(`paid_by=${ownerId}`));
		await expect(page.getByTestId('expenses-current-total')).toContainText('75,50');
		await expect(page.getByText(`Electricidad ${suffix}`)).toHaveCount(0);

		const downloadPromise = page.waitForEvent('download');
		await page.getByTestId('expenses-export').click();
		const download = await downloadPromise;
		const downloadPath = await download.path();
		expect(downloadPath).toBeTruthy();
		const csv = await readFile(downloadPath!, 'utf8');
		expect(csv).toContain(`Supermercado ${suffix}`);
		expect(csv).not.toContain(`Electricidad ${suffix}`);
		expect(csv).not.toContain(`Fuera de periodo ${suffix}`);

		const { data: forbiddenUpdate, error: forbiddenError } = await viewer
			.from('expenses')
			.update({ description: 'No permitido' })
			.eq('collection_id', collectionId!)
			.select('id');
		expect(forbiddenError).toBeNull();
		expect(forbiddenUpdate).toEqual([]);
		const { data: viewerExpenses, error: viewerReadError } = await viewer
			.from('expenses')
			.select('id')
			.eq('collection_id', collectionId!);
		expect(viewerReadError).toBeNull();
		expect(viewerExpenses).toHaveLength(3);

		await page.goto(`/family/${familyId}/calendar?event=${eventId}&view=agenda&date=2026-08-15`);
		await page.getByRole('link', { name: 'Añadir gasto de este evento' }).click();
		await expect(page.getByText('Elige una colección', { exact: false })).toBeVisible();
		await page.locator(`a[href*="/expenses/${collectionId}"]`).click();
		await expect(page.getByRole('combobox', { name: 'Evento', exact: true })).toHaveValue(eventId);
		await page.goto(
			`/family/${familyId}/expenses/${collectionId}?period=month&anchor=2026-08-15&event=${eventId}`
		);
		const createForm = page.locator('#nuevo-gasto');
		await createForm.getByLabel('Concepto').fill(`Farmacia ${suffix}`);
		await createForm.getByLabel('Importe', { exact: true }).fill('18.25');
		await createForm.getByLabel('Fecha').fill('2026-08-20');
		await createForm.getByRole('button', { name: 'Añadir gasto' }).press('Enter');
		await expect(page.getByText(`Farmacia ${suffix}`, { exact: true })).toBeVisible();
		await expect(page).toHaveURL(/anchor=2026-08-15/);
		await expect(page.getByTestId('expenses-current-total')).toContainText('143,75');

		const { data: createdExpense, error: createdExpenseError } = await owner
			.from('expenses')
			.select('id')
			.eq('collection_id', collectionId!)
			.eq('description', `Farmacia ${suffix}`)
			.single();
		expect(createdExpenseError).toBeNull();
		const { data: createdSplits, error: createdSplitsError } = await owner
			.from('expense_splits')
			.select('amount')
			.eq('expense_id', createdExpense!.id);
		expect(createdSplitsError).toBeNull();
		expect(createdSplits).toHaveLength(2);
		expect(createdSplits!.reduce((sum, split) => sum + Number(split.amount), 0)).toBe(18.25);
		await expect(page.getByRole('link', { name: `Viaje ${suffix}`, exact: true })).toBeVisible();
		await page.getByRole('link', { name: `Viaje ${suffix}`, exact: true }).click();
		await expect(page).toHaveURL(/date=2026-08-20/);
		await expect(page.getByRole('link', { name: 'Añadir gasto de este evento' })).toBeVisible();
		await page.goto(`/family/${familyId}/expenses/${collectionId}?period=month&anchor=2026-08-15`);
		expect(
			(
				await owner
					.from('expense_event_links')
					.select('event_id')
					.eq('expense_id', createdExpense!.id)
					.single()
			).data?.event_id
		).toBe(eventId);
		const editForm = page
			.locator(`form[action*="/updateExpense"]`)
			.filter({ has: page.locator(`input[name="expense_id"][value="${createdExpense!.id}"]`) });
		await page.locator(`#editar-${createdExpense!.id} summary`).click();
		await editForm
			.getByRole('combobox', { name: 'Evento', exact: true })
			.selectOption(otherEventId);
		await editForm.getByRole('button', { name: 'Guardar cambios' }).click();
		await expect(
			page.getByRole('link', { name: `Celebración ${suffix}`, exact: true })
		).toBeVisible();
		await page.locator(`#editar-${createdExpense!.id} summary`).click();
		await editForm.getByRole('combobox', { name: 'Evento', exact: true }).selectOption('');
		await editForm.getByRole('button', { name: 'Guardar cambios' }).click();
		expect(
			(
				await owner
					.from('expense_event_links')
					.select('event_id')
					.eq('expense_id', createdExpense!.id)
			).data
		).toEqual([]);

		await page.getByText('Programar un gasto recurrente', { exact: true }).press('Enter');
		const recurringForm = page.locator('form[action*="/createRecurring"]');
		await recurringForm.getByLabel('Concepto').fill(`Internet ${suffix}`);
		await recurringForm.getByLabel('Importe', { exact: true }).fill('12.00');
		await recurringForm.getByLabel('Próxima fecha').fill('2026-08-25');
		await recurringForm.getByRole('button', { name: 'Guardar regla' }).press('Enter');
		await expect(page.getByText(`Internet ${suffix}`, { exact: true })).toBeVisible();
		const { data: recurringRule, error: recurringRuleError } = await owner
			.from('recurring_expense_rules')
			.select('id')
			.eq('collection_id', collectionId!)
			.eq('description', `Internet ${suffix}`)
			.single();
		expect(recurringRuleError).toBeNull();
		expect(
			(
				await owner
					.from('recurring_expense_splits')
					.select('user_id')
					.eq('rule_id', recurringRule!.id)
			).data
		).toHaveLength(2);

		const { data: processedCount, error: processingError } = await admin.rpc(
			'process_due_recurring_expenses',
			{ p_as_of: '2026-08-25' }
		);
		expect(processingError).toBeNull();
		expect(processedCount).toBe(1);
		await page.reload();
		await expect(page.getByTestId('expenses-current-total')).toContainText('155,75');
		await expect(page.getByText(`Internet ${suffix}`, { exact: true }).first()).toBeVisible();
		await expect(
			page.getByText(
				'Hay gastos con repartos incompletos. Completa sus repartos antes de registrar reembolsos.'
			)
		).toBeVisible();
		await expect(page.getByRole('button', { name: 'Registrar pago realizado' })).toHaveCount(0);

		const { data: settlementCollectionId, error: settlementCollectionError } = await owner.rpc(
			'create_expense_collection',
			{
				p_family_id: familyId!,
				p_name: `Reembolsos ${suffix}`,
				p_currency: 'EUR'
			}
		);
		expect(settlementCollectionError).toBeNull();
		expect(
			(
				await owner.rpc('invite_expense_collection_member', {
					p_collection_id: settlementCollectionId!,
					p_user_id: viewerId,
					p_role: 'viewer'
				})
			).error
		).toBeNull();
		expect(
			(
				await viewer.rpc('accept_expense_collection_invitation', {
					p_collection_id: settlementCollectionId!
				})
			).error
		).toBeNull();
		expect(
			(
				await owner.rpc('create_expense_with_splits', {
					p_collection_id: settlementCollectionId!,
					p_paid_by: ownerId,
					p_description: 'Reparto con céntimos',
					p_category_id: null as unknown as string,
					p_notes: null as unknown as string,
					p_receipt_path: null as unknown as string,
					p_amount: 10.01,
					p_occurred_on: '2026-08-20',
					p_splits: [
						{ user_id: ownerId, amount: 3.33 },
						{ user_id: viewerId, amount: 6.68 }
					]
				})
			).error
		).toBeNull();
		await page.goto(
			`/family/${familyId}/expenses/${settlementCollectionId}?period=month&anchor=2026-08-15`
		);

		const settlementForm = page.locator('form[action*="/recordSettlement"]').first();
		const settlementAction = await settlementForm.getAttribute('action');
		const settlementPayload = await settlementForm
			.locator('input[type="hidden"]')
			.evaluateAll((inputs) =>
				Object.fromEntries(
					inputs.map((input) => [
						(input as HTMLInputElement).name,
						(input as HTMLInputElement).value
					])
				)
			);
		await settlementForm.getByRole('button', { name: 'Registrar pago realizado' }).click();
		await expect(
			page.getByText('Reembolso registrado. No se ha realizado ninguna transferencia bancaria.')
		).toBeVisible();
		await expect(page.getByText('No hay reembolsos pendientes.')).toBeVisible();
		await expect(page).toHaveURL(/anchor=2026-08-15/);
		const retry = await page.request.post(new URL(settlementAction!, page.url()).href, {
			form: settlementPayload,
			headers: { Origin: new URL(page.url()).origin }
		});
		expect(retry.status()).toBe(200);
		const { data: recordedPayments, error: recordedPaymentsError } = await owner
			.from('expense_settlements')
			.select('id')
			.eq('collection_id', settlementCollectionId!);
		expect(recordedPaymentsError).toBeNull();
		expect(recordedPayments).toHaveLength(1);
		const { data: finalBalances } = await owner.rpc('get_expense_settlement_balances', {
			p_collection_id: settlementCollectionId!
		});
		expect(finalBalances?.every((balance) => Number(balance.balance_cents) === 0)).toBe(true);
	} finally {
		if (familyId) await admin.from('families').delete().eq('id', familyId);
		for (const userId of createdUserIds) await admin.auth.admin.deleteUser(userId);
	}
});
