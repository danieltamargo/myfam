<script lang="ts">
	import * as messages from '$paraglide/messages';
	import { openDialog } from '$lib/components/modals/open-dialog';
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
</script>

<dialog class="modal" use:openDialog={onClose} aria-labelledby="wishlist-editor-title">
	<div class="modal-box max-h-[95svh] w-[95vw] max-w-6xl overflow-y-auto bg-base-100">
		<header class="mb-6 flex items-center justify-between gap-4 border-b border-base-300 pb-4">
			<div>
				<p class="text-xs font-semibold tracking-wide text-primary uppercase">
					{messages['ui.wishlist']()}
				</p>
				<h2 id="wishlist-editor-title" class="text-2xl font-bold">
					{item ? 'Editar regalo' : 'Nuevo regalo'}
				</h2>
			</div>
			<button
				type="button"
				class="btn btn-circle btn-ghost btn-sm"
				aria-label={messages['ui.close']()}
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
	<button
		type="button"
		class="modal-backdrop cursor-default"
		aria-hidden="true"
		tabindex="-1"
		onclick={onClose}
	></button>
</dialog>
