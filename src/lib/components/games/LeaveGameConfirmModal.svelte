<script lang="ts">
	import * as messages from '$paraglide/messages';
	import { enhance } from '$app/forms';
	import { openDialog } from '$lib/components/modals/open-dialog';

	interface Props {
		isOpen: boolean;
		isGameInProgress: boolean;
		onClose: () => void;
		familyId: string;
	}

	let { isOpen, isGameInProgress, onClose, familyId }: Props = $props();

	let isSubmitting = $state(false);

	function cancel() {
		if (!isSubmitting) onClose();
	}
</script>

{#if isOpen}
	<dialog class="modal" use:openDialog={cancel} aria-labelledby="leave-game-title">
		<div class="modal-box">
			<!-- Warning icon -->
			<div class="mb-4 flex justify-center">
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
			<h3 id="leave-game-title" class="mb-2 text-center text-xl font-bold">
				{isGameInProgress ? '¿Abandonar la partida?' : '¿Salir de la sala?'}
			</h3>

			<div class="mb-6 text-center">
				{#if isGameInProgress}
					<p class="mb-3 text-base-content/80">
						{messages['ui.the_game_is_in_progress_if_you_leave_now']()}
					</p>
					<div class="alert alert-error">
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
								d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<span>
							<strong>{messages['ui.it_will_count_as_a_loss']()}</strong>
							{messages['ui.and_the_other_player_will_win']()}
						</span>
					</div>
				{:else}
					<p class="text-base-content/70">
						{messages['ui.are_you_sure_you_want_to_leave_this_room']()}
					</p>
				{/if}
			</div>

			<!-- Actions -->
			<div class="modal-action">
				<button type="button" class="btn btn-ghost" onclick={onClose} disabled={isSubmitting}>
					{messages['ui.cancel']()}
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
							<span class="loading loading-sm loading-spinner"></span>
							Saliendo...
						{:else if isGameInProgress}
							Sí, abandonar
						{:else}
							{messages['ui.yes_leave']()}
						{/if}
					</button>
				</form>
			</div>
		</div>
		<button type="button" class="modal-backdrop" aria-hidden="true" tabindex="-1" onclick={cancel}
		></button>
	</dialog>
{/if}
