<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { createClient } from '$lib/supabase';
	import GiftComments from '$lib/components/wishlist/GiftComments.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// View mode state
	let viewMode = $state<'cards' | 'table'>('cards');
	let selectedMemberId = $state<string | 'all'>('all');
	let selectedEventId = $state<string | 'all'>('all');
	let showDetailModal = $state(false);
	let showEditModal = $state(false);
	let selectedItem = $state<any>(null);

	// Form state for create/edit
	let formData = $state({
		name: '',
		description: '',
		price: '',
		priority: 0,
		image_url: '',
		images: [] as string[], // Multiple image URLs
		links: [] as string[],
		event_ids: [] as string[]
	});

	// UI state for showing/hiding sections
	let showLinksSection = $state(false);
	let showImagesSection = $state(false);
	let isSubmitting = $state(false);
	let togglingItemId = $state<string | null>(null);

	// Computed: filtered items
	let filteredItems = $derived(() => {
		let items = data.items;

		// Filter by member
		if (selectedMemberId !== 'all') {
			items = items.filter((item) => item.owner_id === selectedMemberId);
		}

		// Filter by event
		if (selectedEventId !== 'all') {
			items = items.filter((item) =>
				item.gift_item_events?.some((e: any) => e.event_category_id === selectedEventId)
			);
		}

		return items;
	});

	// Get "Todos" event ID
	let todosEventId = $derived(() => {
		return data.eventCategories.find((e) => e.name === 'Todos')?.id || '';
	});

	// Check if current user purchased this item
	function isPurchasedByMe(itemId: string): boolean {
		return data.myPurchases.some((p) => p.item_id === itemId);
	}

	// Check if current user reserved this item
	function isReservedByMe(itemId: string): boolean {
		return data.myReservations.some((r) => r.item_id === itemId);
	}

	// Get all reservations for an item
	function getReservations(itemId: string): any[] {
		return data.allReservations.filter((r) => r.item_id === itemId);
	}

	// Check if item is owned by current user
	function isMyItem(itemId: string): boolean {
		const item = data.items.find((i) => i.id === itemId);
		return item?.owner_id === data.currentUserId;
	}

	// Get comments for an item
	function getComments(itemId: string): any[] {
		return data.comments.filter((c) => c.item_id === itemId);
	}

	// Open detail modal
	function openDetailModal(item: any) {
		selectedItem = item;
		showDetailModal = true;
	}

	// Check URL params and open modal if item param exists
	onMount(() => {
		const itemId = $page.url.searchParams.get('item');
		if (itemId) {
			const item = data.items.find(i => i.id === itemId);
			if (item) {
				openDetailModal(item);
				// Clean URL after opening modal
				window.history.replaceState({}, '', $page.url.pathname);
			}
		}
	});

	// Open edit modal
	function openEditModal(item?: any) {
		if (item) {
			// Edit existing item
			selectedItem = item;
			const itemLinks = item.links || [];
			const itemImages = item.image_url ? [item.image_url] : [];

			formData = {
				name: item.name,
				description: item.description || '',
				price: item.price?.toString() || '',
				priority: item.priority,
				image_url: item.image_url || '',
				images: itemImages,
				links: itemLinks,
				event_ids: item.gift_item_events?.map((e: any) => e.event_category_id) || [todosEventId()]
			};

			// Show sections if there's data
			showLinksSection = itemLinks.length > 0;
			showImagesSection = itemImages.length > 0;
		} else {
			// Create new item with "Todos" selected by default
			selectedItem = null;
			formData = {
				name: '',
				description: '',
				price: '',
				priority: 0,
				image_url: '',
				images: [],
				links: [],
				event_ids: [todosEventId()]
			};

			// Reset section visibility
			showLinksSection = false;
			showImagesSection = false;
		}
		showEditModal = true;
	}

	// Close modals
	function closeModals() {
		showDetailModal = false;
		showEditModal = false;
		selectedItem = null;
	}

	// Add link field
	function addLinkField() {
		formData.links = [...formData.links, ''];
	}

	// Remove link field
	function removeLinkField(index: number) {
		formData.links = formData.links.filter((_, i) => i !== index);
		if (formData.links.length === 0) {
			showLinksSection = false;
		}
	}

	// Add image field
	function addImageField() {
		formData.images = [...formData.images, ''];
	}

	// Remove image field
	function removeImageField(index: number) {
		formData.images = formData.images.filter((_, i) => i !== index);
		if (formData.images.length === 0) {
			showImagesSection = false;
		}
	}

	// Realtime subscriptions for live updates
	onMount(() => {
		const familyId = $page.params.familyId;
		const supabase = createClient();

		// Subscribe to wishlist changes in this family
		const channel = supabase
			.channel('wishlist-changes')
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'gift_items',
					filter: `family_id=eq.${familyId}`
				},
				() => {
					invalidateAll();
				}
			)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'gift_purchases'
				},
				() => {
					invalidateAll();
				}
			)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'gift_item_events'
				},
				() => {
					invalidateAll();
				}
			)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'gift_reservations'
				},
				() => {
					invalidateAll();
				}
			)
			.subscribe();

		// Cleanup on component unmount
		return () => {
			supabase.removeChannel(channel);
		};
	});

	// Toggle event selection
	function toggleEvent(eventId: string) {
		const todos = todosEventId();
		const isTodos = eventId === todos;

		if (isTodos) {
			// If clicking "Todos", select only "Todos"
			formData.event_ids = [todos];
		} else {
			// If clicking a specific event
			const isSelected = formData.event_ids.includes(eventId);

			if (isSelected) {
				// Deselect this event
				formData.event_ids = formData.event_ids.filter((id) => id !== eventId);

				// If no events selected, select "Todos"
				if (formData.event_ids.length === 0) {
					formData.event_ids = [todos];
				} else {
					// Remove "Todos" if it was selected
					formData.event_ids = formData.event_ids.filter((id) => id !== todos);
				}
			} else {
				// Select this event and remove "Todos"
				formData.event_ids = [...formData.event_ids.filter((id) => id !== todos), eventId];
			}
		}
	}

	// Format price
	function formatPrice(price: number | null): string {
		if (!price) return '-';
		return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(price);
	}

	// Get priority label
	function getPriorityLabel(priority: number): string {
		const labels: Record<number, string> = {
			2: 'Muy Alta',
			1: 'Alta',
			0: 'Normal',
			'-1': 'Baja'
		};
		return labels[priority] || 'Normal';
	}

	// Get priority badge color
	function getPriorityColor(priority: number): string {
		const colors: Record<number, string> = {
			2: 'badge-error',
			1: 'badge-warning',
			0: 'badge-info',
			'-1': 'badge-ghost'
		};
		return colors[priority] || 'badge-info';
	}

	// Prepare form submission
	function prepareFormData(formElement: HTMLFormElement): FormData {
		const submitData = new FormData(formElement);

		// Filter and add only non-empty links
		const nonEmptyLinks = formData.links.filter((link) => link.trim().length > 0);
		submitData.delete('links');
		nonEmptyLinks.forEach((link) => {
			submitData.append('links', link.trim());
		});

		// Use first image as main image_url
		if (formData.images.length > 0 && formData.images[0].trim().length > 0) {
			submitData.set('image_url', formData.images[0].trim());
		}

		return submitData;
	}
