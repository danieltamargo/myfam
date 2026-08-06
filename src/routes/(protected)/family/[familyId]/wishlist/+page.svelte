<script lang="ts">
	import { afterNavigate, invalidateAll, pushState, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { createClient } from '$lib/supabase';
	import type { PageData } from './$types';
	import type { WishlistCommentDto, WishlistItemDto } from '$lib/server/wishlist/presenters';
	import { summarizeWishlistCoordination } from '$lib/wishlist/coordination';
	import { createOwnWishlistExport } from '$lib/wishlist/export';
	import {
		createWishlistRealtimeReconciler,
		type WishlistRealtimePayload,
		type WishlistRealtimeTable
	} from '$lib/wishlist/realtime';

	import WishlistCards from './components/WishlistCards.svelte';
	import WishlistEditModal from './components/WishlistEditModal.svelte';
	import WishlistFilters from './components/WishlistFilters.svelte';
	import WishlistHeader from './components/WishlistHeader.svelte';
	import WishlistItemModal from './components/WishlistItemModal.svelte';
	import WishlistTable from './components/WishlistTable.svelte';

	type FilterName = 'member' | 'category' | 'priority' | 'status';

	let { data }: { data: PageData } = $props();

	const statusFilters = new Set([
		'all',
		'active',
		'fulfilled',
		'archived',
		'available',
		'reserved',
		'purchased'
	]);
	const priorityFilters = new Set(['all', '-1', '0', '1', '2']);
	const queryParams = new SvelteURLSearchParams(page.url.searchParams);
	function validFilter(value: string | null, allowed: ReadonlySet<string>): string {
		return value && allowed.has(value) ? value : 'all';
	}

	function initialMemberFilter(): string {
		return validFilter(
			page.url.searchParams.get('member'),
			new Set(data.members.map((member) => member.user_id))
		);
	}

	function initialCategoryFilter(): string {
		return validFilter(
			page.url.searchParams.get('category'),
			new Set(data.eventCategories.map((category) => category.id))
		);
	}

	let viewMode = $state<'cards' | 'table'>('cards');
	let selectedMemberId = $state(initialMemberFilter());
	let selectedCategoryId = $state(initialCategoryFilter());
	let selectedPriority = $state(
		validFilter(page.url.searchParams.get('priority'), priorityFilters)
	);
	let selectedStatus = $state(validFilter(page.url.searchParams.get('status'), statusFilters));
	let detailItemId = $state<string | null>(null);
	let showEditModal = $state(false);
	let editItem = $state<WishlistItemDto | null>(null);

	const detailItem = $derived(
		detailItemId ? (data.items.find((item) => item.id === detailItemId) ?? null) : null
	);
	const todosEventId = $derived(
		data.eventCategories.find((category) => category.name === 'Todos')?.id ?? ''
	);

	function getCoordination(item: WishlistItemDto) {
		return summarizeWishlistCoordination(
			item.id,
			item.desired_quantity,
			data.currentUserId,
			data.allReservations,
			data.allPurchases
		);
	}

	function getReservationNames(itemId: string): string[] {
		return data.allReservations
			.filter((reservation) => reservation.item_id === itemId)
			.map((reservation) => reservation.profiles.display_name);
	}

	function isMyItem(itemId: string): boolean {
		return data.items.some((item) => item.id === itemId && item.owner_id === data.currentUserId);
	}

	function getComments(itemId: string): WishlistCommentDto[] {
		return data.comments.filter((comment) => comment.item_id === itemId);
	}

	const filteredItems = $derived.by(() => {
		return data.items.filter((item) => {
			if (selectedMemberId !== 'all' && item.owner_id !== selectedMemberId) return false;
			if (
				selectedCategoryId !== 'all' &&
				!item.gift_item_events.some((event) => event.event_category_id === selectedCategoryId)
			)
				return false;
			if (selectedPriority !== 'all' && item.priority !== Number(selectedPriority)) return false;
			if (selectedStatus === 'all') return true;
			if (['active', 'fulfilled', 'archived'].includes(selectedStatus)) {
				return item.status === selectedStatus;
			}

			const coordination = getCoordination(item);
			if (selectedStatus === 'available') return coordination.remainingQuantity > 0;
			if (selectedStatus === 'reserved') return coordination.reservedQuantity > 0;
			return coordination.purchasedQuantity > 0;
		});
	});

	function pathWithQuery(params: URLSearchParams): string {
		const query = params.toString();
		return `${page.url.pathname}${query ? `?${query}` : ''}`;
	}

	function updateQuery(
		changes: Partial<Record<FilterName | 'item', string | null>>,
		replaceHistory = true
	): void {
		for (const [name, value] of Object.entries(changes)) {
			if (!value || value === 'all') queryParams.delete(name);
			else queryParams.set(name, value);
		}
		const nextPath = pathWithQuery(queryParams) as `/family/${string}/wishlist`;
		if (replaceHistory) replaceState(resolve(nextPath), page.state);
		else pushState(resolve(nextPath), page.state);
	}

	function changeFilter(name: FilterName, value: string): void {
		if (name === 'member') selectedMemberId = value;
		if (name === 'category') selectedCategoryId = value;
		if (name === 'priority') selectedPriority = value;
		if (name === 'status') selectedStatus = value;
		updateQuery({ [name]: value });
	}

	function clearFilters(): void {
		selectedMemberId = 'all';
		selectedCategoryId = 'all';
		selectedPriority = 'all';
		selectedStatus = 'all';
		updateQuery({ member: null, category: null, priority: null, status: null });
	}

	function syncNavigation(url: URL): void {
		for (const name of [...queryParams.keys()]) queryParams.delete(name);
		url.searchParams.forEach((value, name) => queryParams.set(name, value));
		selectedMemberId = validFilter(
			url.searchParams.get('member'),
			new Set(data.members.map((member) => member.user_id))
		);
		selectedCategoryId = validFilter(
			url.searchParams.get('category'),
			new Set(data.eventCategories.map((category) => category.id))
		);
		selectedPriority = validFilter(url.searchParams.get('priority'), priorityFilters);
		selectedStatus = validFilter(url.searchParams.get('status'), statusFilters);

		const requestedItemId = url.searchParams.get('item');
		detailItemId =
			requestedItemId && data.items.some((item) => item.id === requestedItemId)
				? requestedItemId
				: null;
	}

	afterNavigate(({ to }) => {
		if (to) syncNavigation(to.url);
	});

	function openDetailModal(item: WishlistItemDto): void {
		detailItemId = item.id;
		updateQuery({ item: item.id }, false);
	}

	function closeDetailModal(): void {
		detailItemId = null;
		updateQuery({ item: null });
	}

	function openEditModal(item?: WishlistItemDto): void {
		editItem = item ?? null;
		showEditModal = true;
	}

	function closeEditModal(): void {
		showEditModal = false;
		editItem = null;
	}

	function exportOwnWishlist(): void {
		const familyId = page.params.familyId;
		if (!familyId) return;
		const exported = createOwnWishlistExport(data.items, data.currentUserId, familyId);
		const blobUrl = URL.createObjectURL(
			new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json;charset=utf-8' })
		);
		const link = document.createElement('a');
		link.href = blobUrl;
		link.download = `myfamily-wishlist-${page.params.familyId}.json`;
		link.click();
		URL.revokeObjectURL(blobUrl);
	}

	function formatPrice(price: number | null, currency: string): string {
		if (price === null) return 'Sin precio';
		return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(price);
	}

	function getPriorityLabel(priority: number): string {
		return (
			({ 2: 'Muy alta', 1: 'Alta', 0: 'Normal', '-1': 'Baja' } as Record<number, string>)[
				priority
			] ?? 'Normal'
		);
	}

	function getPriorityColor(priority: number): string {
		return (
			(
				{ 2: 'badge-error', 1: 'badge-warning', 0: 'badge-info', '-1': 'badge-ghost' } as Record<
					number,
					string
				>
			)[priority] ?? 'badge-info'
		);
	}

	onMount(() => {
		const familyId: string = page.params.familyId ?? '';
		if (!familyId) return;
		const supabase = createClient();
		const realtime = createWishlistRealtimeReconciler(
			data.items.map((item) => ({ id: item.id, version: item.version }))
		);
		let refreshTimer: ReturnType<typeof setTimeout> | undefined;

		function scheduleRefresh(): void {
			if (refreshTimer) return;
			refreshTimer = setTimeout(async () => {
				refreshTimer = undefined;
				await invalidateAll();
				realtime.sync(data.items.map((item) => ({ id: item.id, version: item.version })));
			}, 75);
		}

		function reconcile(table: WishlistRealtimeTable, payload: WishlistRealtimePayload): void {
			const visibleItemIds = new Set(data.items.map((item) => item.id));
			if (realtime.shouldRefresh(table, payload, familyId, visibleItemIds)) scheduleRefresh();
		}

		const channel = supabase
			.channel(`wishlist:${familyId}`)
			.on(
				'postgres_changes',
				{ event: '*', schema: 'public', table: 'gift_items', filter: `family_id=eq.${familyId}` },
				(payload) => reconcile('gift_items', payload as WishlistRealtimePayload)
			)
			.on(
				'postgres_changes',
				{ event: '*', schema: 'public', table: 'gift_purchases' },
				(payload) => reconcile('gift_purchases', payload as WishlistRealtimePayload)
			)
			.on(
				'postgres_changes',
				{ event: '*', schema: 'public', table: 'gift_reservations' },
				(payload) => reconcile('gift_reservations', payload as WishlistRealtimePayload)
			)
			.on(
				'postgres_changes',
				{ event: '*', schema: 'public', table: 'gift_item_events' },
				(payload) => reconcile('gift_item_events', payload as WishlistRealtimePayload)
			)
			.on(
				'postgres_changes',
				{ event: '*', schema: 'public', table: 'gift_item_comments' },
				(payload) => reconcile('gift_item_comments', payload as WishlistRealtimePayload)
			)
			.subscribe();

		return () => {
			if (refreshTimer) clearTimeout(refreshTimer);
			void supabase.removeChannel(channel);
		};
	});
</script>

<div class="container mx-auto max-w-7xl">
	<WishlistHeader bind:viewMode onAddGift={() => openEditModal()} onExport={exportOwnWishlist} />

	<div class="flex flex-col gap-6 md:flex-row">
		<WishlistFilters
			members={data.members}
			eventCategories={data.eventCategories}
			{selectedMemberId}
			{selectedCategoryId}
			{selectedPriority}
			{selectedStatus}
			onChange={changeFilter}
			onClear={clearFilters}
		/>

		<main class="min-w-0 flex-1" aria-label="Regalos de la wishlist">
			<p class="mb-3 text-sm text-base-content/60" aria-live="polite">
				{filteredItems.length}
				{filteredItems.length === 1 ? 'regalo' : 'regalos'}
			</p>
			{#if viewMode === 'cards'}
				<WishlistCards
					items={filteredItems}
					{isMyItem}
					{getCoordination}
					{getReservationNames}
					{getPriorityLabel}
					{getPriorityColor}
					{formatPrice}
					onOpenDetail={openDetailModal}
					onOpenEdit={openEditModal}
				/>
			{:else}
				<WishlistTable
					items={filteredItems}
					{isMyItem}
					{getCoordination}
					{getReservationNames}
					{getPriorityLabel}
					{getPriorityColor}
					{formatPrice}
					onOpenDetail={openDetailModal}
					onOpenEdit={openEditModal}
				/>
			{/if}
		</main>
	</div>
</div>

{#if detailItem}
	<WishlistItemModal
		item={detailItem}
		members={data.members}
		currentUserId={data.currentUserId}
		{isMyItem}
		{getCoordination}
		{getReservationNames}
		{getComments}
		onClose={closeDetailModal}
	/>
{/if}

{#if showEditModal}
	<WishlistEditModal
		item={editItem}
		eventCategories={data.eventCategories}
		{todosEventId}
		onClose={closeEditModal}
	/>
{/if}
