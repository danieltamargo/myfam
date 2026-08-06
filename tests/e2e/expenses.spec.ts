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

		await signIn(page, ownerEmail, password);
		await page.goto(`/family/${familyId}/expenses/${collectionId}?period=month&anchor=2026-08-15`);
		await expect(page.getByRole('heading', { name: `Casa ${suffix}` })).toBeVisible();
		await expect(page.getByTestId('expenses-current-total')).toContainText('125,50');
		await expect(page.getByText(`Supermercado ${suffix}`, { exact: true }).first()).toBeVisible();
		await expect(page.getByText(`Fuera de periodo ${suffix}`)).toHaveCount(0);
		await expect(page.getByRole('link', { name: 'Añadir gasto' })).toBeVisible();

		await page.waitForTimeout(750);
		const categoryFilter = page.getByTestId('expenses-filter-category');
		await categoryFilter.selectOption(foodCategory.id);
		await expect(categoryFilter).toHaveValue(foodCategory.id);
		await page.getByRole('button', { name: 'Aplicar filtros' }).click();
		await expect(page).toHaveURL(new RegExp(`category=${foodCategory.id}`));
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

		await page.goto(`/family/${familyId}/expenses/${collectionId}?period=month&anchor=2026-08-15`);
		const createForm = page.locator('#nuevo-gasto');
		await createForm.getByLabel('Concepto').fill(`Farmacia ${suffix}`);
		await createForm.getByLabel('Importe', { exact: true }).fill('18.25');
		await createForm.getByLabel('Fecha').fill('2026-08-20');
		await createForm.getByRole('button', { name: 'Añadir gasto' }).press('Enter');
		await expect(page.getByText(`Farmacia ${suffix}`, { exact: true })).toBeVisible();
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

		await page.getByText('Programar un gasto recurrente', { exact: true }).press('Enter');
		const recurringForm = page.locator('form[action="?/createRecurring"]');
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
	} finally {
		if (familyId) await admin.from('families').delete().eq('id', familyId);
		for (const userId of createdUserIds) await admin.auth.admin.deleteUser(userId);
	}
});
