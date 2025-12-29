<script lang="ts">
	import { enhance } from '$app/forms';

	type GiftItem = any;

	let {
		items,
		currentUserId,
		isMyItem,
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
		{#if currentUserId === null}
			<p class="text-base-content/50 text-lg">No hay regalos en la wishlist</p>
		{:else if isMyItem('dummy')}
			<p class="text-base-content/50 text-lg">Aún no has agregado ningún regalo. ¡Agrega el primero!</p>
		{:else}
			<p class="text-base-content/50 text-lg">Aún no hay regalos en esta wishlist.</p>
		{/if}
	</div>
{:else}
	<div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
		{#each items as item (item.id)}
			{@const isOwner = isMyItem(item.id)}
			{@const purchased = isPurchasedByMe(item.id)}

			<div class="card bg-base-100 shadow-lg hover:shadow-xl transition-shadow">
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

					<!-- Reservation indicator -->
					{#if !isOwner}
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

					<!-- Actions -->
					<div class="card-actions justify-end mt-2">
						<button class="btn btn-sm btn-ghost" onclick={() => onOpenDetail(item)}>
							👁️ Ver
						</button>

						{#if isOwner}
							<button class="btn btn-sm btn-ghost" onclick={() => onOpenEdit(item)}>
								✏️ Editar
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
									class="btn btn-sm {purchased ? 'btn-success' : 'btn-outline btn-success'}"
									disabled={togglingItemId === item.id}
								>
									{#if togglingItemId === item.id}
										<span class="loading loading-spinner loading-xs"></span>
									{:else}
										{purchased ? '✅ Comprado' : '🛒 Marcar'}
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
