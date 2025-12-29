<script lang="ts">
	import { enhance } from '$app/forms';

	type GiftItem = any;

	let {
		items,
		currentUserId,
		isMyItem,
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
		<p class="text-base-content/50 text-lg">No hay regalos en la wishlist</p>
		<p class="text-base-content/40 text-sm mt-2">¡Añade el primero!</p>
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
					<th>Eventos</th>
					<th>Acciones</th>
				</tr>
			</thead>
			<tbody>
				{#each items as item (item.id)}
					{@const isOwner = isMyItem(item.id)}
					{@const purchased = isPurchasedByMe(item.id)}

					<tr>
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
									👁️
								</button>

								{#if isOwner}
									<button
										class="btn btn-ghost btn-xs"
										onclick={() => onOpenEdit(item)}
										title="Editar"
									>
										✏️
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
											class="btn btn-xs {purchased ? 'btn-success' : 'btn-outline'}"
											disabled={togglingItemId === item.id}
										>
											{#if togglingItemId === item.id}
												<span class="loading loading-spinner loading-xs"></span>
											{:else}
												{purchased ? '✅' : '🛒'}
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
