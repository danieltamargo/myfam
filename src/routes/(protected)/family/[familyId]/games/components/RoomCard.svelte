<script lang="ts">
	import { enhance } from '$app/forms';
	import { GAME_METADATA, type GameRoom, type RoomParticipant } from '$lib/types/games';

	interface Props {
		room: GameRoom & {
			creator?: {
				display_name: string;
				avatar_url: string | null;
			};
		};
		participants: (RoomParticipant & {
			profile?: {
				display_name: string;
				avatar_url: string | null;
			};
		})[];
		isUserInRoom: boolean;
		currentUserId: string;
	}

	let { room, participants, isUserInRoom, currentUserId }: Props = $props();

	const gameMetadata = GAME_METADATA[room.game_type];
	const isCreator = room.created_by === currentUserId;

	// Check if all participants are ready
	const allReady = $derived(participants.length >= 2 && participants.every((p) => p.is_ready));

	// Current user's participant record
	const myParticipant = $derived(participants.find((p) => p.user_id === currentUserId));
	const isReady = $derived(myParticipant?.is_ready || false);

	// Status badge color
	const statusColor = $derived(() => {
		switch (room.status) {
			case 'waiting':
				return 'badge-warning';
			case 'in_progress':
				return 'badge-success';
			case 'finished':
				return 'badge-neutral';
			case 'cancelled':
				return 'badge-error';
			default:
				return 'badge-ghost';
		}
	});

	const statusText = $derived(() => {
		switch (room.status) {
			case 'waiting':
				return 'Esperando jugadores';
			case 'in_progress':
				return 'En progreso';
			case 'finished':
				return 'Finalizada';
			case 'cancelled':
				return 'Cancelada';
			default:
				return 'Desconocido';
		}
	});

	let isSubmitting = $state(false);
</script>

