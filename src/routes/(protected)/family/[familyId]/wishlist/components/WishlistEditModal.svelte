<script lang="ts">
	import { onMount } from 'svelte';
	import WishlistItemForm from '$lib/components/wishlist/WishlistItemForm.svelte';
	import type { WishlistEventCategoryDto, WishlistItemDto } from '$lib/server/wishlist/presenters';
	import type { CalendarEventOption } from '$lib/server/calendar/resource-links';

	let {
		item,
		eventCategories,
		calendarEvents,
		todosEventId,
		onClose
	}: {
		item: WishlistItemDto | null;
		eventCategories: WishlistEventCategoryDto[];
		calendarEvents: CalendarEventOption[];
		todosEventId: string;
		onClose: () => void;
	} = $props();

	onMount(() => {
		const returnFocus =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;
		return () => returnFocus?.focus();
	});
</script>

<svelte:window onkeydown={(event) => event.key === 'Escape' && onClose()} />

<div class="modal-open modal" role="presentation">
	<div
		class="modal-box max-h-[95svh] w-[95vw] max-w-6xl overflow-y-auto bg-base-100"
		role="dialog"
		aria-modal="true"
		aria-labelledby="wishlist-editor-title"
	>
		<header class="mb-6 flex items-center justify-between gap-4 border-b border-base-300 pb-4">
			<div>
				<p class="text-xs font-semibold tracking-wide text-primary uppercase">Lista de deseos</p>
				<h2 id="wishlist-editor-title" class="text-2xl font-bold">
					{item ? 'Editar regalo' : 'Nuevo regalo'}
				</h2>
			</div>
			<button
				type="button"
				class="btn btn-circle btn-ghost btn-sm"
				aria-label="Cerrar"
				onclick={onClose}
			>
				<span aria-hidden="true">✕</span>
			</button>
		</header>

		<WishlistItemForm
			{item}
			{eventCategories}
			{calendarEvents}
			{todosEventId}
			onSuccess={onClose}
			onCancel={onClose}
		/>
	</div>
	<button type="button" class="modal-backdrop cursor-default" aria-label="Cerrar" onclick={onClose}
	></button>
</div>
