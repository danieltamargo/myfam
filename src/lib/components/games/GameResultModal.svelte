<script lang="ts">
	import { enhance } from '$app/forms';
	import type { GameType } from '$lib/types/games';
	import { GAME_METADATA } from '$lib/types/games';

	interface Player {
		player_number: number;
		display_name: string;
		avatar_url: string | null;
	}

	interface Props {
		isOpen: boolean;
		gameType: GameType;
		isDraw: boolean;
		winner?: Player;
		isCurrentUserWinner: boolean;
		stats?: {
			duration?: string;
			moves?: number;
			accuracy?: number;
		};
		onRematch?: () => void;
		onClose: () => void;
		familyId: string;
	}

	let {
		isOpen,
		gameType,
		isDraw,
		winner,
		isCurrentUserWinner,
		stats,
		onRematch,
		onClose,
		familyId
	}: Props = $props();

	const gameMetadata = GAME_METADATA[gameType];

	function handleClickOutside(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			onClose();
		}
	}

	const resultEmoji = $derived(() => {
		if (isDraw) return '🤝';
		if (isCurrentUserWinner) return '🎉';
		return '🎯';
	});

	const resultTitle = $derived(() => {
		if (isDraw) return '¡Empate!';
		if (isCurrentUserWinner) return '¡Victoria!';
		return 'Fin de la Partida';
	});

	const resultMessage = $derived(() => {
		if (isDraw) return 'Ningún jugador ganó esta vez';
		if (isCurrentUserWinner) return '¡Felicidades! Has ganado';
		return `${winner?.display_name || 'El otro jugador'} ha ganado`;
	});
</script>

{#if isOpen}
	<div
		class="modal-open modal"
		onclick={handleClickOutside}
		onkeydown={(e) => e.key === 'Escape' && onClose()}
		role="button"
		tabindex="0"
	>
		<div class="modal-box max-w-md">
			<!-- Header with game icon -->
			<div class="mb-6 text-center">
				<div class="mb-4 text-6xl">{resultEmoji()}</div>
				<h3 class="mb-2 text-3xl font-bold">{resultTitle()}</h3>
				<p class="text-lg text-base-content/70">{resultMessage()}</p>
			</div>

			<!-- Winner display (if not draw) -->
			{#if !isDraw && winner}
				<div class="card mb-6 bg-base-200">
					<div class="card-body p-4">
						<div class="flex items-center gap-4">
							<!-- Avatar -->
							<div class="avatar">
								<div
									class="h-16 w-16 rounded-full ring ring-primary ring-offset-2 ring-offset-base-100"
								>
									{#if winner.display_name?.startsWith('Bot ')}
										<div
											class="flex items-center justify-center bg-neutral text-3xl text-neutral-content"
										>
											🤖
										</div>
									{:else if winner.avatar_url}
										<img src={winner.avatar_url} alt={winner.display_name} />
									{:else}
										<div
											class="flex items-center justify-center bg-primary text-2xl font-semibold text-primary-content"
										>
											{winner.display_name.charAt(0).toUpperCase()}
										</div>
									{/if}
								</div>
							</div>

							<!-- Name and badge -->
							<div class="flex-1">
								<div class="text-xl font-bold">{winner.display_name}</div>
								<div class="mt-1 badge badge-lg badge-success">Ganador</div>
							</div>

							<!-- Trophy -->
							<div class="text-5xl">🏆</div>
						</div>
					</div>
				</div>
			{/if}

			<!-- Game Stats -->
			{#if stats && (stats.duration || stats.moves || stats.accuracy)}
				<div class="card mb-6 bg-base-200">
					<div class="card-body p-4">
						<h4 class="mb-3 flex items-center gap-2 font-semibold">
							<span>📊</span>
							<span>Estadísticas</span>
						</h4>
						<div class="grid grid-cols-2 gap-3">
							{#if stats.duration}
								<div class="stat rounded-lg bg-base-100 p-3">
									<div class="stat-title text-xs">Duración</div>
									<div class="stat-value text-lg">{stats.duration}</div>
								</div>
							{/if}
							{#if stats.moves}
								<div class="stat rounded-lg bg-base-100 p-3">
									<div class="stat-title text-xs">Movimientos</div>
									<div class="stat-value text-lg">{stats.moves}</div>
								</div>
							{/if}
							{#if stats.accuracy}
								<div class="stat rounded-lg bg-base-100 p-3">
									<div class="stat-title text-xs">Precisión</div>
									<div class="stat-value text-lg">{stats.accuracy}%</div>
								</div>
							{/if}
						</div>
					</div>
				</div>
			{/if}

			<!-- Actions -->
			<div class="flex gap-2">
				{#if onRematch}
					<button onclick={onRematch} class="btn flex-1 btn-primary">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke-width="1.5"
							stroke="currentColor"
							class="h-5 w-5"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
							/>
						</svg>
						Revancha
					</button>
				{/if}
				<a href="/family/{familyId}/games" class="btn flex-1 btn-outline">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="1.5"
						stroke="currentColor"
						class="h-5 w-5"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"
						/>
					</svg>
					Volver al Lobby
				</a>
			</div>

			<!-- Confetti animation for winner -->
			{#if isCurrentUserWinner}
				<div class="pointer-events-none absolute inset-0 overflow-hidden">
					{#each Array(20) as _, i}
						<div
							class="confetti"
							style="left: {Math.random() * 100}%; animation-delay: {Math.random() * 0.5}s;"
						></div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	@keyframes confetti-fall {
		0% {
			transform: translateY(-100%) rotate(0deg);
			opacity: 1;
		}
		100% {
			transform: translateY(100vh) rotate(360deg);
			opacity: 0;
		}
	}

	.confetti {
		position: absolute;
		top: -10px;
		width: 10px;
		height: 10px;
		background: hsl(var(--p));
		animation: confetti-fall 3s linear infinite;
	}

	.confetti:nth-child(2n) {
		background: hsl(var(--s));
	}

	.confetti:nth-child(3n) {
		background: hsl(var(--a));
	}

	.confetti:nth-child(4n) {
		width: 8px;
		height: 8px;
	}

	.confetti:nth-child(5n) {
		width: 6px;
		height: 6px;
	}
</style>
