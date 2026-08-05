<script lang="ts">
	interface Props {
		playerNumber: number;
		displayName: string;
		avatarUrl: string | null;
		symbol: string;
		isCurrentTurn: boolean;
		isWinner: boolean;
		onClick?: () => void;
	}

	let { playerNumber, displayName, avatarUrl, symbol, isCurrentTurn, isWinner, onClick }: Props =
		$props();
</script>

<button
	onclick={onClick}
	class="flex items-center gap-2 rounded-lg p-2 transition-all {isCurrentTurn
		? 'bg-primary/20 ring-2 ring-primary'
		: 'bg-base-200 hover:bg-base-300'} {onClick ? 'cursor-pointer' : 'cursor-default'}"
	disabled={!onClick}
>
	<!-- Avatar with turn indicator -->
	<div class="relative">
		<div
			class="avatar {isCurrentTurn ? 'ring ring-primary ring-offset-1 ring-offset-base-100' : ''}"
		>
			<div class="h-10 w-10 rounded-full">
				{#if avatarUrl}
					<img src={avatarUrl} alt={displayName} />
				{:else}
					<div
						class="flex items-center justify-center bg-primary text-sm font-semibold text-primary-content"
					>
						{displayName.charAt(0).toUpperCase()}
					</div>
				{/if}
			</div>
		</div>

		<!-- Turn indicator pulse -->
		{#if isCurrentTurn}
			<span class="absolute top-0 right-0 flex h-3 w-3">
				<span
					class="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"
				></span>
				<span class="relative inline-flex h-3 w-3 rounded-full bg-primary"></span>
			</span>
		{/if}
	</div>

	<!-- Player info -->
	<div class="min-w-0 flex-1 text-left">
		<div class="truncate text-sm font-medium">{displayName}</div>
		<div class="flex items-center gap-1 text-xs text-base-content/60">
			{#if isCurrentTurn}
				<span class="font-medium text-primary">Turno</span>
			{:else if isWinner}
				<span class="font-medium text-success">Ganador</span>
			{:else}
				<span>Jugador {playerNumber}</span>
			{/if}
		</div>
	</div>

	<!-- Symbol -->
	<div class="text-xl font-bold {symbol === 'X' ? 'text-error' : 'text-info'}">
		{symbol}
	</div>
</button>
