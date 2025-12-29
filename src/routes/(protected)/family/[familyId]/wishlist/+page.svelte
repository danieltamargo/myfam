<script lang="ts">
	import { onMount } from 'svelte';
	import { createClient } from '$lib/supabase';
	import { page } from '$app/stores';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';

	// Import components
	import WishlistHeader from './components/WishlistHeader.svelte';
	import WishlistFilters from './components/WishlistFilters.svelte';
	import WishlistCards from './components/WishlistCards.svelte';
	import WishlistTable from './components/WishlistTable.svelte';
	import WishlistItemModal from './components/WishlistItemModal.svelte';
	import WishlistEditModal from './components/WishlistEditModal.svelte';

	let { data }: { data: PageData } = $props();

	// View mode state
	let viewMode = $state<'cards' | 'table'>('cards');
	let selectedMemberId = $state<string | 'all'>('all');
	let selectedEventId = $state<string | 'all'>('all');
	let selectedPurchaseStatus = $state<'all' | 'purchased' | 'not_purchased'>('all');
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
		images: [] as string[],
		links: [] as string[],
		event_ids: [] as string[]
	});

	// UI state for showing/hiding sections
	let showLinksSection = $state(false);
	let showImagesSection = $state(false);
	let isSubmitting = $state(false);

	// Check if item has any purchases
	function isPurchased(itemId: string): boolean {
		return data.allPurchases?.some((p) => p.item_id === itemId) || false;
	}

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

		// Filter by purchase status
		if (selectedPurchaseStatus !== 'all') {
			items = items.filter((item) => {
				const purchased = isPurchased(item.id);
				return selectedPurchaseStatus === 'purchased' ? purchased : !purchased;
			});
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
			const item = data.items.find((i) => i.id === itemId);
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
				event_ids:
					item.gift_item_events?.map((e: any) => e.event_category_id) || [todosEventId()]
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

<div class="container mx-auto max-w-7xl">
	<!-- Header -->
	<WishlistHeader bind:viewMode onAddGift={() => openEditModal()} />

	<!-- Main Layout: Sidebar (tablet+) + Content -->
	<div class="flex flex-col md:flex-row gap-6">
		<!-- Filters Sidebar -->
		<WishlistFilters
			members={data.members}
			eventCategories={data.eventCategories}
			bind:selectedMemberId
			bind:selectedEventId
			bind:selectedPurchaseStatus
		/>

		<!-- Content Area -->
		<div class="flex-1 min-w-0">
			{#if viewMode === 'cards'}
				<WishlistCards
					items={filteredItems()}
					currentUserId={data.currentUserId}
					{isMyItem}
					{isPurchased}
					{isPurchasedByMe}
					{getReservations}
					{getPriorityLabel}
					{getPriorityColor}
					{formatPrice}
					onOpenDetail={openDetailModal}
					onOpenEdit={openEditModal}
				/>
			{:else}
				<WishlistTable
					items={filteredItems()}
					currentUserId={data.currentUserId}
					{isMyItem}
					{isPurchased}
					{isPurchasedByMe}
					{getPriorityLabel}
					{getPriorityColor}
					{formatPrice}
					onOpenDetail={openDetailModal}
					onOpenEdit={openEditModal}
				/>
			{/if}
		</div>
	</div>
</div>

<!-- Detail Modal -->
{#if showDetailModal}
	<WishlistItemModal
		item={selectedItem}
		members={data.members}
		currentUserId={data.currentUserId}
		{isMyItem}
		{isPurchasedByMe}
		{isReservedByMe}
		{getReservations}
		{getComments}
		{getPriorityLabel}
		{getPriorityColor}
		{formatPrice}
		onClose={closeModals}
	/>
{/if}

<!-- Edit/Create Modal -->
{#if showEditModal}
	<WishlistEditModal
		item={selectedItem}
		eventCategories={data.eventCategories}
		todosEventId={todosEventId()}
		bind:formData
		bind:showLinksSection
		bind:showImagesSection
		bind:isSubmitting
		{toggleEvent}
		{addLinkField}
		{removeLinkField}
		{addImageField}
		{removeImageField}
		{prepareFormData}
		onClose={closeModals}
	/>
{/if}
