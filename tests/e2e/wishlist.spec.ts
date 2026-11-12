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
		execFileSync(executable, args, {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		})
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

test('coordina cantidades sin spoilers entre owner, comprador y usuario externo', async ({
	page,
	browser
}, testInfo) => {
	const receivedCommentIds = new Set<string>();
	page.on('websocket', (socket) => {
		if (!socket.url().includes('/realtime/')) return;
		socket.on('framereceived', ({ payload }) => {
			const frame = JSON.parse(String(payload));
			const event = Array.isArray(frame) ? frame[3] : frame.event;
			const body = Array.isArray(frame) ? frame[4] : frame.payload;
			const change = body?.data;
			if (
				event === 'postgres_changes' &&
				change?.table === 'gift_item_comments' &&
				typeof change.record?.id === 'string'
			) {
				receivedCommentIds.add(change.record.id);
			}
		});
	});
	test.setTimeout(120_000);
	const status = getLocalSupabaseStatus();
	const admin = createClient<Database>(status.API_URL, status.SECRET_KEY, {
		auth: { autoRefreshToken: false, persistSession: false }
	});
	const suffix = randomUUID();
	const password = 'WishlistE2E-2026!';
	const ownerEmail = `wishlist-owner-${suffix}@example.test`;
	const buyerEmail = `wishlist-buyer-${suffix}@example.test`;
	const outsiderEmail = `wishlist-outsider-${suffix}@example.test`;
	const createdUserIds: string[] = [];
	let familyId: string | undefined;
	let ownerContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;
	let outsiderContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;

	try {
		const createdUsers = await Promise.all(
			[
				[ownerEmail, 'Owner Wishlist'],
				[buyerEmail, 'Comprador Wishlist'],
				[outsiderEmail, 'Externo Wishlist']
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
		const buyerId = createdUserIds[1]!;
		const outsiderId = createdUserIds[2]!;
		const owner = createUserClient(status, ownerId, ownerEmail);
		const buyer = createUserClient(status, buyerId, buyerEmail);
		const outsider = createUserClient(status, outsiderId, outsiderEmail);

		const { data: createdFamilyId, error: familyError } = await owner.rpc('create_family', {
			p_name: `Wishlist E2E ${suffix}`
		});
		expect(familyError).toBeNull();
		familyId = createdFamilyId ?? undefined;
		expect(familyId).toBeTruthy();

		const { data: invitationId, error: invitationError } = await owner.rpc('invite_family_member', {
			p_family_id: familyId!,
			p_email: buyerEmail
		});
		expect(invitationError).toBeNull();
		const { error: acceptError } = await buyer.rpc('accept_family_invitation', {
			p_invitation_id: invitationId!
		});
		expect(acceptError).toBeNull();

		const { data: category, error: categoryError } = await owner
			.from('gift_event_categories')
			.select('id')
			.eq('family_id', familyId!)
			.neq('name', 'Todos')
			.limit(1)
			.single();
		expect(categoryError).toBeNull();

		const itemName = `Juego cooperativo ${suffix}`;
		const { data: item, error: itemError } = await owner
			.from('gift_items')
			.insert({
				family_id: familyId!,
				owner_id: ownerId,
				name: itemName,
				description: 'Regalo de prueba coordinado entre varias personas.',
				desired_quantity: 3,
				priority: 2,
				currency: 'EUR',
				price: 30
			})
			.select('id')
			.single();
		expect(itemError).toBeNull();
		expect(item?.id).toBeTruthy();
		const { error: eventError } = await owner.from('gift_item_events').insert({
			item_id: item!.id,
			event_category_id: category!.id
		});
		expect(eventError).toBeNull();

		const { error: reserveError } = await buyer.rpc('reserve_gift_item', {
			p_item_id: item!.id,
			p_quantity: 2,
			p_status: 'considering'
		});
		expect(reserveError).toBeNull();

		const [{ data: ownerReservations }, { data: buyerReservations }, outsiderItem] =
			await Promise.all([
				owner.from('gift_reservations').select('id').eq('item_id', item!.id),
				buyer.from('gift_reservations').select('quantity').eq('item_id', item!.id),
				outsider.from('gift_items').select('id').eq('id', item!.id)
			]);
		expect(ownerReservations).toEqual([]);
		expect(buyerReservations).toEqual([{ quantity: 2 }]);
		expect(outsiderItem.data).toEqual([]);
		const { error: outsiderPurchaseError } = await outsider.rpc('purchase_gift_item', {
			p_item_id: item!.id,
			p_quantity: 1
		});
		expect(outsiderPurchaseError?.code).toBe('42501');

		await signIn(page, buyerEmail, password);
		await page.goto(`/family/${familyId}/wishlist?item=${item!.id}`);
		const dialog = page.getByRole('dialog', { name: 'Detalle del regalo' });
		await expect(dialog).toBeVisible();
		await expect(dialog).toBeFocused();
		await expect(dialog.getByText('1 unidad disponible')).toBeVisible();
		await expect(dialog.getByText('2 en consideración')).toBeVisible();

		const purchaseQuantity = dialog.getByLabel('Cantidad').nth(1);
		await purchaseQuantity.fill('2');
		if (testInfo.project.name === 'mobile-chromium') await purchaseQuantity.press('Enter');
		else await dialog.getByRole('button', { name: 'Marcar comprado' }).click();
		await expect(dialog.getByText('1 unidad disponible')).toBeVisible();
		await expect(dialog.getByText('2 compradas')).toBeVisible();

		const [{ data: reservationsAfterPurchase }, { data: purchasesAfterPurchase }] =
			await Promise.all([
				buyer.from('gift_reservations').select('id').eq('item_id', item!.id),
				buyer.from('gift_purchases').select('quantity_purchased').eq('item_id', item!.id)
			]);
		expect(reservationsAfterPurchase).toEqual([]);
		expect(purchasesAfterPurchase).toEqual([{ quantity_purchased: 2 }]);

		if (testInfo.project.name === 'mobile-chromium') await page.keyboard.press('Escape');
		else await dialog.getByRole('button', { name: 'Cerrar' }).click();
		await expect(page).not.toHaveURL(/item=/);
		await page.getByTestId('wishlist-filter-member').selectOption(ownerId);
		await page.getByTestId('wishlist-filter-category').selectOption(category!.id);
		await page.getByTestId('wishlist-filter-priority').selectOption('2');
		await page.getByTestId('wishlist-filter-status').selectOption('purchased');
		await expect(page).toHaveURL(new RegExp(`member=${ownerId}`));
		await expect(page).toHaveURL(new RegExp(`category=${category!.id}`));
		await expect(page).toHaveURL(/priority=2/);
		await expect(page).toHaveURL(/status=purchased/);
		await page.reload();
		await expect(page.getByTestId('wishlist-filter-priority')).toHaveValue('2');
		await expect(page.getByText(itemName)).toBeVisible();
		await page.keyboard.press('Tab');
		await expect(page.locator(':focus')).toBeVisible();

		ownerContext = await browser.newContext();
		const ownerPage = await ownerContext.newPage();
		await ownerPage.clock.install();
		await signIn(ownerPage, ownerEmail, password);
		await ownerPage.goto(`/family/${familyId}/wishlist?item=${item!.id}`);
		const ownerDialog = ownerPage.getByRole('dialog', { name: 'Detalle del regalo' });
		await expect(ownerDialog.getByText('La coordinación está oculta')).toBeVisible();
		await expect(ownerDialog.getByTestId('wishlist-coordination')).toHaveCount(0);
		await page
			.getByTestId(`wishlist-item-${item!.id}`)
			.getByRole('button', { name: 'Ver detalles', exact: true })
			.click();
		await expect(dialog).toBeVisible();
		const remoteComment = `Coordinación privada ${suffix}`;
		const { data: createdComment, error: commentError } = await buyer
			.from('gift_item_comments')
			.insert({ item_id: item!.id, author_id: buyerId, content: remoteComment })
			.select('id')
			.single();
		expect(commentError).toBeNull();
		await expect
			.poll(() => receivedCommentIds.has(createdComment!.id), { timeout: 10_000 })
			.toBe(true);
		await expect(dialog.getByText(remoteComment, { exact: true })).toBeVisible();
		await expect(ownerDialog.getByText(remoteComment, { exact: true })).toHaveCount(0);
		await expect(ownerDialog.getByText('La coordinación está oculta')).toBeVisible();
		expect(
			(await owner.from('gift_item_comments').select('id').eq('id', createdComment!.id)).data
		).toEqual([]);
		await page.keyboard.press('Escape');
		await expect(dialog).not.toBeVisible();

		await ownerPage.keyboard.press('Escape');
		await expect(ownerPage).not.toHaveURL(/item=/);
		const { data: linkedCalendarEvent, error: linkedCalendarError } = await admin
			.from('calendar_events')
			.insert({
				family_id: familyId!,
				created_by: ownerId,
				title: `Evento privado ${suffix}`,
				starts_at: '2026-11-01T10:00:00Z',
				ends_at: '2026-11-01T11:00:00Z',
				timezone: 'UTC',
				visibility: 'selected_members'
			})
			.select('id')
			.single();
		expect(linkedCalendarError).toBeNull();
		await ownerPage.reload();
		await ownerPage
			.getByTestId(`wishlist-item-${item!.id}`)
			.getByRole('button', { name: 'Editar', exact: true })
			.click();
		const editDialog = ownerPage.getByRole('dialog', { name: 'Editar regalo' });
		await editDialog
			.getByLabel('Evento del calendario (opcional)')
			.selectOption(linkedCalendarEvent!.id);
		await editDialog.getByRole('button', { name: 'Guardar cambios' }).click();
		await expect(editDialog).not.toBeVisible();
		expect(
			(await owner.from('gift_calendar_event_links').select('event_id').eq('item_id', item!.id))
				.data
		).toEqual([{ event_id: linkedCalendarEvent!.id }]);
		expect(
			(await buyer.from('gift_calendar_event_links').select('event_id').eq('item_id', item!.id))
				.data
		).toEqual([]);

		const downloadPromise = ownerPage.waitForEvent('download');
		await ownerPage.getByRole('button', { name: 'Exportar mi lista' }).click();
		const download = await downloadPromise;
		const downloadPath = await download.path();
		expect(downloadPath).toBeTruthy();
		const exported = JSON.parse(await readFile(downloadPath!, 'utf8')) as Record<string, unknown>;
		const serializedExport = JSON.stringify(exported);
		expect(serializedExport).toContain(itemName);
		expect(serializedExport).not.toContain('purchase');
		expect(serializedExport).not.toContain('reservation');
		expect(serializedExport).not.toContain('image_url');

		await ownerPage.goto(`/family/${familyId}/wishlist?item=${item!.id}`);
		await expect(ownerDialog.getByRole('button', { name: 'Marcar como recibido' })).toHaveCount(0);
		await ownerPage.keyboard.press('Escape');
		const showPurchased = ownerPage.getByRole('button', { name: 'Mostrar mis regalos comprados' });
		await showPurchased.click();
		const spoilersDialog = ownerPage.getByRole('dialog', { name: '¿Mostrar regalos comprados?' });
		await spoilersDialog.getByRole('button', { name: 'Cancelar' }).click();
		const purchased = ownerPage.getByRole('region', { name: 'Mis regalos comprados' });
		await expect(purchased).toHaveCount(0);
		await showPurchased.click();
		await spoilersDialog.getByRole('button', { name: 'Mostrar regalos comprados' }).click();
		await purchased.getByRole('button', { name: itemName, exact: true }).click();
		await ownerDialog.getByRole('button', { name: 'Marcar como recibido' }).click();
		await expect(ownerDialog).not.toBeVisible();
		await expect(ownerPage.getByTestId(`wishlist-item-${item!.id}`)).toHaveCount(0);
		let refreshResponses = 0;
		const drainedRefresh = ownerPage.waitForResponse((response) => {
			const url = new URL(response.url());
			const activeRefresh =
				url.pathname.endsWith('/wishlist/__data.json') && !url.searchParams.has('view');
			if (activeRefresh) refreshResponses += 1;
			return activeRefresh;
		});
		await expect
			.poll(async () => {
				await ownerPage.evaluate(() => window.dispatchEvent(new Event('focus')));
				await ownerPage.clock.runFor(100);
				return refreshResponses;
			})
			.toBeGreaterThan(0);
		await (await drainedRefresh).finished();
		await ownerPage.clock.runFor(100);
		let releaseHistory: () => void = () => {};
		const historyBarrier = new Promise<void>((resolve) => (releaseHistory = resolve));
		let historyRequested: () => void = () => {};
		const historyRequest = new Promise<void>((resolve) => (historyRequested = resolve));
		let historyPending = false;
		const competingRefreshes: string[] = [];
		await ownerPage.route('**/wishlist/__data.json?*', async (route) => {
			if (new URL(route.request().url()).searchParams.get('view') === 'history') {
				historyPending = true;
				historyRequested();
				await historyBarrier;
			} else if (historyPending) {
				competingRefreshes.push(new URL(route.request().url()).pathname);
			}
			await route.continue();
		});
		const openHistory = ownerPage
			.getByRole('button', { name: 'Mi histórico', exact: true })
			.click();
		try {
			await historyRequest;
			await ownerPage.evaluate(() => window.dispatchEvent(new Event('focus')));
			await ownerPage.clock.runFor(100);
		} finally {
			releaseHistory();
		}
		await openHistory;
		const history = ownerPage.getByRole('region', { name: 'Regalos recibidos' });
		await expect(ownerPage).toHaveURL(/view=history/);
		await expect(history.getByText(itemName, { exact: true })).toBeVisible();
		historyPending = false;
		expect(competingRefreshes).toEqual([]);
		await expect(history.getByText(/Comprado por/)).toHaveCount(0);
		expect((await owner.from('gift_purchases').select('id').eq('item_id', item!.id)).data).toEqual(
			[]
		);
		await history.getByRole('button', { name: 'Revelar comprador (spoiler)' }).click();
		await expect(history.getByText('Comprado por Comprador Wishlist · 2 unidades')).toBeVisible();
		await page.reload();
		await expect(page.getByTestId(`wishlist-item-${item!.id}`)).toHaveCount(0);
		await page.getByRole('button', { name: 'Mi histórico', exact: true }).click();
		await expect(
			page.getByRole('region', { name: 'Regalos recibidos' }).getByText(itemName)
		).toHaveCount(0);
		expect((await buyer.from('gift_items').select('id').eq('id', item!.id)).data).toEqual([]);

		outsiderContext = await browser.newContext();
		const outsiderPage = await outsiderContext.newPage();
		await signIn(outsiderPage, outsiderEmail, password);
		const outsiderResponse = await outsiderPage.goto(
			`/family/${familyId}/wishlist?item=${item!.id}`
		);
		expect(outsiderResponse?.status()).toBe(404);
		await expect(outsiderPage.getByText(itemName)).toHaveCount(0);
	} finally {
		await ownerContext?.close().catch(() => undefined);
		await outsiderContext?.close().catch(() => undefined);
		if (familyId) await admin.from('families').delete().eq('id', familyId);
		for (const userId of createdUserIds) await admin.auth.admin.deleteUser(userId);
	}
});
