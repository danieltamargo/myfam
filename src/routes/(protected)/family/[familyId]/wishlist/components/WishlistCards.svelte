<script lang="ts">
	import { enhance } from '$app/forms';

	type GiftItem = any;

	let {
		items,
		currentUserId,
		isMyItem,
		isPurchased,
		isPurchasedByMe,
		getReservations,
		getPriorityLabel,
		getPriorityColor,
		formatPrice,
		onOpenDetail,
		onOpenEdit
	}: {
		items: GiftItem[];
		currentUserId: string;
		isMyItem: (itemId: string) => boolean;
		isPurchased: (itemId: string) => boolean;
		isPurchasedByMe: (itemId: string) => boolean;
		getReservations: (itemId: string) => any[];
		getPriorityLabel: (priority: number) => string;
		getPriorityColor: (priority: number) => string;
		formatPrice: (price: number | null) => string;
		onOpenDetail: (item: any) => void;
		onOpenEdit: (item: any) => void;
	} = $props();

	let togglingItemId = $state<string | null>(null);
</script>

{#if items.length === 0}
	<div class="text-center py-12">
		<p class="text-base-content/50 text-lg">Aún no hay regalos en la wishlist</p>
	</div>
{:else}
	<div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
		{#each items as item (item.id)}
			{@const isOwner = isMyItem(item.id)}
			{@const purchased = isPurchasedByMe(item.id)}
			{@const itemPurchased = isPurchased(item.id)}

			<div class="card bg-base-100 shadow-lg hover:shadow-xl transition-shadow {isOwner ? 'ring-2 ring-primary ring-offset-2 bg-primary/5' : ''} {itemPurchased ? 'ring-2 ring-success ring-offset-2 bg-success/10' : ''}">
				<!-- Image -->
				{#if item.image_url}
					<figure class="h-48 overflow-hidden">
						<img
							src={item.image_url}
							alt={item.name}
							class="w-full h-full object-cover"
							referrerpolicy="no-referrer"
							crossorigin="anonymous"
						/>
					</figure>
				{/if}

				<div class="card-body">
					<!-- Title & Owner -->
					<h2 class="card-title text-lg">
						{item.name}
						{#if item.priority !== 0}
							<span class="badge {getPriorityColor(item.priority!)} badge-sm">
								{getPriorityLabel(item.priority!)}
							</span>
						{/if}
					</h2>

					<p class="text-sm text-base-content/60">
						Por: {item.profiles?.display_name || 'Usuario'}
					</p>

					<!-- Price -->
					<div class="text-sm">
						<span class="font-semibold text-primary">{formatPrice(item.price)}</span>
					</div>

					<!-- Events -->
					{#if item.gift_item_events && item.gift_item_events.length > 0}
						<div class="flex flex-wrap gap-1">
							{#each item.gift_item_events as eventLink}
								{#if eventLink.gift_event_categories}
									<span
										class="badge badge-sm"
										style="background-color: {eventLink.gift_event_categories.color}20; color: {eventLink
											.gift_event_categories.color};"
									>
										{eventLink.gift_event_categories.icon}
										{eventLink.gift_event_categories.name}
									</span>
								{/if}
							{/each}
						</div>
					{/if}

					<!-- Purchase/Reservation indicator (priority: purchased > reservations) -->
					{#if !isOwner}
						{#if itemPurchased}
							<div class="badge badge-success gap-1">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="w-4 h-4"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<polyline points="20 6 9 17 4 12"></polyline>
								</svg>
								Ya comprado
							</div>
						{:else}
							{@const reservations = getReservations(item.id)}
							{#if reservations.length > 0}
								<div class="badge badge-info badge-sm gap-1">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="w-3 h-3"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
									>
										<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
										<circle cx="12" cy="12" r="3"></circle>
									</svg>
									{reservations.length}
									{reservations.length === 1 ? 'persona mirando' : 'personas mirando'}
								</div>
							{/if}
						{/if}
					{/if}

					<!-- Actions -->
					<div class="card-actions justify-end mt-2">
						<button class="btn btn-sm btn-ghost gap-1" onclick={() => onOpenDetail(item)}>
							<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
								<circle cx="12" cy="12" r="3"></circle>
							</svg>
							Ver
						</button>

						{#if isOwner}
							<button class="btn btn-sm btn-ghost gap-1" onclick={() => onOpenEdit(item)}>
								<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
									<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
								</svg>
								Editar
							</button>
						{:else}
							<!-- Toggle purchase button -->
							<form
								method="POST"
								action="?/togglePurchase"
								use:enhance={() => {
									togglingItemId = item.id;
									return async ({ result, update }) => {
										await update();
										togglingItemId = null;
									};
								}}
							>
								<input type="hidden" name="item_id" value={item.id} />
								<input type="hidden" name="is_purchased" value={(!purchased).toString()} />
								<button
									type="submit"
									class="btn btn-sm gap-1 {purchased ? 'btn-success' : 'btn-outline btn-success'}"
									disabled={togglingItemId === item.id}
								>
									{#if togglingItemId === item.id}
										<span class="loading loading-spinner loading-xs"></span>
									{:else if purchased}
										<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
											<polyline points="20 6 9 17 4 12"></polyline>
										</svg>
										Comprado
									{:else}
										<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
											<circle cx="9" cy="21" r="1"></circle>
											<circle cx="20" cy="21" r="1"></circle>
											<path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
										</svg>
										Marcar
									{/if}
								</button>
							</form>
						{/if}
					</div>
				</div>
			</div>
		{/each}
	</div>
{/if}
