<script lang="ts">
	import WishlistCoordination from '$lib/components/wishlist/WishlistCoordination.svelte';
	import type { WishlistItemDto } from '$lib/server/wishlist/presenters';
	import type { WishlistCoordinationSummary } from '$lib/wishlist/coordination';

	let {
		items,
		isMyItem,
		getCoordination,
		getReservationNames,
		getPriorityLabel,
		getPriorityColor,
		formatPrice,
		onOpenDetail,
		onOpenEdit
	}: {
		items: WishlistItemDto[];
		isMyItem: (itemId: string) => boolean;
		getCoordination: (item: WishlistItemDto) => WishlistCoordinationSummary;
		getReservationNames: (itemId: string) => string[];
		getPriorityLabel: (priority: number) => string;
		getPriorityColor: (priority: number) => string;
		formatPrice: (price: number | null, currency: string) => string;
		onOpenDetail: (item: WishlistItemDto) => void;
		onOpenEdit: (item: WishlistItemDto) => void;
	} = $props();
</script>

{#if items.length === 0}
	<div class="rounded-box border border-dashed border-base-300 py-12 text-center" role="status">
		<p class="text-lg text-base-content/60">No hay regalos que coincidan con estos filtros.</p>
	</div>
{:else}
	<div class="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
		{#each items as item (item.id)}
			{@const isOwner = isMyItem(item.id)}
			{@const coordination = getCoordination(item)}

			<article
				class="card border border-base-300 bg-base-100 shadow-sm transition-shadow hover:shadow-md {isOwner
					? 'ring-2 ring-primary/30'
					: ''}"
				data-testid={`wishlist-item-${item.id}`}
			>
				{#if item.image_src}
					<figure class="h-48 overflow-hidden">
						<img
							src={item.image_src}
							alt={item.name}
							class="h-full w-full object-cover"
							referrerpolicy="no-referrer"
							crossorigin="anonymous"
						/>
					</figure>
				{/if}

				<div class="card-body gap-3">
					<div class="flex items-start justify-between gap-2">
						<div>
							<h2 class="card-title text-lg">{item.name}</h2>
							<p class="text-sm text-base-content/60">
								Por {item.profiles.display_name}{isOwner ? ' · Tu regalo' : ''}
							</p>
						</div>
						<span class="badge badge-sm {getPriorityColor(item.priority)}">
							{getPriorityLabel(item.priority)}
						</span>
					</div>

					<p class="font-semibold text-primary">{formatPrice(item.price, item.currency)}</p>

					{#if item.gift_item_events.length > 0}
						<div class="flex flex-wrap gap-1" aria-label="Categorías">
							{#each item.gift_item_events as eventLink (eventLink.event_category_id)}
								{#if eventLink.gift_event_categories}
									<span class="badge badge-ghost badge-sm">
										{eventLink.gift_event_categories.icon}
										{eventLink.gift_event_categories.name}
									</span>
								{/if}
							{/each}
						</div>
					{/if}

					{#if !isOwner}
						<WishlistCoordination
							itemId={item.id}
							summary={coordination}
							reservationNames={getReservationNames(item.id)}
							variant="summary"
						/>
					{:else}
						<p class="rounded-box bg-primary/5 p-3 text-xs text-base-content/65">
							La coordinación de tu regalo permanece oculta para no estropear la sorpresa.
						</p>
					{/if}

					<div class="mt-auto card-actions justify-end">
						<button class="btn btn-ghost btn-sm" onclick={() => onOpenDetail(item)}>
							Ver detalles
						</button>
						{#if isOwner}
							<button class="btn btn-sm btn-primary" onclick={() => onOpenEdit(item)}>Editar</button
							>
						{/if}
					</div>
				</div>
			</article>
		{/each}
	</div>
{/if}
