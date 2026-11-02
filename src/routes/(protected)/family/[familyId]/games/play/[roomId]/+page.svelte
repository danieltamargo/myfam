<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { createClient } from '$lib/supabase';
	import type { TicTacToeState } from '$lib/types/games';
	import type { PageProps } from './$types';
	import {
		FAMILY_GAME_NAMES,
		FAMILY_WORDLE_WORDS,
		type FamilyGameType,
		type FamilyWordleState,
		type FamilyReactionState,
		type FamilyColorState
	} from '$lib/games/family-games';

	let { data, form }: PageProps = $props();
	let busy = $state(false);
	let syncError = $state('');
	let clock = $derived(data.serverTime);
	let confirmLeave = $state(false);
	let signalReady = $state(false);
	let signalError = $state('');
	let signalRetry = $state(0);
	const wordle = $derived(
		data.room.game_type === 'wordle'
			? (data.session?.game_state as unknown as FamilyWordleState)
			: null
	);
	const reaction = $derived(
		data.room.game_type === 'reaction'
			? (data.session?.game_state as unknown as FamilyReactionState)
			: null
	);
	const colors = $derived(
		data.room.game_type === 'color'
			? (data.session?.game_state as unknown as FamilyColorState)
			: null
	);
	const gameState = $derived(
		data.session?.game_state as unknown as (TicTacToeState & { endReason?: string }) | null
	);
	const me = $derived(data.players.find((player) => player.user_id === data.currentUserId));
	const active = $derived(data.session?.status === 'active');
	const myTurn = $derived(active && me?.is_active && gameState?.currentPlayer === me.player_number);
	const remaining = $derived(
		data.session?.turn_deadline
			? Math.max(
					0,
					Math.ceil(
						(Date.parse(data.session.turn_deadline) - Math.max(clock, data.serverTime)) / 1000
					)
				)
			: 0
	);
	const winner = $derived(
		data.players.find((player) => player.user_id === data.session?.winner_id)
	);
	$effect(() => {
		void signalRetry;
		const roomId = data.room.id;
		const familyId = data.room.family_id;
		const serverTime = data.serverTime;
		const deadline = data.session?.turn_deadline;
		if (data.room.game_type !== 'reaction' || !active || !deadline) return;
		signalReady = false;
		signalError = '';
		const timeLeft = Date.parse(deadline) - untrack(() => clock || serverTime);
		if (timeLeft <= 0) return;
		let stopped = false;
		let polling = false;
		let activated = false;
		let failed = false;
		let controller: AbortController | undefined;
		let interval: ReturnType<typeof setInterval> | undefined;
		const started = performance.now();
		function pause() {
			if (interval) clearInterval(interval);
			interval = undefined;
			controller?.abort();
		}
		async function poll() {
			if (
				stopped ||
				polling ||
				activated ||
				failed ||
				document.visibilityState !== 'visible' ||
				performance.now() - started >= timeLeft
			)
				return;
			polling = true;
			controller = new AbortController();
			const requestController = controller;
			try {
				const response = await fetch(
					resolve(...([`/family/${familyId}/games/play/${roomId}/signal`] as unknown as ['/'])),
					{ signal: requestController.signal }
				);
				if (!response.ok) throw new Error('Signal unavailable');
				const result = (await response.json()) as { ready?: unknown };
				if (typeof result.ready !== 'boolean') throw new Error('Invalid signal');
				if (stopped) return;
				activated = result.ready;
				signalReady = result.ready;
				if (activated) pause();
			} catch {
				if (!stopped && !requestController.signal.aborted) {
					failed = true;
					signalError = 'No se pudo comprobar la señal. Reintenta antes de pulsar.';
					pause();
				}
			} finally {
				polling = false;
			}
		}
		function resume() {
			pause();
			if (
				document.visibilityState === 'visible' &&
				!activated &&
				!failed &&
				performance.now() - started < timeLeft
			) {
				void poll();
				interval = setInterval(() => void poll(), 500);
			}
		}
		const timeout = setTimeout(pause, timeLeft);
		document.addEventListener('visibilitychange', resume);
		resume();
		return () => {
			stopped = true;
			pause();
			clearTimeout(timeout);
			document.removeEventListener('visibilitychange', resume);
		};
	});

	const enhanceGame: SubmitFunction = ({ cancel }) => {
		if (busy) {
			cancel();
			return;
		}
		busy = true;
		return async ({ update }) => {
			try {
				await update();
			} catch {
				syncError = 'No se pudo confirmar la acción. Recarga antes de volver a jugar.';
			} finally {
				busy = false;
				confirmLeave = false;
			}
		};
	};

	onMount(() => {
		const supabase = createClient();
		let refreshing = false;
		async function refresh() {
			if (refreshing || busy) return;
			refreshing = true;
			try {
				await invalidateAll();
				syncError = '';
			} catch {
				syncError = 'Conexión interrumpida. Recarga para recuperar la partida.';
			} finally {
				refreshing = false;
			}
		}
		const channel = supabase
			.channel(`game:${data.room.id}`)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'game_sessions',
					filter: `room_id=eq.${data.room.id}`
				},
				refresh
			)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'room_participants',
					filter: `room_id=eq.${data.room.id}`
				},
				refresh
			)
			.on(
				'postgres_changes',
				{ event: 'UPDATE', schema: 'public', table: 'game_rooms', filter: `id=eq.${data.room.id}` },
				refresh
			);
		let active = true;
		void supabase.realtime
			.setAuth()
			.then(() => {
				if (!active) return;
				channel.subscribe((status) => {
					if (status === 'SUBSCRIBED') void refresh();
				});
			})
			.catch(() => {
				if (active) syncError = 'No se pudo conectar la partida. Recarga la página.';
			});
		const timer = setInterval(() => {
			clock += 1000;
		}, 1000);
		const polling = setInterval(() => {
			if (document.visibilityState === 'visible') void refresh();
		}, 15_000);
		window.addEventListener('focus', refresh);
		return () => {
			active = false;
			clearInterval(timer);
			clearInterval(polling);
			window.removeEventListener('focus', refresh);
			void supabase.removeChannel(channel);
		};
	});
