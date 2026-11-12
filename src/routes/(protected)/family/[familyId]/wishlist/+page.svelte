<script lang="ts">
	import { afterNavigate, goto, invalidateAll, pushState, replaceState } from '$app/navigation';
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { resolve } from '$app/paths';
	import { navigating, page } from '$app/state';
	import { onMount } from 'svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { createClient } from '$lib/supabase';
	import type { PageProps } from './$types';
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

	let { data, form }: PageProps = $props();
	const showHistory = $derived(data.showHistory);
	let historyBusy = $state(false);
	let historyError = $state('');
	let refreshError = $state('');
	let spoilersDialog: HTMLDialogElement;
	let spoilersFamilyId = $state<string | null>(null);
	let purchasedItemIds = $state<string[]>([]);
	let spoilersBusy = $state(false);
	let spoilersError = $state('');
	const spoilersVisible = $derived(spoilersFamilyId === page.params.familyId);
	const purchasedGifts = $derived(
		data.items.filter((item) => item.status === 'active' && purchasedItemIds.includes(item.id))
	);

	const enhancePurchased: SubmitFunction = ({ cancel }) => {
		if (spoilersBusy) {
			cancel();
			return;
		}
		const familyId = page.params.familyId;
		spoilersBusy = true;
		spoilersError = '';
		return async ({ result }) => {
			spoilersBusy = false;
			if (familyId !== page.params.familyId || !spoilersDialog?.open) return;
			if (result.type === 'success' && Array.isArray(result.data?.purchasedItemIds)) {
				purchasedItemIds = result.data.purchasedItemIds;
				spoilersFamilyId = familyId ?? null;
				spoilersDialog.close();
			} else {
				spoilersError = 'No se pudieron mostrar los regalos comprados. Inténtalo de nuevo.';
			}
		};
	};
	const enhanceReveal: SubmitFunction = ({ cancel }) => {
		if (historyBusy) {
			cancel();
			return;
		}
		historyBusy = true;
		historyError = '';
		return async ({ update }) => {
			try {
				await update();
			} catch {
				historyError = 'No se pudo revelar el comprador. Inténtalo de nuevo.';
			} finally {
				historyBusy = false;
			}
		};
	};

	const statusFilters = new Set([
		'all',
		'active',
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
			if (['active', 'archived'].includes(selectedStatus)) {
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

	function historyHref(pageNumber: number): `/family/${string}/wishlist` {
		const params = new SvelteURLSearchParams(page.url.searchParams);
		params.delete('item');
		params.set('view', 'history');
		params.set('history_page', String(pageNumber));
		return pathWithQuery(params) as `/family/${string}/wishlist`;
	}

	function changeHistoryView(history: boolean) {
		const params = new SvelteURLSearchParams(page.url.searchParams);
		params.delete('item');
		params.delete('history_page');
		if (history) params.set('view', 'history');
		else params.delete('view');
		return goto(resolve(pathWithQuery(params) as `/family/${string}/wishlist`));
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
		let refreshing = false;
		let active = true;

		function scheduleRefresh(): void {
			if (!active || refreshTimer || refreshing) return;
			refreshTimer = setTimeout(async () => {
				refreshTimer = undefined;
				if (!active) return;
				if (navigating.to) {
					scheduleRefresh();
					return;
				}
				refreshing = true;
				try {
					await invalidateAll();
					realtime.sync(data.items.map((item) => ({ id: item.id, version: item.version })));
					refreshError = '';
				} catch {
					refreshError = 'No se pudo actualizar la wishlist. Recarga la página.';
				} finally {
					refreshing = false;
				}
			}, 75);
		}

		function refreshVisibleWishlist() {
			if (document.visibilityState === 'visible') scheduleRefresh();
		}
		// RLS may suppress updates when a received gift becomes invisible to this viewer.
		const refreshInterval = setInterval(refreshVisibleWishlist, 30_000);
		document.addEventListener('visibilitychange', refreshVisibleWishlist);
		window.addEventListener('focus', refreshVisibleWishlist);

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
			);
		void supabase.realtime
			.setAuth()
			.then(() => {
				if (!active) return;
				channel.subscribe((status) => {
					if (status === 'SUBSCRIBED') scheduleRefresh();
					else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')
						refreshError = 'No se pudo conectar la wishlist. Recarga la página.';
				});
			})
			.catch(() => {
				if (active) refreshError = 'No se pudo conectar la wishlist. Recarga la página.';
			});

		return () => {
			active = false;
			if (refreshTimer) clearTimeout(refreshTimer);
			clearInterval(refreshInterval);
			document.removeEventListener('visibilitychange', refreshVisibleWishlist);
			window.removeEventListener('focus', refreshVisibleWishlist);
			void supabase.removeChannel(channel);
		};
	});
</script>

<div class="container mx-auto max-w-7xl">
	<WishlistHeader bind:viewMode onAddGift={() => openEditModal()} onExport={exportOwnWishlist} />
	<div class="join mb-4" aria-label="Vista de wishlist">
		<button
			class={['btn join-item btn-sm', { 'btn-active': !showHistory }]}
			aria-pressed={!showHistory}
			onclick={() => changeHistoryView(false)}>Listas de deseos</button
		>
		<button
			class={['btn join-item btn-sm', { 'btn-active': showHistory }]}
			aria-pressed={showHistory}
			onclick={() => changeHistoryView(true)}>Mi histórico</button
		>
	</div>
	{#if form?.error || historyError || refreshError}
		<p class="mb-4 alert alert-error" role="alert">{historyError || refreshError || form?.error}</p>
	{:else if form?.message}
		<p class="mb-4 alert alert-success" role="status">{form.message}</p>
	{/if}

	{#if showHistory}
		<section aria-label="Regalos recibidos" class="space-y-4">
			<h2 class="text-xl font-bold">Mis regalos recibidos</h2>
			<p class="text-sm text-base-content/65">
				Solo tú puedes ver este histórico. El comprador permanece oculto hasta que decidas
				revelarlo.
			</p>
			{#each data.receivedItems as item (item.id)}
				<article class="rounded-box border border-base-300 p-4">
					<h3 class="font-semibold">{item.name}</h3>
					{#if item.description}<p class="mt-1 text-sm">{item.description}</p>{/if}
					{#if form?.revealedItemId === item.id && form.revealedBuyers}
						<div class="mt-3" role="status">
							{#each form.revealedBuyers as buyer (buyer.buyer_id)}
								<p>
									{buyer.buyer_id ? `Comprado por ${buyer.display_name}` : buyer.display_name} · {buyer.quantity}
									{buyer.quantity === 1 ? 'unidad' : 'unidades'}
								</p>
							{:else}<p>No consta quién compró este regalo.</p>{/each}
						</div>
					{:else}
						<form
							method="POST"
							action={`?view=history&history_page=${data.historyPage}&/revealBuyers`}
							use:enhance={enhanceReveal}
							class="mt-3"
						>
							<input type="hidden" name="item_id" value={item.id} />
							<button type="submit" class="btn btn-outline btn-sm" disabled={historyBusy}
								>Revelar comprador (spoiler)</button
							>
						</form>
					{/if}
				</article>
			{:else}
				<p class="rounded-box border border-dashed border-base-300 p-6" role="status">
					Aún no has marcado regalos como recibidos.
				</p>
			{/each}
			<nav class="flex items-center gap-3" aria-label="Páginas del histórico">
				{#if data.historyPage > 1}
					<a class="btn btn-outline btn-sm" href={resolve(historyHref(data.historyPage - 1))}
						>Anterior</a
					>
				{/if}
				<span class="text-sm">Página {data.historyPage}</span>
				{#if data.historyHasNext}
					<a class="btn btn-outline btn-sm" href={resolve(historyHref(data.historyPage + 1))}
						>Siguiente</a
					>
				{/if}
			</nav>
		</section>
	{:else}
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
				{#if spoilersVisible}
					<section
						class="mb-4 rounded-box border border-success/40 p-4"
						aria-label="Mis regalos comprados"
					>
						<div class="flex flex-wrap items-center justify-between gap-2">
							<h2 class="font-semibold">Mis regalos comprados</h2>
							<button
								type="button"
								class="btn btn-ghost btn-sm"
								onclick={() => {
									spoilersFamilyId = null;
									purchasedItemIds = [];
								}}>Ocultar spoilers</button
							>
						</div>
						{#if purchasedGifts.length}
							<ul class="mt-2 space-y-2">
								{#each purchasedGifts as gift (gift.id)}
									<li>
										<button
											type="button"
											class="btn h-auto min-h-8 whitespace-normal btn-outline btn-sm btn-success"
											onclick={() => openDetailModal(gift)}
										>
											{gift.name}
										</button>
									</li>
								{/each}
							</ul>
						{:else}
							<p class="text-sm">Todavía no hay compras registradas en tus regalos activos.</p>
						{/if}
					</section>
				{:else}
					<button
						type="button"
						class="btn mb-4 btn-outline btn-sm"
						onclick={() => {
							spoilersError = '';
							spoilersDialog.showModal();
						}}>Mostrar mis regalos comprados</button
					>
				{/if}
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
	{/if}
</div>

<dialog class="modal" bind:this={spoilersDialog} aria-labelledby="wishlist-spoilers-title">
	<div class="modal-box">
		<h2 id="wishlist-spoilers-title" class="text-lg font-bold">¿Mostrar regalos comprados?</h2>
		<p class="mt-2">
			Verás cuáles de tus regalos se han comprado. Así podrás marcarlos como recibidos cuando te
			lleguen. La identidad de quien los compró seguirá oculta.
		</p>
		{#if spoilersError}<p class="mt-2 text-error" role="alert">{spoilersError}</p>{/if}
		<div class="modal-action">
			<button type="button" class="btn" onclick={() => spoilersDialog.close()}>Cancelar</button>
			<form method="POST" action="?/revealPurchased" use:enhance={enhancePurchased}>
				<button type="submit" class="btn btn-primary" disabled={spoilersBusy}
					>Mostrar regalos comprados</button
				>
			</form>
		</div>
	</div>
</dialog>

{#if detailItem}
	<WishlistItemModal
		item={detailItem}
		members={data.members}
		currentUserId={data.currentUserId}
		{isMyItem}
		{getCoordination}
		{getReservationNames}
		{getComments}
		canReceive={spoilersVisible && purchasedItemIds.includes(detailItem.id)}
		onClose={closeDetailModal}
	/>
{/if}

{#if showEditModal}
	<WishlistEditModal
		item={editItem}
		calendarEvents={data.calendarEvents}
		eventCategories={data.eventCategories}
		{todosEventId}
		onClose={closeEditModal}
	/>
{/if}
