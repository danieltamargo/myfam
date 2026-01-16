<script lang="ts">
	import { enhance } from '$app/forms';

	interface Props {
		isOpen: boolean;
		isGameInProgress: boolean;
		onClose: () => void;
		familyId: string;
	}

	let { isOpen, isGameInProgress, onClose, familyId }: Props = $props();

	let isSubmitting = $state(false);

	function handleClickOutside(event: MouseEvent) {
		if (event.target === event.currentTarget && !isSubmitting) {
			onClose();
		}
	}
</script>

{#if isOpen}
	<div
		class="modal modal-open"
		onclick={handleClickOutside}
		onkeydown={(e) => e.key === 'Escape' && !isSubmitting && onClose()}
		role="button"
		tabindex="0"
	>
		<div class="modal-box">
			<!-- Warning icon -->
			<div class="flex justify-center mb-4">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-16 w-16 {isGameInProgress ? 'text-error' : 'text-warning'}"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
					/>
				</svg>
			</div>

			<!-- Title and message -->
			<h3 class="font-bold text-xl text-center mb-2">
				{isGameInProgress ? '¿Abandonar la partida?' : '¿Salir de la sala?'}
			</h3>

			<div class="text-center mb-6">
				{#if isGameInProgress}
					<p class="text-base-content/80 mb-3">
						La partida está en curso. Si abandonas ahora:
					</p>
					<div class="alert alert-error">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="stroke-current shrink-0 h-6 w-6"
							fill="none"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<span>
							<strong>Se te contará como derrota</strong> y el otro jugador ganará automáticamente.
						</span>
					</div>
				{:else}
					<p class="text-base-content/70">
						¿Estás seguro de que quieres salir de esta sala?
					</p>
				{/if}
			</div>

			<!-- Actions -->
			<div class="modal-action">
				<button type="button" class="btn btn-ghost" onclick={onClose} disabled={isSubmitting}>
					Cancelar
				</button>

				<form
					method="POST"
					action="?/leaveGame"
					use:enhance={() => {
						isSubmitting = true;
						return async ({ update }) => {
							await update();
							isSubmitting = false;
						};
					}}
				>
					<button
						type="submit"
						class="btn {isGameInProgress ? 'btn-error' : 'btn-warning'}"
						disabled={isSubmitting}
					>
						{#if isSubmitting}
							<span class="loading loading-spinner loading-sm"></span>
							Saliendo...
						{:else if isGameInProgress}
							Sí, abandonar
						{:else}
							Sí, salir
						{/if}
					</button>
				</form>
			</div>
		</div>
	</div>
{/if}
