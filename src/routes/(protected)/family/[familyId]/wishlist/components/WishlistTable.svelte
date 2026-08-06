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
	<div class="overflow-x-auto rounded-box border border-base-300 bg-base-100">
		<table class="table">
			<caption class="sr-only">Regalos de la wishlist familiar</caption>
			<thead>
				<tr>
					<th>Regalo</th>
					<th>Dueño</th>
					<th>Precio</th>
					<th>Prioridad</th>
					<th class="min-w-64">Coordinación</th>
					<th>Acciones</th>
				</tr>
			</thead>
			<tbody>
				{#each items as item (item.id)}
					{@const isOwner = isMyItem(item.id)}
					{@const coordination = getCoordination(item)}

					<tr class={isOwner ? 'bg-primary/5' : ''} data-testid={`wishlist-item-${item.id}`}>
						<td>
							<div class="flex items-center gap-3">
								{#if item.image_src}
									<div class="avatar">
										<div class="h-12 w-12 rounded">
											<img
												src={item.image_src}
												alt={item.name}
												referrerpolicy="no-referrer"
												crossorigin="anonymous"
											/>
										</div>
									</div>
								{/if}
								<div>
									<div class="font-bold">{item.name}</div>
									<span class="badge badge-ghost badge-xs">{item.status}</span>
								</div>
							</div>
						</td>
						<td>{item.profiles.display_name}</td>
						<td class="font-semibold text-primary">{formatPrice(item.price, item.currency)}</td>
						<td>
							<span class="badge badge-sm {getPriorityColor(item.priority)}">
								{getPriorityLabel(item.priority)}
							</span>
						</td>
						<td>
							{#if isOwner}
								<span class="text-sm text-base-content/55">Oculta para ti</span>
							{:else}
								<WishlistCoordination
									itemId={item.id}
									summary={coordination}
									reservationNames={getReservationNames(item.id)}
									variant="summary"
								/>
							{/if}
						</td>
						<td>
							<div class="flex gap-1">
								<button
									class="btn btn-ghost btn-xs"
									onclick={() => onOpenDetail(item)}
									aria-label={`Ver detalles de ${item.name}`}
								>
									Ver
								</button>
								{#if isOwner}
									<button
										class="btn btn-xs btn-primary"
										onclick={() => onOpenEdit(item)}
										aria-label={`Editar ${item.name}`}
									>
										Editar
									</button>
								{/if}
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
