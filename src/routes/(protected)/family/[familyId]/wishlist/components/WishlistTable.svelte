<script lang="ts">
	import { enhance } from '$app/forms';

	type GiftItem = any;

	let {
		items,
		currentUserId,
		isMyItem,
		isPurchased,
		isPurchasedByMe,
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
	<div class="overflow-x-auto">
		<table class="table table-zebra">
			<thead>
				<tr>
					<th>Regalo</th>
					<th>Dueño</th>
					<th>Precio</th>
					<th>Prioridad</th>
					<th>Estado</th>
					<th>Eventos</th>
					<th>Acciones</th>
				</tr>
			</thead>
			<tbody>
				{#each items as item (item.id)}
					{@const isOwner = isMyItem(item.id)}
					{@const purchased = isPurchasedByMe(item.id)}
					{@const itemPurchased = isPurchased(item.id)}

					<tr class="{isOwner ? 'bg-primary/5 hover:bg-primary/10' : ''} {itemPurchased ? 'bg-success/10 hover:bg-success/20' : ''}">
						<td>
							<div class="flex items-center gap-3">
								{#if item.image_url}
									<div class="avatar">
										<div class="w-12 h-12 rounded">
											<img
												src={item.image_url}
												alt={item.name}
												referrerpolicy="no-referrer"
												crossorigin="anonymous"
											/>
										</div>
									</div>
								{/if}
								<div class="font-bold">{item.name}</div>
							</div>
						</td>
						<td>{item.profiles?.display_name || 'Usuario'}</td>
						<td class="font-semibold text-primary">{formatPrice(item.price)}</td>
						<td>
							<span class="badge {getPriorityColor(item.priority!)}">
								{getPriorityLabel(item.priority!)}
							</span>
						</td>
						<td>
							{#if !isOwner}
								{#if itemPurchased}
									<span class="badge badge-success gap-1">
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="w-3 h-3"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
										>
											<polyline points="20 6 9 17 4 12"></polyline>
										</svg>
										Comprado
									</span>
								{:else}
									<span class="text-base-content/50 text-sm">Por comprar</span>
								{/if}
							{:else}
								<span class="text-base-content/50 text-sm">-</span>
							{/if}
						</td>
						<td>
							<div class="flex flex-wrap gap-1">
								{#each item.gift_item_events || [] as eventLink}
									{#if eventLink.gift_event_categories}
										<span class="text-sm">
											{eventLink.gift_event_categories.icon}
										</span>
									{/if}
								{/each}
							</div>
						</td>
						<td>
							<div class="flex gap-1">
								<button
									class="btn btn-ghost btn-xs"
									onclick={() => onOpenDetail(item)}
									title="Ver detalles"
								>
									<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
										<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
										<circle cx="12" cy="12" r="3"></circle>
									</svg>
								</button>

								{#if isOwner}
									<button
										class="btn btn-ghost btn-xs"
										onclick={() => onOpenEdit(item)}
										title="Editar"
									>
										<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
											<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
											<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
										</svg>
									</button>
								{:else}
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
											class="btn btn-xs gap-1 {purchased ? 'btn-success' : 'btn-outline'}"
											disabled={togglingItemId === item.id}
											title={purchased ? 'Comprado' : 'Marcar como comprado'}
										>
											{#if togglingItemId === item.id}
												<span class="loading loading-spinner loading-xs"></span>
											{:else if purchased}
												<svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
													<polyline points="20 6 9 17 4 12"></polyline>
												</svg>
											{:else}
												<svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
													<circle cx="9" cy="21" r="1"></circle>
													<circle cx="20" cy="21" r="1"></circle>
													<path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
												</svg>
											{/if}
										</button>
									</form>
								{/if}
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
