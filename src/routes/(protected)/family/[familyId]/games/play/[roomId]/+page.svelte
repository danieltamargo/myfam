<script lang="ts">
	import { onMount } from 'svelte';
	import { createClient } from '$lib/supabase';
	import { invalidateAll } from '$app/navigation';
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	import type { TicTacToeState } from '$lib/types/games';
	import { GAME_METADATA } from '$lib/types/games';
	import GameResultModal from '$lib/components/games/GameResultModal.svelte';
	import PlayerMiniCard from '$lib/components/games/PlayerMiniCard.svelte';
	import LeaveGameConfirmModal from '$lib/components/games/LeaveGameConfirmModal.svelte';

	let { data }: { data: PageData } = $props();

	const gameMetadata = $derived(GAME_METADATA[data.room.game_type]);
	const gameState = $derived(data.session?.game_state as TicTacToeState | null);
	const isMyTurn = $derived(
		gameState && data.myParticipant
			? gameState.currentPlayer === data.myParticipant.player_number
			: false
	);

	let isSubmitting = $state(false);
	let dismissedResultSessionId = $state<string | null>(null);
	let showLeaveModal = $state(false);

	// Check if game is in progress (session exists and not finished)
	const isGameInProgress = $derived(
		Boolean(data.session && !gameState?.winner && !gameState?.isDraw)
	);
	const showResultModal = $derived(
		Boolean(
			gameState &&
			(gameState.winner || gameState.isDraw) &&
			dismissedResultSessionId !== data.session?.id
		)
	);

	// Realtime subscription for game updates
	onMount(() => {
		const supabase = createClient();

		// Subscribe to session updates
		const sessionChannel = supabase
			.channel('game-session-updates')
			.on(
				'postgres_changes',
				{
					event: 'UPDATE',
					schema: 'public',
					table: 'game_sessions',
					filter: `room_id=eq.${data.room.id}`
				},
				(payload) => {
					console.log('Session updated via realtime:', payload);
					invalidateAll();
				}
			)
			.subscribe();

		// Subscribe to move inserts
		const movesChannel = supabase
			.channel('game-moves-updates')
			.on(
				'postgres_changes',
				{
					event: 'INSERT',
					schema: 'public',
					table: 'game_moves',
					filter: `session_id=eq.${data.session?.id}`
				},
				() => {
					invalidateAll();
				}
			)
			.subscribe();

		// Subscribe to room updates
		const roomChannel = supabase
			.channel('room-updates')
			.on(
				'postgres_changes',
				{
					event: 'UPDATE',
					schema: 'public',
					table: 'game_rooms',
					filter: `id=eq.${data.room.id}`
				},
				() => {
					invalidateAll();
				}
			)
			.subscribe();

		return () => {
			supabase.removeChannel(sessionChannel);
			supabase.removeChannel(movesChannel);
			supabase.removeChannel(roomChannel);
		};
	});

	// Get participant by player number
	function getParticipantByNumber(playerNumber: number) {
		return data.participants.find((p) => p.player_number === playerNumber);
	}

	// Check if cell is in winning line
	function isWinningCell(row: number, col: number): boolean {
		if (!gameState?.winningLine) return false;
		return gameState.winningLine.some((cell) => cell.row === row && cell.col === col);
	}

	const isGameOver = $derived(gameState?.winner !== null || gameState?.isDraw);
</script>

