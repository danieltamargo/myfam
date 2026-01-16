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
	class="flex items-center gap-2 p-2 rounded-lg transition-all {isCurrentTurn
		? 'bg-primary/20 ring-2 ring-primary'
		: 'bg-base-200 hover:bg-base-300'} {onClick ? 'cursor-pointer' : 'cursor-default'}"
	disabled={!onClick}
>
	<!-- Avatar with turn indicator -->
	<div class="relative">
		<div class="avatar {isCurrentTurn ? 'ring ring-primary ring-offset-base-100 ring-offset-1' : ''}">
			<div class="w-10 h-10 rounded-full">
				{#if avatarUrl}
					<img src={avatarUrl} alt={displayName} />
				{:else}
					<div
						class="bg-primary text-primary-content flex items-center justify-center text-sm font-semibold"
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
					class="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"
				></span>
				<span class="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
			</span>
		{/if}
	</div>

	<!-- Player info -->
	<div class="flex-1 min-w-0 text-left">
		<div class="font-medium text-sm truncate">{displayName}</div>
		<div class="text-xs text-base-content/60 flex items-center gap-1">
			{#if isCurrentTurn}
				<span class="text-primary font-medium">Turno</span>
			{:else if isWinner}
				<span class="text-success font-medium">Ganador</span>
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
