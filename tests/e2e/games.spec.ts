import { createHmac, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import type { Database } from '../../src/lib/types/database';
import type { FamilyColorState, FamilyWordleState } from '../../src/lib/games/family-games';

function localStatus() {
	return JSON.parse(
		execFileSync('supabase', ['status', '-o', 'json'], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		})
	) as { API_URL: string; ANON_KEY: string; SECRET_KEY: string; JWT_SECRET: string };
}
async function gameFixture() {
	const status = localStatus();
	const admin = createClient<Database>(status.API_URL, status.SECRET_KEY, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
	const password = 'Family-Games-E2E-2026!';
	const users: { id: string; email: string }[] = [];
	const families: string[] = [];
	const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
	function client(index: number, aal = 'aal1') {
		const user = users[index];
		const issuedAt = Math.floor(Date.now() / 1000);
		const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, email: user.email, role: 'authenticated', aal, session_id: randomUUID(), iat: issuedAt, exp: issuedAt + 900 })}`;
		const token = `${body}.${createHmac('sha256', status.JWT_SECRET).update(body).digest('base64url')}`;
		return createClient<Database>(status.API_URL, status.ANON_KEY, {
			global: { headers: { Authorization: `Bearer ${token}` } },
			auth: { persistSession: false, autoRefreshToken: false }
		});
	}
	async function cleanup() {
		for (const familyId of families)
			expect(
				(await client(0, 'aal2').rpc('delete_family', { p_family_id: familyId })).error
			).toBeNull();
		for (const user of users) expect((await admin.auth.admin.deleteUser(user.id)).error).toBeNull();
	}
	try {
		for (const name of [
			'Creador juegos',
			'Rival juegos',
			'Familiar no invitado',
			'Usuario externo'
		]) {
			const email = `games-${randomUUID()}@example.test`;
			const result = await admin.auth.admin.createUser({
				email,
				password,
				email_confirm: true,
				user_metadata: { name }
			});
			expect(result.error).toBeNull();
			users.push({ id: result.data.user!.id, email });
		}
		const owner = client(0);
		const created = await owner.rpc('create_family', { p_name: 'Partidas E2E' });
		expect(created.error).toBeNull();
		const familyId = created.data!;
		families.push(familyId);
		for (const index of [1, 2]) {
			const invited = await owner.rpc('invite_family_member', {
				p_family_id: familyId,
				p_email: users[index].email
			});
			expect(invited.error).toBeNull();
			expect(
				(await client(index).rpc('accept_family_invitation', { p_invitation_id: invited.data! }))
					.error
			).toBeNull();
		}
		expect(
			(
				await admin
					.from('family_modules')
					.upsert(
						{ family_id: familyId, module_name: 'games', enabled: true },
						{ onConflict: 'family_id,module_name' }
					)
			).error
		).toBeNull();
		return {
			admin,
			users,
			familyId,
			password,
			owner,
			opponent: client(1),
			uninvited: client(2),
			outsider: client(3),
			cleanup
		};
	} catch (error) {
		await cleanup();
		throw error;
	}
}

async function signIn(page: Page, email: string, password: string) {
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill(email);
	await page.getByLabel('Password', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Sign In', exact: true }).click();
	await page.waitForURL('**/dashboard');
}

async function startMinigame(fixture: Awaited<ReturnType<typeof gameFixture>>, type: string) {
	const created = await fixture.owner.rpc('create_family_game', {
		p_family_id: fixture.familyId,
		p_opponent_id: fixture.users[1].id,
		p_name: type,
		p_game_type: type
	});
	expect(created.error).toBeNull();
	const roomId = created.data!;
	expect((await fixture.opponent.rpc('ready_family_game', { p_room_id: roomId })).error).toBeNull();
	expect((await fixture.owner.rpc('start_family_game', { p_room_id: roomId })).error).toBeNull();
	return roomId;
}

test('Wordle, reacción y color mantienen autoridad y secretos en sus RPC', async () => {
	const fixture = await gameFixture();
	try {
		const wordleRoom = await startMinigame(fixture, 'wordle');
		const initial = await fixture.owner
			.from('game_sessions')
			.select('game_state')
			.eq('room_id', wordleRoom)
			.single();
		expect(initial.error).toBeNull();
		expect(JSON.stringify(initial.data)).not.toMatch(
			/targetWord|wordle_answer|reaction_go_at|color_answer/
		);
		expect(
			(
				await fixture.owner
					.schema('private' as 'public')
					.from('family_game_secrets' as 'game_sessions')
					.select('*')
			).error
		).not.toBeNull();
		expect(
			(
				await fixture.owner.rpc('guess_family_wordle', {
					p_room_id: wordleRoom,
					p_version: 1,
					p_guess: 'ABCDE'
				})
			).error?.code
		).toBe('22023');
		expect(
			(
				await fixture.owner.rpc('guess_family_wordle', {
					p_room_id: wordleRoom,
					p_version: 1,
					p_guess: 'ABRIL'
				})
			).error
		).toBeNull();
		const saved = await fixture.owner
			.from('game_sessions')
			.select('game_state, version')
			.eq('room_id', wordleRoom)
			.single();
		expect(saved.data?.version).toBe(2);
		expect((saved.data?.game_state as unknown as FamilyWordleState).guesses[0].word).toBe('ABRIL');
		expect(
			(
				await fixture.outsider.rpc('guess_family_wordle', {
					p_room_id: wordleRoom,
					p_version: 2,
					p_guess: 'PERRO'
				})
			).error?.code
		).toBe('42501');

		const reactionRoom = await startMinigame(fixture, 'reaction');
		await expect
			.poll(
				async () => {
					const result = await fixture.owner.rpc('read_family_game_signal', {
						p_room_id: reactionRoom
					});
					expect(result.error).toBeNull();
					return result.data;
				},
				{ timeout: 7000, intervals: [200] }
			)
			.toBe(true);
		expect(
			(await fixture.owner.rpc('react_family_game', { p_room_id: reactionRoom, p_version: 1 }))
				.error
		).toBeNull();
		expect(
			(
				await fixture.owner
					.from('game_sessions')
					.select('winner_id, status')
					.eq('room_id', reactionRoom)
					.single()
			).data
		).toMatchObject({ winner_id: fixture.users[0].id, status: 'finished' });
		expect(
			(await fixture.outsider.rpc('read_family_game_signal', { p_room_id: reactionRoom })).error
				?.code
		).toBe('42501');

		const colorRoom = await startMinigame(fixture, 'color');
		for (let version = 1; version <= 6; version++) {
			const client = version % 2 === 1 ? fixture.owner : fixture.opponent;
			const snapshot = await client
				.from('game_sessions')
				.select('game_state')
				.eq('room_id', colorRoom)
				.single();
			expect(snapshot.error).toBeNull();
			const state = snapshot.data!.game_state as unknown as FamilyColorState;
			const choice = state.choices.find((option) => option.hex === state.target)!;
			expect(
				(
					await client.rpc('choose_family_game_color', {
						p_room_id: colorRoom,
						p_version: version,
						p_choice: choice.id
					})
				).error
			).toBeNull();
		}
		const colorResult = await fixture.owner
			.from('game_sessions')
			.select('game_state, is_draw, status')
			.eq('room_id', colorRoom)
			.single();
		expect(colorResult.data).toMatchObject({ is_draw: true, status: 'finished' });
		expect((colorResult.data!.game_state as unknown as FamilyColorState).scores).toEqual({
			'1': 3,
			'2': 3
		});
	} finally {
		await fixture.cleanup();
	}
});

test('las tres interfaces nuevas recuperan intentos, señal y puntuación', async ({ page }) => {
	test.setTimeout(120_000);
	const fixture = await gameFixture();
	try {
		await signIn(page, fixture.users[0].email, fixture.password);
		const wordleRoom = await startMinigame(fixture, 'wordle');
		await page.goto(`/family/${fixture.familyId}/games/play/${wordleRoom}`);
		await page.getByLabel('Palabra de cinco letras', { exact: true }).fill('ABRIL');
		await page.getByRole('button', { name: 'Comprobar palabra', exact: true }).click();
		await expect(page.getByText('Intento de Creador juegos', { exact: true })).toBeVisible();
		await page.reload();
		await expect(page.getByText('Intento de Creador juegos', { exact: true })).toBeVisible();

		const reactionRoom = await startMinigame(fixture, 'reaction');
		await page.route('**/signal', (route) =>
			route.fulfill({ status: 503, body: 'Signal temporarily unavailable' })
		);
		await page.goto(`/family/${fixture.familyId}/games/play/${reactionRoom}`);
		await expect(page.getByRole('alert')).toContainText('No se pudo comprobar la señal.');
		await page.unroute('**/signal');
		await page.getByRole('button', { name: 'Reintentar señal', exact: true }).click();
		await page.getByRole('button', { name: '¡Ya! Pulsa', exact: true }).click({ timeout: 8000 });
		await expect(page.getByRole('status')).toContainText('Ha ganado Creador juegos.');

		const colorRoom = await startMinigame(fixture, 'color');
		for (let version = 1; version <= 6; version++) {
			const snapshot = await fixture.owner
				.from('game_sessions')
				.select('game_state')
				.eq('room_id', colorRoom)
				.single();
			const state = snapshot.data!.game_state as unknown as FamilyColorState;
			const choice = state.choices.find((option) => option.hex === state.target)!;
			if (version % 2 === 1) {
				await page.goto(`/family/${fixture.familyId}/games/play/${colorRoom}`);
				await page.getByRole('button', { name: new RegExp(`^${choice.name} `) }).click();
				await expect
					.poll(
						async () =>
							(
								await fixture.owner
									.from('game_sessions')
									.select('version')
									.eq('room_id', colorRoom)
									.single()
							).data?.version
					)
					.toBe(version + 1);
			} else {
				expect(
					(
						await fixture.opponent.rpc('choose_family_game_color', {
							p_room_id: colorRoom,
							p_version: version,
							p_choice: choice.id
						})
					).error
				).toBeNull();
			}
		}
		await page.reload();
		await expect(page.getByRole('status')).toContainText('La partida ha terminado en empate.');
		await expect(
			page.getByText('Ronda 6 de 6 · Jugador 1: 3 puntos · Jugador 2: 3 puntos', { exact: true })
		).toBeVisible();
	} finally {
		await fixture.cleanup();
	}
});

test('el servidor serializa jugadas y protege salas y resultados', async () => {
	const fixture = await gameFixture();
	const { familyId, owner, opponent, outsider, uninvited, admin, users } = fixture;
	try {
		const created = await owner.rpc('create_family_game', {
			p_family_id: familyId,
			p_opponent_id: users[1].id,
			p_name: 'Concurrencia'
		});
		expect(created.error).toBeNull();
		const roomId = created.data!;
		expect((await opponent.rpc('ready_family_game', { p_room_id: roomId })).error).toBeNull();
		expect((await owner.rpc('start_family_game', { p_room_id: roomId })).error).toBeNull();
		const results = await Promise.all(
			[0, 1].map((col) =>
				owner.rpc('move_family_game', { p_room_id: roomId, p_version: 1, p_row: 0, p_col: col })
			)
		);
		expect(results.filter((result) => !result.error)).toHaveLength(1);
		expect(results.find((result) => result.error)?.error?.code).toBe('PT409');
		const snapshot = await opponent
			.from('game_sessions')
			.select('id, version, game_state')
			.eq('room_id', roomId)
			.single();
		expect(snapshot.error).toBeNull();
		expect(snapshot.data?.version).toBe(2);
		expect(
			(
				await owner
					.from('game_sessions')
					.update({ winner_id: users[0].id })
					.eq('id', snapshot.data!.id)
			).error?.code
		).toBe('42501');
		for (const client of [outsider, uninvited]) {
			expect((await client.from('game_rooms').select('id').eq('id', roomId)).data).toEqual([]);
			expect((await client.from('game_sessions').select('id').eq('room_id', roomId)).data).toEqual(
				[]
			);
			expect(
				(
					await client.rpc('move_family_game', {
						p_room_id: roomId,
						p_version: 2,
						p_row: 1,
						p_col: 0
					})
				).error?.code
			).toBe('42501');
		}
		expect(
			(await opponent.rpc('end_family_game', { p_room_id: roomId, p_reason: 'leave' })).error
		).toBeNull();
		const result = await owner
			.from('game_sessions')
			.select('winner_id, status, version')
			.eq('room_id', roomId)
			.single();
		expect(result.data).toMatchObject({ winner_id: users[0].id, status: 'finished', version: 3 });
		const timeout = await owner.rpc('create_family_game', {
			p_family_id: familyId,
			p_opponent_id: users[1].id,
			p_name: 'Reloj'
		});
		expect(timeout.error).toBeNull();
		expect(
			(await opponent.rpc('ready_family_game', { p_room_id: timeout.data! })).error
		).toBeNull();
		expect((await owner.rpc('start_family_game', { p_room_id: timeout.data! })).error).toBeNull();
		expect(
			(await opponent.rpc('end_family_game', { p_room_id: timeout.data!, p_reason: 'timeout' }))
				.error?.code
		).toBe('22023');
		expect(
			(
				await admin
					.from('game_sessions')
					.update({ turn_deadline: new Date(Date.now() - 1000).toISOString() })
					.eq('room_id', timeout.data!)
			).error
		).toBeNull();
		expect(
			(await opponent.rpc('end_family_game', { p_room_id: timeout.data!, p_reason: 'timeout' }))
				.error
		).toBeNull();
		expect(
			(await owner.from('game_sessions').select('winner_id').eq('room_id', timeout.data!).single())
				.data?.winner_id
		).toBe(users[1].id);
	} finally {
		await fixture.cleanup();
	}
});

test('dos familiares preparan partida, juegan y recuperan el estado al reconectar', async ({
	page,
	browser
}) => {
	test.setTimeout(120_000);
	const fixture = await gameFixture();
	const ownerContext = await browser.newContext();
	try {
		const ownerPage = await ownerContext.newPage();
		await signIn(ownerPage, fixture.users[0].email, fixture.password);
		await ownerPage.goto(`/family/${fixture.familyId}/games`);
		await ownerPage.getByRole('radio', { name: 'Rival juegos' }).check();
		await ownerPage.getByRole('button', { name: 'Invitar a jugar' }).click();
		await ownerPage.waitForURL('**/games/play/*');
		const roomUrl = ownerPage.url();
		await expect(ownerPage.getByRole('button', { name: 'Empezar partida' })).toBeDisabled();
		await signIn(page, fixture.users[1].email, fixture.password);
		await page.goto(roomUrl);
		await page.getByRole('button', { name: 'Estoy preparado' }).click();
		await expect(ownerPage.getByRole('button', { name: 'Empezar partida' })).toBeEnabled({
			timeout: 20_000
		});
		await ownerPage.getByRole('button', { name: 'Empezar partida' }).click();
		await ownerPage.getByRole('button', { name: 'Fila 1, columna 1: vacía', exact: true }).click();
		await expect(
			page.getByRole('button', { name: 'Fila 1, columna 1: X', exact: true })
		).toBeVisible({ timeout: 20_000 });
		await page.reload();
		await expect(
			page.getByRole('button', { name: 'Fila 1, columna 1: X', exact: true })
		).toBeVisible();
		await page.getByRole('button', { name: 'Fila 2, columna 1: vacía', exact: true }).click();
		await expect(
			ownerPage.getByRole('button', { name: 'Fila 2, columna 1: O', exact: true })
		).toBeVisible({ timeout: 20_000 });
		await page.getByRole('button', { name: 'Abandonar partida', exact: true }).click();
		await page.getByRole('button', { name: 'Confirmar abandono', exact: true }).click();
		await expect(ownerPage.getByRole('status')).toContainText('Ha ganado Creador juegos.', {
			timeout: 20_000
		});
		await page.context().clearCookies();
		await signIn(page, fixture.users[3].email, fixture.password);
		expect((await page.goto(roomUrl))?.status()).toBe(404);
	} finally {
		await ownerContext.close();
		await fixture.cleanup();
	}
});
