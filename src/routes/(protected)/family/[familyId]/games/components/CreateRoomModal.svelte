<script lang="ts">
	import { enhance } from '$app/forms';
	import { GAME_METADATA, type GameType } from '$lib/types/games';
	import { toastStore } from '$lib/stores/toast';

	interface Props {
		members: any[];
		onClose: () => void;
	}

	let { members, onClose }: Props = $props();

	// Wizard state
	let currentStep = $state(1);

	// Form state
	let selectedGameType = $state<GameType | null>(null);
	let roomName = $state('');
	let maxPlayers = $state(2);
	let isPublic = $state(false);
	let isSubmitting = $state(false);

	// Auto-set max players when game type changes
	$effect(() => {
		if (selectedGameType) {
			const metadata = GAME_METADATA[selectedGameType];
			maxPlayers = metadata.minPlayers;
		}
	});

	function nextStep() {
		if (currentStep === 1 && selectedGameType) {
			currentStep = 2;
			// Auto-fill room name with game name
			if (!roomName) {
				roomName = `Partida de ${GAME_METADATA[selectedGameType].name}`;
			}
		}
	}

	function prevStep() {
		if (currentStep > 1) {
			currentStep--;
		}
	}

	function handleClickOutside(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			onClose();
		}
	}

	const canProceed = $derived(() => {
		if (currentStep === 1) return selectedGameType !== null;
		if (currentStep === 2) return roomName.trim().length > 0;
		return false;
	});
</script>

<div
	class="modal modal-open"
	onclick={handleClickOutside}
	onkeydown={(e) => e.key === 'Escape' && onClose()}
	role="button"
	tabindex="0"
>
	<div class="modal-box max-w-2xl">
		<!-- Header with steps -->
		<div class="mb-6">
			<h3 class="font-bold text-2xl mb-4">Crear Nueva Sala</h3>

			<!-- Progress Steps -->
			<ul class="steps w-full">
				<li class="step {currentStep >= 1 ? 'step-primary' : ''}">Elegir Juego</li>
				<li class="step {currentStep >= 2 ? 'step-primary' : ''}">Configurar Sala</li>
			</ul>
		</div>

		<!-- Step 1: Select Game -->
		{#if currentStep === 1}
			<div class="space-y-4">
				<p class="text-base-content/70">Selecciona el juego que quieres jugar</p>

				<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
					{#each Object.entries(GAME_METADATA) as [type, metadata]}
						<button
							type="button"
							onclick={() => (selectedGameType = type as GameType)}
							class="card bg-base-200 hover:bg-base-300 transition-all cursor-pointer {selectedGameType ===
							type
								? 'ring-2 ring-primary'
								: ''}"
						>
							<div class="card-body p-6 text-center">
								<div class="text-5xl mb-3">{metadata.icon}</div>
								<h4 class="font-bold text-lg">{metadata.name}</h4>
								<p class="text-sm text-base-content/60 mt-2">{metadata.description}</p>
								<div class="divider my-2"></div>
								<div class="flex justify-between text-xs text-base-content/60">
									<span>{metadata.minPlayers}-{metadata.maxPlayers} jugadores</span>
									<span>{metadata.estimatedDuration}</span>
								</div>
								{#if selectedGameType === type}
									<div class="badge badge-primary badge-sm mt-2">Seleccionado</div>
								{/if}
							</div>
						</button>
					{/each}
				</div>
			</div>

			<!-- Step 1 Actions -->
			<div class="modal-action">
				<button type="button" class="btn" onclick={onClose}>Cancelar</button>
				<button type="button" class="btn btn-primary" onclick={nextStep} disabled={!canProceed()}>
					Siguiente
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="1.5"
						stroke="currentColor"
						class="w-4 h-4"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
					</svg>
				</button>
			</div>
		{/if}

		<!-- Step 2: Configure Room -->
		{#if currentStep === 2 && selectedGameType}
			{@const gameMetadata = GAME_METADATA[selectedGameType]}

			<form
				method="POST"
				action="?/createRoom"
				use:enhance={() => {
					isSubmitting = true;
					return async ({ result, update }) => {
						if (result.type === 'success') {
							if (result.data?.joinCode) {
								toastStore.show(
									`Sala creada. Código: <span class="font-mono text-lg font-bold">${result.data.joinCode}</span>`,
									{
										type: 'success',
										duration: 8000,
										useHTML: true
									}
								);
							} else {
								toastStore.show('Sala creada exitosamente', { type: 'success' });
							}
							onClose();
						}
						await update();
						isSubmitting = false;
					};
				}}
			>
				<!-- Hidden game type -->
				<input type="hidden" name="game_type" value={selectedGameType} />

				<div class="space-y-4">
					<!-- Selected Game Display -->
					<div class="alert">
						<div class="flex items-center gap-3">
							<span class="text-4xl">{gameMetadata.icon}</span>
							<div>
								<h4 class="font-bold">{gameMetadata.name}</h4>
								<p class="text-sm text-base-content/60">{gameMetadata.description}</p>
							</div>
						</div>
					</div>

					<!-- Room Name -->
					<div class="form-control">
						<label class="label" for="room-name">
							<span class="label-text font-medium">Nombre de la sala</span>
						</label>
						<input
							id="room-name"
							type="text"
							name="name"
							bind:value={roomName}
							placeholder="Ej: Batalla familiar"
							class="input input-bordered w-full"
							required
							maxlength="50"
						/>
					</div>

					<!-- Max Players -->
					<div class="form-control">
						<label class="label" for="max-players">
							<span class="label-text font-medium">Número de jugadores</span>
						</label>
						<div class="flex gap-2">
							{#each Array(gameMetadata.maxPlayers - gameMetadata.minPlayers + 1) as _, i}
								{@const playerCount = gameMetadata.minPlayers + i}
								<button
									type="button"
									onclick={() => (maxPlayers = playerCount)}
									class="btn flex-1 {maxPlayers === playerCount ? 'btn-primary' : 'btn-outline'}"
								>
									{playerCount} {playerCount === 1 ? 'jugador' : 'jugadores'}
								</button>
							{/each}
						</div>
						<input type="hidden" name="max_players" value={maxPlayers} />
					</div>

					<!-- Public Room Toggle -->
					<div class="form-control">
						<label class="label cursor-pointer justify-start gap-4">
							<input
								type="checkbox"
								name="is_public"
								bind:checked={isPublic}
								value="true"
								class="checkbox checkbox-primary"
							/>
							<div>
								<span class="label-text font-medium">Sala pública con código</span>
								<p class="text-xs text-base-content/60 mt-1">
									Genera un código para que cualquiera pueda unirse
								</p>
							</div>
						</label>
					</div>

					<!-- Info box -->
					<div class="alert alert-info">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							class="stroke-current shrink-0 w-6 h-6"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<span class="text-sm">
							Serás añadido automáticamente a la sala al crearla
						</span>
					</div>
				</div>

				<!-- Step 2 Actions -->
				<div class="modal-action">
					<button type="button" class="btn" onclick={prevStep} disabled={isSubmitting}>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke-width="1.5"
							stroke="currentColor"
							class="w-4 h-4"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
						</svg>
						Atrás
					</button>
					<button type="submit" class="btn btn-primary" disabled={isSubmitting || !canProceed()}>
						{#if isSubmitting}
							<span class="loading loading-spinner loading-sm"></span>
							Creando...
						{:else}
							Crear Sala
						{/if}
					</button>
				</div>
			</form>
		{/if}
	</div>
</div>
