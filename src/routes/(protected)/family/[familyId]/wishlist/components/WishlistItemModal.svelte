<script lang="ts">
	import { enhance } from '$app/forms';
	import GiftComments from '$lib/components/wishlist/GiftComments.svelte';

	type GiftItem = any;
	type Member = any;

	let {
		item,
		members,
		currentUserId,
		isMyItem,
		isPurchasedByMe,
		isReservedByMe,
		getReservations,
		getComments,
		getPriorityLabel,
		getPriorityColor,
		formatPrice,
		onClose
	}: {
		item: GiftItem | null;
		members: Member[];
		currentUserId: string;
		isMyItem: (itemId: string) => boolean;
		isPurchasedByMe: (itemId: string) => boolean;
		isReservedByMe: (itemId: string) => boolean;
		getReservations: (itemId: string) => any[];
		getComments: (itemId: string) => any[];
		getPriorityLabel: (priority: number) => string;
		getPriorityColor: (priority: number) => string;
		formatPrice: (price: number | null) => string;
		onClose: () => void;
	} = $props();

	let togglingItemId = $state<string | null>(null);
</script>

{#if item}
	<div class="modal modal-open">
		<div class="modal-box w-[95vw] max-h-[95svh] {isMyItem(item.id) ? 'max-w-xl' : 'max-w-5xl'}">
			<div class="relative flex gap-2 flex-col md:flex-row">
				<div class="md:sticky md:top-4 flex-1 h-fit">
					<div class="flex gap-2 justify-between items-center">
						<h3 class="font-bold text-lg mb-4">{item.name}</h3>
						<div class="avatar placeholder rounded-full">
							<div class="bg-primary text-primary-content rounded-full w-10">
								{#if item.profiles?.avatar_url}
									<img
										src={item.profiles.avatar_url}
										alt={item.profiles.display_name || 'Avatar'}
										referrerpolicy="no-referrer"
										crossorigin="anonymous"
									/>
								{:else}
									<span class="text-xs grid place-items-center h-full">
										{(item.profiles?.display_name || 'U').substring(0, 2).toUpperCase()}
									</span>
								{/if}
							</div>
						</div>
					</div>

					{#if item.image_url}
						<figure class="mb-4">
							<img
								src={item.image_url}
								alt={item.name}
								class="w-full rounded-lg max-h-96 object-cover"
								referrerpolicy="no-referrer"
								crossorigin="anonymous"
							/>
						</figure>
					{/if}

					<div class="space-y-3">
						<!-- Descripción solo si existe -->
						{#if item.description && item.description.trim().length > 0}
							<div>
								<p class="text-base-content/60 mt-1">{item.description}</p>
							</div>
						{/if}

						<div>
							<span class="font-semibold">Precio:</span>
							<span class="text-primary ml-2">
								{item.price ? formatPrice(item.price) : 'Desconocido'}
							</span>
						</div>

						<div>
							<span class="font-semibold">Prioridad:</span>
							<span class="badge {getPriorityColor(item.priority)} ml-2">
								{getPriorityLabel(item.priority)}
							</span>
						</div>

						{#if item.links && item.links.length > 0}
							<div>
								<span class="font-semibold">Enlaces:</span>
								<ul class="list-disc list-inside mt-1">
									{#each item.links as link}
										<li>
											<a
												href={link}
												target="_blank"
												rel="noopener noreferrer"
												class="link link-primary"
											>
												{link}
											</a>
										</li>
									{/each}
								</ul>
							</div>
						{/if}

						<div>
							<span class="font-semibold">Eventos:</span>
							<div class="flex flex-wrap gap-1 mt-1">
								{#each item.gift_item_events || [] as eventLink}
									{#if eventLink.gift_event_categories}
										<span
											class="badge"
											style="background-color: {eventLink.gift_event_categories.color}20; color: {eventLink
												.gift_event_categories.color};"
										>
											{eventLink.gift_event_categories.icon}
											{eventLink.gift_event_categories.name}
										</span>
									{/if}
								{/each}
							</div>
						</div>

						<div>
							<span class="font-semibold">Deseado por:</span>
							<span class="ml-2">{item.profiles?.display_name || 'Usuario'}</span>
						</div>
					</div>

					<!-- Reservations info (visible to all) -->
					{#if !isMyItem(item.id)}
						{@const reservations = getReservations(item.id)}
						{#if reservations.length > 0}
							<div class="mt-4 alert alert-info">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="w-5 h-5"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
									<circle cx="12" cy="12" r="3"></circle>
								</svg>
								<div class="text-sm">
									{#if reservations.length === 1}
										<span class="font-semibold"
											>{reservations[0].profiles?.display_name || 'Alguien'}</span
										>
										está mirando este regalo
									{:else}
										<span 
										class="font-semibold tooltip tooltip-top" 
										data-tip="{reservations.map(r => r.profiles.display_name).join(', ')}">
											{reservations.length} personas
										</span> están mirando
										este regalo
									{/if}
								</div>
							</div>
						{/if}
					{/if}

					<!-- Actions for purchase/reservation -->
					{#if !isMyItem(item.id)}
						<div class="mt-6 pt-4 border-t border-base-300">
							<div class="flex gap-2">
								<form
									method="POST"
									action="?/toggleReservation"
									use:enhance={() => {
										togglingItemId = item.id;
										return async ({ result, update }) => {
											await update();
											togglingItemId = null;
										};
									}}
									class="flex-1"
								>
									<input type="hidden" name="item_id" value={item.id} />
									<input
										type="hidden"
										name="is_reserved"
										value={(!isReservedByMe(item.id)).toString()}
									/>
									<button
										type="submit"
										class="btn w-full whitespace-nowrap {isReservedByMe(item.id)
											? 'btn-info'
											: 'btn-outline btn-info'}"
										disabled={togglingItemId === item.id}
									>
										{#if togglingItemId === item.id}
											<span class="loading loading-spinner loading-sm"></span>
										{:else}
											{isReservedByMe(item.id) ? '👁️ Lo estoy mirando' : '👀 Yo lo miro'}
										{/if}
									</button>
								</form>
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
									class="flex-1"
								>
									<input type="hidden" name="item_id" value={item.id} />
									<input
										type="hidden"
										name="is_purchased"
										value={(!isPurchasedByMe(item.id)).toString()}
									/>
									<button
										type="submit"
										class="btn w-full whitespace-nowrap {isPurchasedByMe(item.id)
											? 'btn-success'
											: 'btn-outline btn-success'}"
										disabled={togglingItemId === item.id}
									>
										{#if togglingItemId === item.id}
											<span class="loading loading-spinner loading-sm"></span>
										{:else}
											{isPurchasedByMe(item.id) ? '✅ Ya lo compré' : '🛒 Marcar como comprado'}
										{/if}
									</button>
								</form>
							</div>
						</div>
					{/if}
				</div>

				<!-- Comments Section (only visible to non-owners) -->
				{#if !isMyItem(item.id)}
					<div
						class="mt-6 pt-6 border-t md:ml-6 md:pl-6 md:border-l md:mt-0 md:pt-0 md:border-t-0 border-base-300 max-w-125 flex-1"
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
		<div class="modal-backdrop" onclick={onClose}></div>
	</div>
{/if}