<div class="container mx-auto h-[calc(100vh-12rem)] max-w-7xl p-4">
	<!-- Compact Header -->
	<div class="mb-4 flex items-center justify-between">
		<div class="flex items-center gap-3">
			<span class="text-4xl">{gameMetadata.icon}</span>
			<div>
				<h1 class="text-2xl font-bold">{data.room.name}</h1>
				<p class="text-sm text-base-content/60">{gameMetadata.name}</p>
			</div>
		</div>

		<button onclick={() => (showLeaveModal = true)} class="btn btn-outline btn-sm btn-error">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				stroke-width="1.5"
				stroke="currentColor"
				class="h-4 w-4"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"
				/>
			</svg>
			Salir
		</button>
	</div>

	<!-- Game Status -->
	{#if !data.session}
		<div class="alert alert-warning">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6 shrink-0 stroke-current"
				fill="none"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
				/>
			</svg>
			<span>No hay una sesión activa. Vuelve al lobby para crear una nueva partida.</span>
		</div>
	{:else}
		<!-- Players - Horizontal at top -->
		<div class="mb-4">
			<div class="flex flex-wrap gap-2">
				{#each data.participants as participant (participant.id)}
					{@const profile = participant.profile || {
						display_name: participant.guest_name || 'Invitado',
						avatar_url: null
					}}
					{@const isCurrentPlayer = gameState?.currentPlayer === participant.player_number}
					{@const symbol = participant.player_number === 1 ? 'X' : 'O'}

					<PlayerMiniCard
						playerNumber={participant.player_number ?? 0}
						displayName={profile.display_name ?? 'Jugador'}
						avatarUrl={profile.avatar_url}
						{symbol}
						isCurrentTurn={isCurrentPlayer && !isGameOver}
						isWinner={gameState?.winner === participant.player_number}
					/>
				{/each}
			</div>
		</div>

		<!-- Game Board - Centered -->
		<div class="flex items-center justify-center" style="height: calc(100% - 10rem);">
			<!-- Tic-Tac-Toe Board -->
			{#if gameState}
				<div class="inline-block">
					<div class="grid grid-cols-3 gap-2 rounded-xl bg-base-300 p-4">
						{#each gameState.board as row, rowIndex (rowIndex)}
							{#each row as cell, colIndex (colIndex)}
								{@const isWinning = isWinningCell(rowIndex, colIndex)}
								<form
									method="POST"
									action="?/makeMove"
									use:enhance={() => {
										isSubmitting = true;
										return async ({ update }) => {
											await update();
											isSubmitting = false;
										};
									}}
								>
									<input type="hidden" name="session_id" value={data.session?.id} />
									<input type="hidden" name="row" value={rowIndex} />
									<input type="hidden" name="col" value={colIndex} />

									<button
										type="submit"
										disabled={cell !== null || !isMyTurn || isGameOver || isSubmitting}
										class="flex h-24 w-24 items-center justify-center rounded-lg bg-base-100 text-5xl font-bold transition-all hover:scale-105 hover:bg-base-200 disabled:cursor-not-allowed disabled:hover:scale-100 {isWinning
											? 'bg-success/20 ring-2 ring-success'
											: ''}"
									>
										{#if cell === 'X'}
											<span class="text-error">X</span>
										{:else if cell === 'O'}
											<span class="text-info">O</span>
										{/if}
									</button>
								</form>
							{/each}
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>

<!-- Game Result Modal -->
{#if showResultModal && gameState}
	{@const winner = gameState.winner ? getParticipantByNumber(gameState.winner) : undefined}
	{@const winnerData = winner
		? {
				player_number: winner.player_number ?? gameState.winner ?? 0,
				display_name: winner.is_bot
					? `Bot ${winner.bot_difficulty}`
					: winner.profile?.display_name || winner.guest_name || 'Jugador ' + winner.player_number,
				avatar_url: winner.is_bot ? null : winner.profile?.avatar_url || null
			}
		: undefined}

	<GameResultModal
		isOpen={showResultModal}
		gameType={data.room.game_type}
		isDraw={gameState.isDraw}
		winner={winnerData}
		isCurrentUserWinner={gameState.winner === data.myParticipant?.player_number}
		stats={{
			moves: data.moves.length
		}}
		onRematch={async () => {
			const formData = new FormData();
			const response = await fetch('?/rematch', {
				method: 'POST',
				body: formData
			});
			if (response.ok) {
				dismissedResultSessionId = data.session?.id ?? null;
			}
		}}
		onClose={() => (dismissedResultSessionId = data.session?.id ?? null)}
		familyId={data.room.family_id ?? ''}
	/>
{/if}

<!-- Leave Game Confirmation Modal -->
<LeaveGameConfirmModal
	isOpen={showLeaveModal}
	{isGameInProgress}
	onClose={() => (showLeaveModal = false)}
	familyId={data.room.family_id ?? ''}
/>