</script>

<div class="container mx-auto p-6 max-w-7xl">
	<!-- Header -->
	<div class="mb-6">
		<h1 class="text-3xl font-bold mb-2">🎁 Wishlist</h1>
		<p class="text-base-content/70">
			Gestiona tu lista de deseos y descubre qué quieren tus familiares
		</p>
	</div>

	<!-- Filters & View Controls -->
	<div class="bg-base-200 rounded-lg p-4 mb-6 space-y-4">
		<!-- Top row: View toggle & Add button -->
		<div class="flex items-center justify-between">
			<div class="text-sm font-medium text-base-content/70">Filtros</div>
			<div class="flex gap-2">
				<div class="join">
					<button
						class="join-item btn btn-sm {viewMode === 'cards' ? 'btn-active' : ''}"
						onclick={() => (viewMode = 'cards')}
					>
						🃏 Tarjetas
					</button>
					<button
						class="join-item btn btn-sm {viewMode === 'table' ? 'btn-active' : ''}"
						onclick={() => (viewMode = 'table')}
					>
						📊 Tabla
					</button>
				</div>

				<button class="btn btn-primary btn-sm gap-2" onclick={() => openEditModal()}>
					<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<line x1="12" y1="5" x2="12" y2="19"></line>
						<line x1="5" y1="12" x2="19" y2="12"></line>
					</svg>
					Añadir Regalo
				</button>
			</div>
		</div>

		<!-- Member Filters (Avatar circles) -->
		<div>
			<div class="text-xs font-medium text-base-content/60 mb-2">Miembro</div>
			<div class="flex flex-wrap gap-2">
				<!-- All members option -->
				<button
					type="button"
					class="tooltip tooltip-bottom"
					data-tip="Todos los miembros"
					onclick={() => (selectedMemberId = 'all')}
				>
					<div
						class="avatar placeholder rounded-full {selectedMemberId === 'all' ? 'ring ring-primary ring-offset-2' : 'opacity-60 hover:opacity-100'} transition-all cursor-pointer"
					>
						<div class="bg-neutral text-neutral-content rounded-full w-10">
							<span class="text-xs">👥</span>
						</div>
					</div>
				</button>

				<!-- Individual members -->
				{#each data.members as member}
					{@const isSelected = selectedMemberId === member.user_id}
					<button
						type="button"
						class="tooltip tooltip-bottom"
						data-tip={member.profiles?.display_name || 'Usuario'}
						onclick={() => (selectedMemberId = member.user_id!)}
					>
						<div
							class="avatar placeholder rounded-full {isSelected ? 'ring ring-primary ring-offset-2' : 'opacity-60 hover:opacity-100'} transition-all cursor-pointer"
						>
							<div class="bg-primary text-primary-content rounded-full w-10">
								{#if member.profiles?.avatar_url}
									<img
										src={member.profiles.avatar_url}
										alt={member.profiles.display_name || 'Avatar'}
										referrerpolicy="no-referrer"
										crossorigin="anonymous"
									/>
								{:else}
									<span class="text-xs">
										{(member.profiles?.display_name || 'U').substring(0, 2).toUpperCase()}
									</span>
								{/if}
							</div>
						</div>
					</button>
				{/each}
			</div>
		</div>

		<!-- Event Filters (Chips) -->
		<div>
			<div class="text-xs font-medium text-base-content/60 mb-2">Evento</div>
			<div class="flex flex-wrap gap-2">
				<!-- Individual events -->
				{#each data.eventCategories as event}
					{@const isSelected = selectedEventId === event.id}
					<button
						type="button"
						class="btn btn-sm transition-all hover:scale-105 {isSelected ? 'shadow-md' : 'btn-ghost'}"
						style={isSelected
							? `background-color: ${event.color}; color: white; border-color: ${event.color};`
							: ''}
						onclick={() => {
							if (selectedEventId === event.id) {
								selectedEventId = 'all';
							} else {
								selectedEventId = event.id;
							}
						}}
					>
						<span>{event.icon}</span>
						<span>{event.name}</span>
					</button>
				{/each}
			</div>
		</div>
	</div>

	<!-- Items Display -->
	{#if filteredItems().length === 0}
		<div class="text-center py-12">
			<p class="text-base-content/50 text-lg">No hay regalos en la wishlist</p>
			<p class="text-base-content/40 text-sm mt-2">¡Añade el primero!</p>
		</div>
	{:else if viewMode === 'cards'}
		<!-- Cards View -->
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
			{#each filteredItems() as item (item.id)}
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
									<svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
										<circle cx="12" cy="12" r="3"></circle>
									</svg>
									{reservations.length} {reservations.length === 1 ? 'persona mirando' : 'personas mirando'}
								</div>
							{/if}
						{/if}

						<!-- Actions -->
						<div class="card-actions justify-end mt-2">
							<button class="btn btn-sm btn-ghost" onclick={() => openDetailModal(item)}>
								👁️ Ver
							</button>

							{#if isOwner}
								<button class="btn btn-sm btn-ghost" onclick={() => openEditModal(item)}>
									✏️ Editar
								</button>
							{:else}
								<!-- Toggle purchase button -->
								<form method="POST" action="?/togglePurchase" use:enhance={() => {
									togglingItemId = item.id;
									return async ({ result, update }) => {
										await update();
										togglingItemId = null;
									};
								}}>
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
	{:else}
		<!-- Table View -->
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
					{#each filteredItems() as item (item.id)}
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
										onclick={() => openDetailModal(item)}
										title="Ver detalles"
									>
										👁️
									</button>

									{#if isOwner}
										<button
											class="btn btn-ghost btn-xs"
											onclick={() => openEditModal(item)}
											title="Editar"
										>
											✏️
										</button>
									{:else}
										<form method="POST" action="?/togglePurchase" use:enhance={() => {
											togglingItemId = item.id;
											return async ({ result, update }) => {
												await update();
												togglingItemId = null;
											};
										}}>
											<input type="hidden" name="item_id" value={item.id} />
											<input type="hidden" name="is_purchased" value={(!purchased).toString()} />
											<button type="submit" class="btn btn-xs {purchased ? 'btn-success' : 'btn-outline'}" disabled={togglingItemId === item.id}>
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
</div>

<!-- Detail Modal -->
{#if showDetailModal && selectedItem}
	<div class="modal modal-open">
		<div class="modal-box max-w-5xl w-[95vw] max-h-[95svh]">
			<div class="relative flex gap-2 flex-col md:flex-row">
				<div class="sticky top-4 flex-1 h-fit">
					<div class="flex gap-2 justify-between items-center">
						<h3 class="font-bold text-lg mb-4">{selectedItem.name}</h3>
						<div
							class="avatar placeholder rounded-full"
						>
							<div class="bg-primary text-primary-content rounded-full w-10">
								{#if selectedItem.profiles?.avatar_url}
									<img
										src={selectedItem.profiles.avatar_url}
										alt={selectedItem.profiles.display_name || 'Avatar'}
										referrerpolicy="no-referrer"
										crossorigin="anonymous"
									/>
								{:else}
									<span class="text-xs">
										{(selectedItem.profiles?.display_name || 'U').substring(0, 2).toUpperCase()}
									</span>
								{/if}
							</div>
						</div>
					</div>
		
					{#if selectedItem.image_url}
						<figure class="mb-4">
							<img
								src={selectedItem.image_url}
								alt={selectedItem.name}
								class="w-full rounded-lg max-h-96 object-cover"
								referrerpolicy="no-referrer"
								crossorigin="anonymous"
							/>
						</figure>
					{/if}
		
					<div class="space-y-3">
						<!-- Descripción solo si existe -->
						{#if selectedItem.description && selectedItem.description.trim().length > 0}
							<div>
								<p class="text-base-content/60 mt-1">{selectedItem.description}</p>
							</div>
						{/if}
		
						<div>
							<span class="font-semibold">Precio:</span>
							<span class="text-primary ml-2">
								{selectedItem.price ? formatPrice(selectedItem.price) : 'Desconocido'}
							</span>
						</div>
		
						<div>
							<span class="font-semibold">Prioridad:</span>
							<span class="badge {getPriorityColor(selectedItem.priority)} ml-2">
								{getPriorityLabel(selectedItem.priority)}
							</span>
						</div>
		
						{#if selectedItem.links && selectedItem.links.length > 0}
							<div>
								<span class="font-semibold">Enlaces:</span>
								<ul class="list-disc list-inside mt-1">
									{#each selectedItem.links as link}
										<li>
											<a href={link} target="_blank" rel="noopener noreferrer" class="link link-primary">
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
								{#each selectedItem.gift_item_events || [] as eventLink}
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
							<span class="ml-2">{selectedItem.profiles?.display_name || 'Usuario'}</span>
						</div>
					</div>
		
					<!-- Reservations info (visible to all) -->
					{#if !isMyItem(selectedItem.id)}
						{@const reservations = getReservations(selectedItem.id)}
						{#if reservations.length > 0}
							<div class="mt-4 alert alert-info">
								<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
									<circle cx="12" cy="12" r="3"></circle>
								</svg>
								<div class="text-sm">
									{#if reservations.length === 1}
										<span class="font-semibold">{reservations[0].profiles?.display_name || 'Alguien'}</span> está mirando este regalo
									{:else}
										<span class="font-semibold">{reservations.length} personas</span> están mirando este regalo
									{/if}
								</div>
							</div>
						{/if}
					{/if}
		
					<!-- Actions for purchase/reservation -->
					{#if !isMyItem(selectedItem.id)}
						<div class="mt-6 pt-4 border-t border-base-300">
							<div class="flex gap-2">
								<form method="POST" action="?/toggleReservation" use:enhance={() => {
									togglingItemId = selectedItem.id;
									return async ({ result, update }) => {
										await update();
										togglingItemId = null;
									};
								}} class="flex-1">
									<input type="hidden" name="item_id" value={selectedItem.id} />
									<input type="hidden" name="is_reserved" value={(!isReservedByMe(selectedItem.id)).toString()} />
									<button
										type="submit"
										class="btn w-full whitespace-nowrap {isReservedByMe(selectedItem.id) ? 'btn-info' : 'btn-outline btn-info'}"
										disabled={togglingItemId === selectedItem.id}
									>
										{#if togglingItemId === selectedItem.id}
											<span class="loading loading-spinner loading-sm"></span>
										{:else}
											{isReservedByMe(selectedItem.id) ? '👁️ Lo estoy mirando' : '👀 Yo lo miro'}
										{/if}
									</button>
								</form>
								<form method="POST" action="?/togglePurchase" use:enhance={() => {
									togglingItemId = selectedItem.id;
									return async ({ result, update }) => {
										await update();
										togglingItemId = null;
									};
								}} class="flex-1">
									<input type="hidden" name="item_id" value={selectedItem.id} />
									<input type="hidden" name="is_purchased" value={(!isPurchasedByMe(selectedItem.id)).toString()} />
									<button
										type="submit"
										class="btn w-full whitespace-nowrap {isPurchasedByMe(selectedItem.id) ? 'btn-success' : 'btn-outline btn-success'}"
										disabled={togglingItemId === selectedItem.id}
									>
										{#if togglingItemId === selectedItem.id}
											<span class="loading loading-spinner loading-sm"></span>
										{:else}
											{isPurchasedByMe(selectedItem.id) ? '✅ Ya lo compré' : '🛒 Marcar como comprado'}
										{/if}
									</button>
								</form>
							</div>
						</div>
					{/if}
				</div>

				<!-- Comments Section (only visible to non-owners) -->
				{#if !isMyItem(selectedItem.id)}
					<div class="mt-6 pt-6 border-t md:ml-6 md:pl-6 md:border-l md:mt-0 md:pt-0 md:border-t-0 border-base-300 max-w-125 flex-1">
						<GiftComments
							itemId={selectedItem.id}
							comments={getComments(selectedItem.id)}
							members={data.members as any[]}
							currentUserId={data.currentUserId}
							itemOwnerId={selectedItem.owner_id}
						/>
					</div>
				{/if}
			</div>
			<div class="modal-action">
				<button class="btn" onclick={closeModals}>Cerrar</button>
			</div>
		</div>
		<div class="modal-backdrop" onclick={closeModals}></div>
	</div>
{/if}

<!-- Edit/Create Modal - MODERN DESIGN -->
{#if showEditModal}
	<div class="modal modal-open">
		<div class="modal-box max-w-2xl bg-base-100">
			<!-- Header -->
			<div class="flex items-center justify-between mb-6 pb-4 border-b border-base-300">
				<h3 class="text-2xl font-bold">
					{selectedItem ? '✏️ Editar Regalo' : '✨ Nuevo Regalo'}
				</h3>
				<button type="button" class="btn btn-ghost btn-sm btn-circle" onclick={closeModals}>
					✕
				</button>
			</div>

			<form
				method="POST"
				action={selectedItem ? '?/updateItem' : '?/createItem'}
				use:enhance={({ formElement }) => {
					const submitData = prepareFormData(formElement);
					isSubmitting = true;
					return async ({ result, update }) => {
						isSubmitting = false;
						if (result.type === 'success') {
							closeModals();
							await invalidateAll();
						} else {
							await update();
						}
					};
				}}
			>
				{#if selectedItem}
					<input type="hidden" name="item_id" value={selectedItem.id} />
				{/if}

				<div class="space-y-6">
					<!-- Name & Description -->
					<div class="space-y-4">
						<div>
							<label for="name" class="block text-sm font-medium mb-2">
								Nombre del regalo <span class="text-error">*</span>
							</label>
							<input
								type="text"
								id="name"
								name="name"
								class="input input-bordered w-full focus:input-primary transition-colors"
								bind:value={formData.name}
								placeholder="ej: Nintendo Switch, 4x Calcetines negros..."
								required
							/>
						</div>

						<div>
							<label for="description" class="block text-sm font-medium mb-2">Descripción</label>
							<textarea
								id="description"
								name="description"
								class="textarea textarea-bordered w-full focus:textarea-primary transition-colors"
								rows="3"
								bind:value={formData.description}
								placeholder="Añade detalles opcionales: color, talla, modelo..."
							></textarea>
						</div>
					</div>

					<!-- Price & Priority Grid -->
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div>
							<label for="price" class="block text-sm font-medium mb-2">Precio (€)</label>
							<input
								type="text"
								inputmode="decimal"
								id="price"
								name="price"
								class="input input-bordered w-full focus:input-primary transition-colors"
								bind:value={formData.price}
								placeholder="29.99"
								pattern="[0-9]*\.?[0-9]*"
							/>
						</div>

						<div>
							<label for="priority" class="block text-sm font-medium mb-2">Prioridad</label>
							<select
								id="priority"
								name="priority"
								class="select select-bordered w-full focus:select-primary transition-colors"
								bind:value={formData.priority}
							>
								<option value={2}>🔥 Muy Alta</option>
								<option value={1}>⭐ Alta</option>
								<option value={0}>➖ Normal</option>
								<option value={-1}>⬇️ Baja</option>
							</select>
						</div>
					</div>

					<!-- Events Section -->
					<div class="bg-base-200 rounded-lg p-4">
						<label class="block text-sm font-medium mb-3">Eventos</label>
						<div class="flex flex-wrap gap-2">
							{#each data.eventCategories as event}
								{@const isSelected = formData.event_ids.includes(event.id)}
								<button
									type="button"
									class="btn btn-sm transition-all hover:scale-105 {isSelected ? 'shadow-md' : 'btn-outline'}"
									style={isSelected
										? `background-color: ${event.color}; color: white; border-color: ${event.color};`
										: `color: ${event.color}; border-color: ${event.color};`}
									onclick={() => toggleEvent(event.id)}
								>
									<span class="text-base">{event.icon}</span>
									<span>{event.name}</span>
								</button>
								{#if isSelected}
									<input type="hidden" name="event_ids" value={event.id} />
								{/if}
							{/each}
						</div>
						<p class="text-xs text-base-content/60 mt-2">
							Por defecto "Todos". Selecciona eventos específicos si quieres.
						</p>
					</div>

					<!-- Images Section (Collapsible) -->
					<div class="bg-base-200 rounded-lg p-4">
						{#if !showImagesSection}
							<button
								type="button"
								class="btn btn-ghost btn-sm gap-2"
								onclick={() => {
									showImagesSection = true;
									if (formData.images.length === 0) {
										formData.images = [''];
									}
								}}
							>
								<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
									<circle cx="8.5" cy="8.5" r="1.5"></circle>
									<polyline points="21 15 16 10 5 21"></polyline>
								</svg>
								Añadir imágenes
							</button>
						{:else}
							<div class="space-y-3">
								<div class="flex items-center justify-between">
									<label class="block text-sm font-medium">Imágenes</label>
									<button
										type="button"
										class="btn btn-ghost btn-xs"
										onclick={() => {
											formData.images = [];
											showImagesSection = false;
										}}
									>
										Quitar sección
									</button>
								</div>

								{#each formData.images as image, i}
									<div class="flex gap-2">
										<input
											type="url"
											class="input input-bordered flex-1 input-sm focus:input-primary transition-colors"
											bind:value={formData.images[i]}
											placeholder="https://example.com/imagen.jpg"
										/>
										<button
											type="button"
											class="btn btn-error btn-sm btn-circle btn-outline hover:btn-error"
											onclick={() => removeImageField(i)}
											title="Eliminar"
										>
											<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
												<polyline points="3 6 5 6 21 6"></polyline>
												<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
												<line x1="10" y1="11" x2="10" y2="17"></line>
												<line x1="14" y1="11" x2="14" y2="17"></line>
											</svg>
										</button>
									</div>
								{/each}

								<button type="button" class="btn btn-ghost btn-sm gap-2" onclick={addImageField}>
									<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
										<line x1="12" y1="5" x2="12" y2="19"></line>
										<line x1="5" y1="12" x2="19" y2="12"></line>
									</svg>
									Añadir otra imagen
								</button>
							</div>
						{/if}
					</div>

					<!-- Links Section (Collapsible) -->
					<div class="bg-base-200 rounded-lg p-4">
						{#if !showLinksSection}
							<button
								type="button"
								class="btn btn-ghost btn-sm gap-2"
								onclick={() => {
									showLinksSection = true;
									if (formData.links.length === 0) {
										formData.links = [''];
									}
								}}
							>
								<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
									<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
								</svg>
								Añadir enlaces
							</button>
						{:else}
							<div class="space-y-3">
								<div class="flex items-center justify-between">
									<label class="block text-sm font-medium">Enlaces</label>
									<button
										type="button"
										class="btn btn-ghost btn-xs"
										onclick={() => {
											formData.links = [];
											showLinksSection = false;
										}}
									>
										Quitar sección
									</button>
								</div>

								{#each formData.links as link, i}
									<div class="flex gap-2">
										<input
											type="url"
											name="links"
											class="input input-bordered flex-1 input-sm focus:input-primary transition-colors"
											bind:value={formData.links[i]}
											placeholder="https://amazon.es/producto..."
										/>
										<button
											type="button"
											class="btn btn-error btn-sm btn-circle btn-outline hover:btn-error"
											onclick={() => removeLinkField(i)}
											title="Eliminar"
										>
											<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
												<polyline points="3 6 5 6 21 6"></polyline>
												<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
												<line x1="10" y1="11" x2="10" y2="17"></line>
												<line x1="14" y1="11" x2="14" y2="17"></line>
											</svg>
										</button>
									</div>
								{/each}

								<button type="button" class="btn btn-ghost btn-sm gap-2" onclick={addLinkField}>
									<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
										<line x1="12" y1="5" x2="12" y2="19"></line>
										<line x1="5" y1="12" x2="19" y2="12"></line>
									</svg>
									Añadir otro enlace
								</button>
							</div>
						{/if}
					</div>
				</div>

				<!-- Footer Actions -->
				<div class="flex items-center justify-between mt-8 pt-6 border-t border-base-300">
					<div>
						{#if selectedItem}
							<form
								method="POST"
								action="?/deleteItem"
								use:enhance={() => {
									isSubmitting = true;
									return async ({ result }) => {
										isSubmitting = false;
										if (result.type === 'success') {
											closeModals();
											await invalidateAll();
										}
									};
								}}
							>
								<input type="hidden" name="item_id" value={selectedItem.id} />
								<button type="submit" class="btn btn-error btn-outline gap-2" disabled={isSubmitting}>
									<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
										<polyline points="3 6 5 6 21 6"></polyline>
										<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
										<line x1="10" y1="11" x2="10" y2="17"></line>
										<line x1="14" y1="11" x2="14" y2="17"></line>
									</svg>
									Eliminar
								</button>
							</form>
						{/if}
					</div>

					<div class="flex gap-2">
						<button type="button" class="btn btn-ghost" onclick={closeModals} disabled={isSubmitting}>
							Cancelar
						</button>
						<button type="submit" class="btn btn-primary gap-2" disabled={isSubmitting}>
							{#if isSubmitting}
								<span class="loading loading-spinner loading-sm"></span>
								Guardando...
							{:else}
								<span>{selectedItem ? '💾' : '✨'}</span>
								{selectedItem ? 'Guardar cambios' : 'Crear regalo'}
							{/if}
						</button>
					</div>
				</div>
			</form>
		</div>
		<div class="modal-backdrop" onclick={closeModals}></div>
	</div>
{/if}
