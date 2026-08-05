<script lang="ts">
	type ViewMode = 'cards' | 'table';

	let {
		viewMode = $bindable(),
		onAddGift
	}: {
		viewMode: ViewMode;
		onAddGift: () => void;
	} = $props();
</script>

<div class="mb-6 flex items-center justify-between rounded-lg bg-base-200 p-4">
	<div class="text-sm font-medium text-base-content/70">Wishlist</div>
	<div class="flex gap-2">
		<div class="join">
			<button
				class="btn join-item btn-sm {viewMode === 'cards' ? 'btn-active' : ''}"
				onclick={() => (viewMode = 'cards')}
			>
				🃏 Tarjetas
			</button>
			<button
				class="btn join-item btn-sm {viewMode === 'table' ? 'btn-active' : ''}"
				onclick={() => (viewMode = 'table')}
			>
				📊 Tabla
			</button>
		</div>

		<button class="btn gap-2 btn-sm btn-primary" onclick={onAddGift}>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-4 w-4"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<line x1="12" y1="5" x2="12" y2="19"></line>
				<line x1="5" y1="12" x2="19" y2="12"></line>
			</svg>
			Añadir Regalo
		</button>
	</div>
</div>
