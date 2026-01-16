<script lang="ts">
	import { enhance } from '$app/forms';

	interface Props {
		onClose: () => void;
	}

	let { onClose }: Props = $props();

	let joinCode = $state('');
	let isSubmitting = $state(false);

	// Format join code as user types (auto uppercase, max 6 chars)
	function handleInput(event: Event) {
		const input = event.target as HTMLInputElement;
		joinCode = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
	}

	function handleClickOutside(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			onClose();
		}
	}
</script>

<div
	class="modal modal-open"
	onclick={handleClickOutside}
	onkeydown={(e) => e.key === 'Escape' && onClose()}
	role="button"
	tabindex="0"
>
	<div class="modal-box max-w-md">
		<h3 class="font-bold text-2xl mb-4">Unirse con Código</h3>

		<form
			method="POST"
			action="?/joinRoom"
			use:enhance={() => {
				isSubmitting = true;
				return async ({ result, update }) => {
					if (result.type === 'success') {
						onClose();
					}
					await update();
					isSubmitting = false;
				};
			}}
		>
			<div class="space-y-4">
				<!-- Join Code Input -->
				<div class="form-control">
					<label class="label" for="join-code">
						<span class="label-text font-medium">Código de sala</span>
					</label>
					<input
						id="join-code"
						type="text"
						name="join_code"
						value={joinCode}
						oninput={handleInput}
						placeholder="ABC123"
						class="input input-bordered input-lg w-full text-center font-mono text-2xl tracking-wider"
						required
						maxlength="6"
						autocomplete="off"
						autofocus
					/>
					<label class="label">
						<span class="label-text-alt text-base-content/60">
							Introduce el código de 6 caracteres
						</span>
					</label>
				</div>

				<!-- Info -->
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
						El código te lo debe proporcionar el creador de la sala
					</span>
				</div>

				<!-- Visual representation of code -->
				{#if joinCode.length > 0}
					<div class="flex justify-center gap-2">
						{#each Array(6) as _, i}
							<div
								class="w-12 h-14 border-2 rounded-lg flex items-center justify-center text-2xl font-bold {i <
								joinCode.length
									? 'border-primary bg-primary/10 text-primary'
									: 'border-base-300 text-base-content/20'}"
							>
								{joinCode[i] || ''}
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Actions -->
			<div class="modal-action">
				<button type="button" class="btn" onclick={onClose} disabled={isSubmitting}>
					Cancelar
				</button>
				<button
					type="submit"
					class="btn btn-primary"
					disabled={isSubmitting || joinCode.length !== 6}
				>
					{#if isSubmitting}
						<span class="loading loading-spinner loading-sm"></span>
						Uniéndose...
					{:else}
						Unirse a Sala
					{/if}
				</button>
			</div>
		</form>
	</div>
</div>
