<script lang="ts">
	import GiftComments from '$lib/components/wishlist/GiftComments.svelte';
	import WishlistCoordination from '$lib/components/wishlist/WishlistCoordination.svelte';
	import WishlistItemDetails from '$lib/components/wishlist/WishlistItemDetails.svelte';
	import type {
		WishlistCommentDto,
		WishlistItemDto,
		WishlistMemberDto
	} from '$lib/server/wishlist/presenters';
	import type { WishlistCoordinationSummary } from '$lib/wishlist/coordination';

	let {
		item,
		members,
		currentUserId,
		isMyItem,
		getCoordination,
		getReservationNames,
		getComments,
		onClose
	}: {
		item: WishlistItemDto | null;
		members: WishlistMemberDto[];
		currentUserId: string;
		isMyItem: (itemId: string) => boolean;
		getCoordination: (item: WishlistItemDto) => WishlistCoordinationSummary;
		getReservationNames: (itemId: string) => string[];
		getComments: (itemId: string) => WishlistCommentDto[];
		onClose: () => void;
	} = $props();

	function focusDialog(element: HTMLDivElement) {
		const frame = requestAnimationFrame(() => element.focus());
		return () => cancelAnimationFrame(frame);
	}

	function closeOnEscape(event: KeyboardEvent) {
		if (event.key === 'Escape') onClose();
	}

	function getItemEvents(value: WishlistItemDto) {
		return value.gift_item_events.flatMap((eventLink) => {
			const event = eventLink.gift_event_categories;
			return event ? [{ id: eventLink.event_category_id, name: event.name, icon: event.icon }] : [];
		});
	}
</script>

<svelte:window onkeydown={closeOnEscape} />

{#if item}
	{@const isOwner = isMyItem(item.id)}
	<div class="modal-open modal" role="presentation">
		<div
			class="modal-box max-h-[95svh] w-[95vw] max-w-[95vw] min-w-0 overflow-x-hidden p-4 sm:p-6 {isOwner
				? 'md:max-w-xl'
				: 'md:max-w-5xl'}"
			role="dialog"
			aria-modal="true"
			aria-labelledby={`wishlist-detail-title-${item.id}`}
			tabindex="-1"
			{@attach focusDialog}
		>
			<div class="relative flex min-w-0 flex-col gap-2 md:flex-row">
				<div class="h-fit min-w-0 flex-1 md:sticky md:top-4">
					<div class="mb-5 flex items-center justify-between gap-2">
						<h2 id={`wishlist-detail-title-${item.id}`} class="text-lg font-bold">
							Detalle del regalo
						</h2>
						<div class="placeholder avatar rounded-full">
							<div class="w-10 rounded-full bg-primary text-primary-content">
								{#if item.profiles.avatar_url}
									<img
										src={item.profiles.avatar_url}
										alt={item.profiles.display_name}
										referrerpolicy="no-referrer"
										crossorigin="anonymous"
									/>
								{:else}
									<span class="grid h-full place-items-center text-xs">
										{item.profiles.display_name.substring(0, 2).toUpperCase()}
									</span>
								{/if}
							</div>
						</div>
					</div>

					<WishlistItemDetails
						name={item.name}
						description={item.description}
						price={item.price}
						currency={item.currency}
						priority={item.priority}
						desiredQuantity={item.desired_quantity}
						imageSrc={item.image_src}
						links={item.links}
						events={getItemEvents(item)}
						ownerName={item.profiles.display_name}
					/>

					{#if isOwner}
						<div class="mt-4 alert alert-info" role="status">
							<span>La coordinación está oculta para proteger la sorpresa.</span>
						</div>
					{:else}
						<div class="mt-5">
							<WishlistCoordination
								itemId={item.id}
								summary={getCoordination(item)}
								reservationNames={getReservationNames(item.id)}
							/>
						</div>
					{/if}
				</div>

				{#if !isOwner}
					<div
						class="mt-6 w-full max-w-125 min-w-0 flex-1 border-t border-base-300 pt-6 md:mt-0 md:ml-6 md:border-t-0 md:border-l md:pt-0 md:pl-6"
					>
						<GiftComments
							itemId={item.id}
							comments={getComments(item.id)}
							{members}
							{currentUserId}
							itemOwnerId={item.owner_id}
						/>
					</div>
				{/if}
			</div>
			<div class="modal-action">
				<button class="btn" onclick={onClose}>Cerrar</button>
			</div>
		</div>
		<button type="button" class="modal-backdrop" aria-label="Cerrar" onclick={onClose}></button>
	</div>
{/if}