</script>

<svelte:head><title>{data.room.name} · MyFamily</title></svelte:head>

<div class="mx-auto max-w-2xl space-y-6 pb-10">
	<a class="link" href={resolve(...([`/family/${data.room.family_id}/games`] as unknown as ['/']))}
		>Volver a las partidas</a
	>
	<h1 class="text-3xl font-bold break-words">{data.room.name}</h1>
	<p class="text-base-content/70">
		{FAMILY_GAME_NAMES[data.room.game_type as FamilyGameType] || 'Partida familiar'}
	</p>
	{#if form?.error || syncError}<p class="alert alert-error" role="alert">
			{form?.error || syncError}
		</p>{/if}
	<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
		{#each data.players as player (player.id)}
			<div
				class={[
					'flex items-center gap-3 rounded-box border border-base-300 p-4',
					{ 'border-primary': active && gameState?.currentPlayer === player.player_number }
				]}
			>
				{#if player.profile?.avatar_url}<img
						src={player.profile.avatar_url}
						class="h-10 w-10 rounded-full object-cover"
						alt=""
					/>{:else}<span
						class="flex h-10 w-10 items-center justify-center rounded-full bg-base-200"
						aria-hidden="true">{player.profile?.display_name?.charAt(0) || '?'}</span
					>{/if}
				<div class="min-w-0">
					<p class="font-semibold break-words">
						{player.profile?.display_name || 'Familiar'} · {data.room.game_type === 'tic_tac_toe'
							? player.player_number === 1
								? 'X'
								: 'O'
							: `Jugador ${player.player_number}`}
					</p>
					<p class="text-sm text-base-content/70">
						{data.room.status === 'waiting'
							? player.is_ready
								? 'Preparado'
								: 'Esperando confirmación'
							: player.is_active
								? 'Participante'
								: 'Ha abandonado'}
					</p>
				</div>
			</div>
		{/each}
	</div>
	{#if data.room.status === 'waiting'}
		<p>La partida empezará cuando ambos estéis preparados y su creador pulse empezar.</p>
		{#if me?.is_active && !me.is_ready}<form
				method="POST"
				action="?/ready"
				use:enhance={enhanceGame}
			>
				<button class="btn btn-primary" disabled={busy}>Estoy preparado</button>
			</form>{/if}
		{#if data.room.created_by === data.currentUserId}<form
				method="POST"
				action="?/start"
				use:enhance={enhanceGame}
			>
				<button
					class="btn btn-primary"
					disabled={busy || !data.players.every((player) => player.is_ready && player.is_active)}
					>Empezar partida</button
				>
			</form>{/if}
	{:else if data.room.status === 'cancelled'}
		<p role="status">Partida cancelada antes de empezar.</p>
	{:else if gameState && data.session}
		{#if active}<p class="text-lg font-semibold">
				{reaction ? 'Ronda de reacción' : myTurn ? 'Tu turno' : 'Turno de tu familiar'} ·
				<span role="timer" aria-label="Segundos restantes del turno">{remaining} s</span>
			</p>
		{:else}<p role="status" class="alert alert-info">
				{data.session.is_draw
					? 'La partida ha terminado en empate.'
					: `Ha ganado ${winner?.profile?.display_name || 'tu familiar'}.`}{gameState.endReason ===
				'timeout'
					? ' Se agotó el tiempo del turno.'
					: gameState.endReason === 'leave'
						? ' El otro jugador abandonó la partida.'
						: gameState.endReason === 'false_start'
							? ' Hubo una pulsación antes de la señal.'
							: ''}
			</p>{/if}
		{#if data.room.game_type === 'tic_tac_toe'}
			<div class="mx-auto grid max-w-sm grid-cols-3 gap-2" aria-label="Tablero de tres en raya">
				{#each gameState.board as row, rowIndex (rowIndex)}{#each row as cell, colIndex (colIndex)}
						<form method="POST" action="?/move" use:enhance={enhanceGame}>
							<input type="hidden" name="version" value={data.session.version} /><input
								type="hidden"
								name="row"
								value={rowIndex}
							/><input type="hidden" name="col" value={colIndex} />
							<button
								class="btn aspect-square h-auto w-full text-4xl"
								aria-label={`Fila ${rowIndex + 1}, columna ${colIndex + 1}: ${cell || 'vacía'}`}
								disabled={busy || !myTurn || !!cell || remaining === 0}>{cell || '·'}</button
							>
						</form>
					{/each}{/each}
			</div>
		{:else if wordle}
			<section class="space-y-4" aria-label="Wordle compartido">
				<p>
					Tenéis seis intentos por persona y alternáis turnos de 60 segundos. El primero en acertar
					gana; si ambos agotáis los intentos, hay empate.
				</p>
				<p>
					Intentos: jugador 1, {wordle.attempts['1']} de 6; jugador 2, {wordle.attempts['2']} de 6.
				</p>
				<div class="space-y-3">
					{#each wordle.guesses as guess, index (index)}
						<div>
							<p class="mb-1 text-sm text-base-content/70">
								Intento de {data.players.find((player) => player.player_number === guess.player)
									?.profile?.display_name || `jugador ${guess.player}`}
							</p>
							<div class="flex gap-1.5">
								{#each guess.result as letter, letterIndex (letterIndex)}<span
										class={[
											'flex h-11 w-11 items-center justify-center rounded border border-base-300 font-bold',
											{
												'bg-success': letter.status === 'correct',
												'text-success-content': letter.status === 'correct',
												'bg-warning': letter.status === 'present',
												'text-warning-content': letter.status === 'present',
												'bg-base-200': letter.status === 'absent'
											}
										]}
										>{letter.letter}<span class="sr-only"
											>: {letter.status === 'correct'
												? 'posición correcta'
												: letter.status === 'present'
													? 'otra posición'
													: 'no aparece'}</span
										></span
									>{/each}
							</div>
						</div>
					{/each}
				</div>
				{#if active}<form
						method="POST"
						action="?/guess"
						use:enhance={enhanceGame}
						class="flex flex-wrap items-end gap-3"
					>
						<input type="hidden" name="version" value={data.session.version} />
						<label class="block min-w-0 flex-1 space-y-2"
							><span>Palabra de cinco letras</span><input
								name="guess"
								class="input w-full uppercase"
								list="family-wordle-words"
								minlength="5"
								maxlength="5"
								autocomplete="off"
								required
								disabled={busy || !myTurn || remaining === 0}
							/></label
						>
						<button class="btn btn-primary" disabled={busy || !myTurn || remaining === 0}
							>Comprobar palabra</button
						>
					</form>{/if}
				<datalist id="family-wordle-words"
					>{#each FAMILY_WORDLE_WORDS as word (word)}<option value={word}></option>{/each}</datalist
				>
				<details class="rounded-box border border-base-300 p-3">
					<summary class="cursor-pointer font-medium"
						>Diccionario de esta versión: 40 palabras</summary
					>
					<p class="mt-3 text-sm">{FAMILY_WORDLE_WORDS.join(', ')}.</p>
				</details>
			</section>
		{:else if reaction}
			<section class="space-y-4" aria-label="Juego de reacción">
				<p>
					Espera a «¡Ya!» antes de pulsar. Pulsar antes concede la victoria al otro jugador. La
					ronda termina a los 15 segundos.
				</p>
				<p class="text-sm text-base-content/70">
					El resultado depende de cuándo llega la pulsación al servidor e incluye la latencia de tu
					conexión. Es un juego informal, no una medición exacta de reflejos.
				</p>
				{#if active}
					{#if signalError}<p role="alert" class="alert alert-error">{signalError}</p>
						<button
							class="btn"
							onclick={() => (signalRetry += 1)}
							disabled={busy || remaining === 0}>Reintentar señal</button
						>{/if}
					<form method="POST" action="?/react" use:enhance={enhanceGame}>
						<input type="hidden" name="version" value={data.session.version} /><button
							class={[
								'btn h-32 w-full px-4 text-2xl whitespace-normal sm:text-3xl',
								{ 'btn-primary': signalReady }
							]}
							disabled={busy || !me?.is_active || remaining === 0 || !!signalError}
							>{signalReady ? '¡Ya! Pulsa' : 'Esperando la señal…'}</button
						>
					</form>
				{:else if reaction.reactionMs != null}<p>
						Tiempo de llegada al servidor: {reaction.reactionMs} ms.
					</p>{/if}
			</section>
		{:else if colors}
			<section class="space-y-4" aria-label="Acertar el color">
				<p>
					Seis elecciones, tres por persona, por turnos de 60 segundos. Cada acierto suma un punto.
					Puedes comparar también los códigos HEX de las opciones.
				</p>
				<p class="font-semibold">
					Ronda {colors.round} de 6 · Jugador 1: {colors.scores['1']} puntos · Jugador 2: {colors
						.scores['2']} puntos
				</p>
				<div class="rounded-box border border-base-300 p-4">
					<p class="mb-3 font-medium">Color objetivo: {colors.target}</p>
					<div class="h-24 rounded" style:background-color={colors.target} aria-hidden="true"></div>
				</div>
				{#if colors.lastAnswerCorrect !== undefined}<p>
						{colors.lastAnswerCorrect
							? 'La última elección fue correcta.'
							: 'La última elección no coincidía.'}
					</p>{/if}
				{#if active}<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
						{#each colors.choices as choice (choice.id)}
							<form method="POST" action="?/chooseColor" use:enhance={enhanceGame}>
								<input type="hidden" name="version" value={data.session.version} /><input
									type="hidden"
									name="choice"
									value={choice.id}
								/><button
									class="btn h-auto w-full flex-col gap-2 py-4"
									disabled={busy || !myTurn || remaining === 0}
									><span
										class="h-10 w-full rounded"
										style:background-color={choice.hex}
										aria-hidden="true"
									></span><span>{choice.name}</span><span class="text-xs">{choice.hex}</span
									></button
								>
							</form>
						{/each}
					</div>{/if}
			</section>
		{/if}
		{#if active && remaining === 0}<form method="POST" action="?/timeout" use:enhance={enhanceGame}>
				<button class="btn" disabled={busy}>Confirmar resultado por tiempo</button>
			</form>{/if}
	{/if}
	{#if me?.is_active && (data.room.status === 'waiting' || active)}
		{#if confirmLeave}<div class="space-y-3 rounded-box border border-error p-4">
				<p>
					{active
						? 'Si abandonas, tu familiar gana la partida.'
						: 'Si sales, se cancelará esta partida.'}
				</p>
				<div class="flex flex-wrap gap-3">
					<form method="POST" action="?/leave" use:enhance={enhanceGame}>
						<button class="btn btn-error" disabled={busy}>Confirmar abandono</button>
					</form>
					<button class="btn btn-ghost" onclick={() => (confirmLeave = false)} disabled={busy}
						>Seguir jugando</button
					>
				</div>
			</div>
		{:else}<button
				class="btn text-error btn-ghost"
				onclick={() => (confirmLeave = true)}
				disabled={busy}>Abandonar partida</button
			>{/if}
	{/if}
</div>
