<script lang="ts">
	import { enhance } from '$app/forms';
	import GiftComments from '$lib/components/wishlist/GiftComments.svelte';
	import WishlistItemDetails from '$lib/components/wishlist/WishlistItemDetails.svelte';
	import type {
		WishlistCommentDto,
		WishlistItemDto,
		WishlistMemberDto,
		WishlistReservationDto
	} from '$lib/server/wishlist/presenters';

	let {
		item,
		members,
		currentUserId,
		isMyItem,
		isPurchasedByMe,
		isReservedByMe,
		getReservations,
		getComments,
		onClose
	}: {
		item: WishlistItemDto | null;
		members: WishlistMemberDto[];
		currentUserId: string;
		isMyItem: (itemId: string) => boolean;
		isPurchasedByMe: (itemId: string) => boolean;
		isReservedByMe: (itemId: string) => boolean;
		getReservations: (itemId: string) => WishlistReservationDto[];
		getComments: (itemId: string) => WishlistCommentDto[];
		onClose: () => void;
	} = $props();

	let togglingItemId = $state<string | null>(null);

	function getItemEvents(value: WishlistItemDto) {
		return value.gift_item_events.flatMap((eventLink) => {
			const event = eventLink.gift_event_categories;
			return event ? [{ id: eventLink.event_category_id, name: event.name, icon: event.icon }] : [];
		});
	}
</script>

{#if item}
	<div class="modal-open modal">
		<div class="modal-box max-h-[95svh] w-[95vw] {isMyItem(item.id) ? 'max-w-xl' : 'max-w-5xl'}">
			<div class="relative flex flex-col gap-2 md:flex-row">
				<div class="h-fit flex-1 md:sticky md:top-4">
					<div class="mb-5 flex items-center justify-between gap-2">
						<h2 class="text-lg font-bold">Detalle del regalo</h2>
						<div class="placeholder avatar rounded-full">
							<div class="w-10 rounded-full bg-primary text-primary-content">
								{#if item.profiles?.avatar_url}
									<img
										src={item.profiles.avatar_url}
										alt={item.profiles.display_name || 'Avatar'}
										referrerpolicy="no-referrer"
										crossorigin="anonymous"
									/>
								{:else}
									<span class="grid h-full place-items-center text-xs">
										{(item.profiles?.display_name || 'U').substring(0, 2).toUpperCase()}
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
						ownerName={item.profiles?.display_name || 'Usuario'}
					/>

					<!-- Reservations info (visible to all) -->
					{#if !isMyItem(item.id)}
						{@const reservations = getReservations(item.id)}
						{#if reservations.length > 0}
							<div class="mt-4 alert alert-info">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-5 w-5"
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
											class="tooltip tooltip-top font-semibold"
											data-tip={reservations.map((r) => r.profiles.display_name).join(', ')}
										>
											{reservations.length} personas
										</span> están mirando este regalo
									{/if}
								</div>
							</div>
						{/if}
					{/if}

					<!-- Actions for purchase/reservation -->
					{#if !isMyItem(item.id)}
						<div class="mt-6 border-t border-base-300 pt-4">
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
										class="btn w-full gap-2 whitespace-nowrap {isReservedByMe(item.id)
											? 'btn-info'
											: 'btn-outline btn-info'}"
										disabled={togglingItemId === item.id}
									>
										{#if togglingItemId === item.id}
											<span class="loading loading-sm loading-spinner"></span>
										{:else if isReservedByMe(item.id)}
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="h-5 w-5"
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
											Lo estoy mirando
										{:else}
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="h-5 w-5"
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
											Yo lo miro
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
										class="btn w-full gap-2 whitespace-nowrap {isPurchasedByMe(item.id)
											? 'btn-success'
											: 'btn-outline btn-success'}"
										disabled={togglingItemId === item.id}
									>
										{#if togglingItemId === item.id}
											<span class="loading loading-sm loading-spinner"></span>
										{:else if isPurchasedByMe(item.id)}
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="h-5 w-5"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
												stroke-linecap="round"
												stroke-linejoin="round"
											>
												<polyline points="20 6 9 17 4 12"></polyline>
											</svg>
											Ya lo compré
										{:else}
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="h-5 w-5"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
												stroke-linecap="round"
												stroke-linejoin="round"
											>
												<circle cx="9" cy="21" r="1"></circle>
												<circle cx="20" cy="21" r="1"></circle>
												<path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"
												></path>
											</svg>
											Marcar como comprado
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
						class="mt-6 max-w-125 flex-1 border-t border-base-300 pt-6 md:mt-0 md:ml-6 md:border-t-0 md:border-l md:pt-0 md:pl-6"
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
		<button
			type="button"
			class="modal-backdrop cursor-default"
			aria-label="Cerrar"
			onclick={onClose}
		></button>
	</div>
{/if}
