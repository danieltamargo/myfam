<script lang="ts">
	import { onMount } from 'svelte';
	import { createClient } from '$lib/supabase';
	import { page } from '$app/stores';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import type {
		WishlistCommentDto,
		WishlistItemDto,
		WishlistReservationDto
	} from '$lib/server/wishlist/presenters';

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
	let selectedItem = $state<WishlistItemDto | null>(null);

	// Check if item has any purchases
	function isPurchased(itemId: string): boolean {
		return data.allPurchases?.some((p) => p.item_id === itemId) || false;
	}

	// Computed: filtered items
	let filteredItems = $derived.by(() => {
		let items = data.items;

		// Filter by member
		if (selectedMemberId !== 'all') {
			items = items.filter((item) => item.owner_id === selectedMemberId);
		}

		// Filter by event
		if (selectedEventId !== 'all') {
			items = items.filter((item) =>
				item.gift_item_events.some((event) => event.event_category_id === selectedEventId)
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
	let todosEventId = $derived.by(() => {
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
	function getReservations(itemId: string): WishlistReservationDto[] {
		return data.allReservations.filter((r) => r.item_id === itemId);
	}

	// Check if item is owned by current user
	function isMyItem(itemId: string): boolean {
		const item = data.items.find((i) => i.id === itemId);
		return item?.owner_id === data.currentUserId;
	}

	// Get comments for an item
	function getComments(itemId: string): WishlistCommentDto[] {
		return data.comments.filter((c) => c.item_id === itemId);
	}

	// Open detail modal
	function openDetailModal(item: WishlistItemDto) {
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
	function openEditModal(item?: WishlistItemDto) {
		selectedItem = item ?? null;
		showEditModal = true;
	}

	// Close modals
	function closeModals() {
		showDetailModal = false;
		showEditModal = false;
		selectedItem = null;
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
</script>

<div class="container mx-auto max-w-7xl">
	<!-- Header -->
	<WishlistHeader bind:viewMode onAddGift={() => openEditModal()} />

	<!-- Main Layout: Sidebar (tablet+) + Content -->
	<div class="flex flex-col gap-6 md:flex-row">
		<!-- Filters Sidebar -->
		<WishlistFilters
			members={data.members}
			eventCategories={data.eventCategories}
			bind:selectedMemberId
			bind:selectedEventId
			bind:selectedPurchaseStatus
		/>

		<!-- Content Area -->
		<div class="min-w-0 flex-1">
			{#if viewMode === 'cards'}
				<WishlistCards
					items={filteredItems}
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
					items={filteredItems}
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
		onClose={closeModals}
	/>
{/if}

<!-- Edit/Create Modal -->
{#if showEditModal}
	<WishlistEditModal
		item={selectedItem}
		eventCategories={data.eventCategories}
		{todosEventId}
		onClose={closeModals}
	/>
{/if}