<div class="card bg-base-100 shadow-lg transition-shadow hover:shadow-xl">
	<div class="card-body">
		<!-- Header -->
		<div class="flex items-start justify-between gap-2">
			<div class="min-w-0 flex-1">
				<h3 class="card-title truncate text-lg">{room.name}</h3>
				<div class="mt-1 flex items-center gap-2 text-sm text-base-content/70">
					<span>{gameMetadata.icon}</span>
					<span>{gameMetadata.name}</span>
					{#if room.is_public}
						<span class="badge badge-sm badge-info">Pública</span>
					{/if}
				</div>
			</div>
			<div class="badge {statusColor()}">{statusText()}</div>
		</div>

		<!-- Participants -->
		<div class="mt-4">
			<div class="mb-2 text-sm font-medium">
				Jugadores ({participants.length}/{room.max_players})
			</div>
			<div class="space-y-2">
				{#each participants as participant (participant.id)}
					{@const profile = participant.profile || {
						display_name: participant.guest_name || 'Invitado',
						avatar_url: null
					}}
					<div
						class="flex items-center gap-2 rounded p-2 {participant.is_bot
							? 'bg-base-300/50'
							: 'bg-base-200'}"
					>
						<!-- Avatar -->
						<div class="avatar">
							<div class="h-10 w-10 rounded-full">
								{#if participant.is_bot}
									<div
										class="flex h-full items-center justify-center bg-neutral text-lg text-neutral-content"
									>
										🤖
									</div>
								{:else if profile.avatar_url}
									<img src={profile.avatar_url} alt={profile.display_name} />
								{:else}
									<div
										class="flex h-full items-center justify-center bg-primary text-lg font-semibold text-primary-content"
									>
										{profile.display_name.charAt(0).toUpperCase()}
									</div>
								{/if}
							</div>
						</div>

						<!-- Name and badges -->
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<span class="truncate font-medium">{profile.display_name}</span>
								{#if participant.is_bot && participant.bot_difficulty}
									<span class="badge badge-xs badge-neutral">{participant.bot_difficulty}</span>
								{/if}
								{#if participant.user_id === room.created_by}
									<span class="badge badge-xs badge-primary">Creador</span>
								{/if}
								{#if participant.user_id === currentUserId}
									<span class="badge badge-xs badge-secondary">Tú</span>
								{/if}
							</div>
							<div class="text-xs text-base-content/60">
								{#if participant.is_bot}
									<span class="text-neutral">🤖 Bot</span>
								{:else if participant.is_ready}
									<span class="text-success">✓ Listo</span>
								{:else}
									<span class="text-warning">⏳ Esperando</span>
								{/if}
							</div>
						</div>

						<!-- Remove bot button (only creator) -->
						{#if participant.is_bot && isCreator && room.status === 'waiting'}
							<form
								method="POST"
								action="?/removeBot"
								use:enhance={() => {
									isSubmitting = true;
									return async ({ update }) => {
										await update();
										isSubmitting = false;
									};
								}}
							>
								<input type="hidden" name="room_id" value={room.id} />
								<input type="hidden" name="bot_id" value={participant.id} />
								<button
									type="submit"
									class="btn btn-circle btn-ghost btn-xs"
									disabled={isSubmitting}
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										fill="none"
										viewBox="0 0 24 24"
										stroke-width="1.5"
										stroke="currentColor"
										class="h-4 w-4"
									>
										<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
									</svg>
								</button>
							</form>
						{:else}
							<!-- Player number -->
							<div class="text-sm font-bold text-base-content/40">
								#{participant.player_number}
							</div>
						{/if}
					</div>
				{/each}

				<!-- Empty slots -->
				{#if participants.length < room.max_players}
					{#each Array(room.max_players - participants.length) as _, i}
						<div class="flex items-center gap-2 rounded border-2 border-dashed border-base-300 p-2">
							<div class="flex h-10 w-10 items-center justify-center rounded-full bg-base-300">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
									stroke-width="1.5"
									stroke="currentColor"
									class="h-5 w-5 text-base-content/30"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
									/>
								</svg>
							</div>
							<span class="flex-1 text-sm text-base-content/40">Esperando jugador...</span>

							<!-- Add bot button (only creator, only if game supports bots) -->
							{#if isCreator && room.status === 'waiting' && room.game_type === 'tic_tac_toe'}
								<div class="dropdown dropdown-end">
									<label tabindex="0" class="btn btn-ghost btn-xs">
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
												d="M12 4.5v15m7.5-7.5h-15"
											/>
										</svg>
										Bot
									</label>
									<ul
										tabindex="0"
										class="dropdown-content menu z-10 w-32 rounded-box bg-base-200 p-2 shadow"
									>
										<li>
											<form
												method="POST"
												action="?/addBot"
												use:enhance={() => {
													isSubmitting = true;
													return async ({ update }) => {
														await update();
														isSubmitting = false;
													};
												}}
											>
												<input type="hidden" name="room_id" value={room.id} />
												<input type="hidden" name="difficulty" value="easy" />
												<button type="submit" class="text-xs" disabled={isSubmitting}>Fácil</button>
											</form>
										</li>
										<li>
											<form
												method="POST"
												action="?/addBot"
												use:enhance={() => {
													isSubmitting = true;
													return async ({ update }) => {
														await update();
														isSubmitting = false;
													};
												}}
											>
												<input type="hidden" name="room_id" value={room.id} />
												<input type="hidden" name="difficulty" value="medium" />
												<button type="submit" class="text-xs" disabled={isSubmitting}>Medio</button>
											</form>
										</li>
										<li>
											<form
												method="POST"
												action="?/addBot"
												use:enhance={() => {
													isSubmitting = true;
													return async ({ update }) => {
														await update();
														isSubmitting = false;
													};
												}}
											>
												<input type="hidden" name="room_id" value={room.id} />
												<input type="hidden" name="difficulty" value="hard" />
												<button type="submit" class="text-xs" disabled={isSubmitting}
													>Difícil</button
												>
											</form>
										</li>
									</ul>
								</div>
							{/if}
						</div>
					{/each}
				{/if}
			</div>
		</div>

		<!-- Join code (if public) -->
		{#if room.is_public && room.join_code}
			<div class="mt-3 rounded-lg bg-info/10 p-2">
				<div class="mb-1 text-xs font-medium text-info">Código de sala:</div>
				<div class="font-mono text-lg font-bold tracking-wider text-info">
					{room.join_code}
				</div>
			</div>
		{/if}

		<!-- Actions -->
		<div class="mt-4 card-actions">
			{#if room.status === 'waiting'}
				{#if isUserInRoom}
					<!-- User is in the room -->
					<div class="flex w-full gap-2">
						<!-- Toggle Ready -->
						<form
							method="POST"
							action="?/toggleReady"
							class="flex-1"
							use:enhance={() => {
								isSubmitting = true;
								return async ({ update }) => {
									await update();
									isSubmitting = false;
								};
							}}
						>
							<input type="hidden" name="room_id" value={room.id} />
							<input type="hidden" name="is_ready" value={isReady ? 'false' : 'true'} />
							<button
								type="submit"
								class="btn w-full btn-sm {isReady ? 'btn-warning' : 'btn-success'}"
								disabled={isSubmitting}
							>
								{isReady ? 'No listo' : 'Listo'}
							</button>
						</form>

						<!-- Leave Room -->
						<form
							method="POST"
							action="?/leaveRoom"
							use:enhance={() => {
								isSubmitting = true;
								return async ({ update }) => {
									await update();
									isSubmitting = false;
								};
							}}
						>
							<input type="hidden" name="room_id" value={room.id} />
							<button type="submit" class="btn btn-sm btn-error" disabled={isSubmitting}>
								Salir
							</button>
						</form>

						<!-- Start Game (only creator) -->
						{#if isCreator}
							<form
								method="POST"
								action="?/startGame"
								use:enhance={() => {
									isSubmitting = true;
									return async ({ update }) => {
										await update();
										isSubmitting = false;
									};
								}}
							>
								<input type="hidden" name="room_id" value={room.id} />
								<button
									type="submit"
									class="btn btn-sm btn-primary"
									disabled={!allReady || isSubmitting}
								>
									Iniciar
								</button>
							</form>
						{/if}
					</div>
				{:else}
					<!-- User not in room, can join -->
					<form
						method="POST"
						action="?/joinRoom"
						class="w-full"
						use:enhance={() => {
							isSubmitting = true;
							return async ({ update }) => {
								await update();
								isSubmitting = false;
							};
						}}
					>
						<input type="hidden" name="room_id" value={room.id} />
						<button
							type="submit"
							class="btn w-full btn-sm btn-primary"
							disabled={participants.length >= room.max_players || isSubmitting}
						>
							{#if participants.length >= room.max_players}
								Sala llena
							{:else}
								Unirse
							{/if}
						</button>
					</form>
				{/if}

				<!-- Delete room (only creator) -->
				{#if isCreator && participants.length === 1}
					<form
						method="POST"
						action="?/deleteRoom"
						use:enhance={() => {
							isSubmitting = true;
							return async ({ update }) => {
								await update();
								isSubmitting = false;
							};
						}}
					>
						<input type="hidden" name="room_id" value={room.id} />
						<button
							type="submit"
							class="btn w-full btn-ghost btn-sm btn-error"
							disabled={isSubmitting}
						>
							Eliminar sala
						</button>
					</form>
				{/if}
			{:else if room.status === 'in_progress'}
				<a
					href="/family/{room.family_id}/games/play/{room.id}"
					class="btn w-full btn-sm btn-primary"
				>
					{isUserInRoom ? 'Continuar Partida' : 'Ver Partida'}
				</a>
			{/if}
		</div>
	</div>
</div>
