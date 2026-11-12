import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import type { Database } from '../../src/lib/types/database';

test('actualiza el calendario en segundo plano y conserva un borrador al recibir cambios', async ({
	page
}) => {
	test.setTimeout(90_000);
	const status = JSON.parse(
		execFileSync('supabase', ['status', '-o', 'json'], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		})
	) as { API_URL: string; ANON_KEY: string; SECRET_KEY: string };
	const admin = createClient<Database>(status.API_URL, status.SECRET_KEY, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
	const owner = createClient<Database>(status.API_URL, status.ANON_KEY, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
	const email = `calendar-auto-${randomUUID()}@example.test`;
	const password = 'CalendarAuto-2026!';
	let userId: string | undefined;
	let familyId: string | undefined;
	const eventId = randomUUID();
	let syncRequests = 0;
	let calendarLoads = 0;
	try {
		const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
		expect(created.error).toBeNull();
		userId = created.data.user!.id;
		expect((await owner.auth.signInWithPassword({ email, password })).error).toBeNull();
		const family = await owner.rpc('create_family', { p_name: 'Calendario automático de prueba' });
		expect(family.error).toBeNull();
		familyId = family.data!;
		expect(
			(
				await admin.from('calendar_events').insert({
					id: eventId,
					family_id: familyId,
					created_by: userId,
					title: 'Agenda original',
					starts_at: '2026-11-09T10:00:00Z',
					ends_at: '2026-11-09T11:00:00Z',
					timezone: 'UTC',
					visibility: 'family'
				})
			).error
		).toBeNull();
		expect(
			(
				await admin.from('external_connections').insert({
					family_id: familyId,
					user_id: userId,
					provider: 'google_calendar',
					metadata: {
						calendars: [{ id: 'owned', label: 'Prueba', timezone: 'UTC' }],
						calendarId: 'owned',
						calendarLabel: 'Prueba',
						timezone: 'UTC'
					}
				})
			).error
		).toBeNull();
		await page.route(`**/family/${familyId}/calendar/sync`, async (route) => {
			syncRequests++;
			if (syncRequests <= 2) {
				const updated = await admin
					.from('calendar_events')
					.update({ title: syncRequests === 1 ? 'Agenda sincronizada' : 'Cambio remoto posterior' })
					.eq('id', eventId);
				expect(updated.error).toBeNull();
			}
			if (syncRequests === 3)
				expect(
					(
						await admin
							.from('calendar_events')
							.update({ starts_at: '2028-01-01T10:00:00Z', ends_at: '2028-01-01T11:00:00Z' })
							.eq('id', eventId)
					).error
				).toBeNull();
			if (syncRequests === 4)
				expect((await admin.from('calendar_events').delete().eq('id', eventId)).error).toBeNull();
			await route.fulfill({
				json: {
					changed: syncRequests <= 4,
					results: [
						{ provider: 'google_calendar', status: 'synced', conflicts: 0 },
						{ provider: 'microsoft_calendar', status: 'unconfigured' }
					]
				}
			});
		});
		page.on('request', (request) => {
			if (request.url().includes('/calendar/__data.json')) calendarLoads++;
		});
		await page.goto('/login');
		await page.waitForTimeout(750);
		await page.getByLabel('Correo electrónico').fill(email);
		await page.getByLabel('Contraseña').fill(password);
		await page.getByRole('button', { name: 'Iniciar sesión' }).click();
		await page.waitForURL('**/dashboard');
		await page.clock.install();
		await page.goto(`/family/${familyId}/calendar?view=agenda&date=2026-11-09&event=${eventId}`);
		await expect(
			page.getByRole('heading', { name: 'Agenda sincronizada', exact: true, level: 2 })
		).toBeVisible();
		expect(syncRequests).toBe(1);
		await page.clock.runFor(30_000);
		expect(syncRequests).toBe(1);
		await page.getByText('Editar evento', { exact: true }).click();
		const editForm = page.locator('form[action="?/updateEvent"]');
		await editForm.getByLabel('Título', { exact: true }).fill('Borrador sin guardar');
		const version = await editForm.locator('input[name="version"]').inputValue();
		await page.clock.runFor(90_000);
		await expect(
			page.getByRole('heading', { name: 'Cambio remoto posterior', exact: true, level: 2 })
		).toBeVisible();
		await expect(editForm.getByLabel('Título', { exact: true })).toHaveValue(
			'Borrador sin guardar'
		);
		await expect(editForm.locator('input[name="version"]')).toHaveValue(version);
		expect(syncRequests).toBe(2);
		await page.clock.runFor(120_000);
		await expect.poll(() => syncRequests).toBe(3);
		await expect(
			page.getByText('El evento ya no aparece en esta vista.', { exact: false })
		).toBeVisible();
		await expect(editForm.getByLabel('Título', { exact: true })).toHaveValue(
			'Borrador sin guardar'
		);
		await expect(editForm.locator('input[name="version"]')).toHaveValue(version);
		await page.clock.runFor(120_000);
		await expect.poll(() => syncRequests).toBe(4);
		await expect(page.getByText('Comprobando cambios en tus calendarios…')).toHaveCount(0);
		await expect(editForm.getByLabel('Título', { exact: true })).toHaveValue(
			'Borrador sin guardar'
		);
		const loadsBeforeQuietSync = calendarLoads;
		await page.clock.runFor(120_000);
		await expect.poll(() => syncRequests).toBe(5);
		await expect(page.getByText('Comprobando cambios en tus calendarios…')).toHaveCount(0);
		expect(calendarLoads).toBe(loadsBeforeQuietSync);
		await page.goto(`/family/${familyId}/members`);
		await page.clock.runFor(120_000);
		expect(syncRequests).toBe(5);
	} finally {
		if (familyId) {
			expect(
				(await admin.from('external_connections').delete().eq('family_id', familyId)).error
			).toBeNull();
			expect((await admin.from('families').delete().eq('id', familyId)).error).toBeNull();
		}
		if (userId) expect((await admin.auth.admin.deleteUser(userId)).error).toBeNull();
	}
});
