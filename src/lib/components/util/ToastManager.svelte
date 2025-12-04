<script lang="ts">
	import { toastStore } from '$lib/stores/toast';

	function getIconForType(type: string) {
		const icons = {
			success: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
			error: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z',
			warning: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
			info: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
		};
		return icons[type as keyof typeof icons] || icons.info;
	}
</script>

<div class="toast toast-top toast-end z-50 max-w-96">
	{#each $toastStore.toasts as toast (toast.id)}
		<div class="alert alert-{toast.type} shadow-lg">
			<div class="flex items-center gap-2">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6 shrink-0"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d={getIconForType(toast.type)}
					/>
				</svg>
				{#if toast.useHTML}
					<span>{@html toast.message}</span>
				{:else}
					<span>{toast.message}</span>
				{/if}
			</div>
			<button
				class="btn btn-sm btn-ghost ms-auto"
				on:click={() => toastStore.dismiss(toast.id)}
				aria-label="Close"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M6 18L18 6M6 6l12 12"
					/>
				</svg>
			</button>
		</div>
	{/each}
</div>