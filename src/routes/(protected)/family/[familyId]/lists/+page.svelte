<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { createClient } from '$lib/supabase';
	import type { PageProps } from './$types';
	import MemberRadioFilter from '$lib/components/ui/MemberRadioFilter.svelte';
	import {
		LIST_TYPES,
		LIST_TYPE_LABELS,
		itemEmoji,
		suggestListItems,
		suggestListTemplates,
		type ListType
	} from '$lib/lists/suggestions';

	let { data, form }: PageProps = $props();
	let showCreate = $state(false);
	let visibility = $state('family');
	let listType = $state<ListType>('shopping');
	let sourceListId = $state('');
	let listTitle = $state('');
	let itemTitle = $state('');
	let itemQuantity = $state(1);
	let itemUnit = $state('');
	const templates = $derived(suggestListTemplates(data.history, listType));
	const selectedTemplate = $derived(templates.find((list) => list.id === sourceListId));
	const suggestions = $derived(
		data.selectedList
			? suggestListItems(data.history, data.selectedList, data.items, itemTitle)
			: []
	);
	function selectTemplate(event: Event) {
		sourceListId = (event.currentTarget as HTMLSelectElement).value;
		const source = templates.find((list) => list.id === sourceListId);
		if (!source) return;
		listTitle = source.title;
		if (source.visibility !== 'family') visibility = 'private';
	}
	let completedBy = $state('');
	let ready = $state(false);
	type ListItem = PageProps['data']['items'][number];
	let busy = $state(false);
	let refreshAfterMutation = false;
	let viewMode = $state<'list' | 'recent'>('list');
	let optimisticCompletion = $state<{
		itemId: string;
		listId: string;
		completed: boolean;
		time: string;
	} | null>(null);
	let lastAction = $state<{
		itemId: string;
		listId: string;
		version: number;
		completed: boolean;
		title: string;
	} | null>(null);
	let localItems = $derived<ListItem[]>(
		data.items.map((item) =>
			optimisticCompletion?.listId === data.selectedListId &&
			optimisticCompletion.itemId === item.id
				? {
						...item,
						completed_at: optimisticCompletion.completed ? optimisticCompletion.time : null
					}
				: item
		)
	);
	const undoAction = $derived(lastAction?.listId === data.selectedListId ? lastAction : null);
	let syncMessage = $state('Conectando…');
	const supabase = createClient();

	onMount(() => {
		ready = true;
		const channel = supabase
			.channel(`family-lists:${data.familyId}`)
			.on(
				'postgres_changes',
				{ event: '*', schema: 'public', table: 'family_list_items' },
				refreshItems
			);
		let active = true;
		void supabase.realtime
			.setAuth()
			.then(() => {
				if (!active) return;
				channel.subscribe((status) => {
					if (status === 'SUBSCRIBED') {
						void refreshItems();
					} else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
						syncMessage = 'Sin conexión en tiempo real. Reconectando…';
					}
				});
			})
			.catch(() => {
				if (active) syncMessage = 'No se pudo conectar la lista. Recarga la página.';
			});
		return () => {
			active = false;
			supabase.removeChannel(channel);
		};
	});

	async function refreshItems() {
		if (busy) {
			refreshAfterMutation = true;
			return;
		}
		syncMessage = 'Actualizando…';
		try {
			await invalidateAll();
			if (!busy) syncMessage = 'Sincronizada';
		} catch {
			syncMessage = 'No se pudo actualizar la lista. Recarga la página.';
		}
	}

	const pendingItems = $derived(localItems.filter((item) => !item.completed_at));
	const completedItems = $derived(
		localItems
			.filter((item) => item.completed_at && (!completedBy || item.completed_by === completedBy))
			.sort(
				(a, b) =>
					(b.completed_at ?? '').localeCompare(a.completed_at ?? '') || a.id.localeCompare(b.id)
			)
	);
	const completion = $derived(
		localItems.length === 0
			? 0
			: Math.round(
					(localItems.filter((item) => item.completed_at).length / localItems.length) * 100
				)
	);

	async function toggleItem(item: ListItem, undo = false) {
		if (busy || !data.selectedList?.canEdit) return;
		const action = undo ? undoAction : null;
		if (undo && !action) return;
		let refreshInBackground = false;
		busy = true;
		const completing = action ? action.completed : !item.completed_at;
		optimisticCompletion = {
			itemId: item.id,
			listId: item.list_id,
			completed: completing,
			time: new Date().toISOString()
		};
		syncMessage = 'Guardando…';
		try {
			const { data: nextVersion, error } = await supabase.rpc('set_family_list_item_completed', {
				p_item_id: item.id,
				p_version: action?.version ?? item.version,
				p_completed: completing
			});
			if (error) {
				refreshInBackground = true;
				lastAction = null;
				syncMessage =
					error.code === '40001' || error.code === 'PT409'
						? 'Otra persona cambió el artículo. Se han cargado sus cambios.'
						: 'No se pudo guardar el cambio. Inténtalo de nuevo.';
			} else {
				lastAction = undo
					? null
					: {
							itemId: item.id,
							listId: item.list_id,
							version: nextVersion,
							completed: Boolean(item.completed_at),
							title: item.title
						};
				syncMessage = undo ? 'Último marcado deshecho.' : 'Sincronizada';
			}
			if (!refreshInBackground) await invalidateAll();
		} catch {
			refreshInBackground = true;
			lastAction = null;
			syncMessage = 'No se pudo confirmar el cambio. Recarga la lista antes de continuar.';
		} finally {
			optimisticCompletion = null;
			if (refreshInBackground) {
				refreshAfterMutation = false;
				busy = false;
				void invalidateAll().catch(() => {
					if (!busy) syncMessage = 'No se pudo actualizar la lista. Recarga la página.';
				});
			} else {
				await finishMutation();
			}
		}
	}

	function undoLastAction() {
		const item = localItems.find((candidate) => candidate.id === undoAction?.itemId);
		if (item) return toggleItem(item, true);
		lastAction = null;
		syncMessage = 'El artículo ya no está disponible para deshacer.';
	}

	async function finishMutation() {
		busy = false;
		if (!refreshAfterMutation) return;
		refreshAfterMutation = false;
		try {
			await invalidateAll();
		} catch {
			syncMessage = 'No se pudo actualizar la lista. Recarga la página.';
		}
	}

	const enhanceMutation: SubmitFunction = ({ cancel, action }) => {
		if (busy) {
			cancel();
			return;
		}
		busy = true;
		lastAction = null;
		return async ({ update, result }) => {
			try {
				await update();
				if (result.type === 'success' && action.search === '?/addItem') {
					itemTitle = '';
					itemQuantity = 1;
					itemUnit = '';
				}
				if (result.type === 'success' && action.search === '?/createList') {
					showCreate = false;
					sourceListId = '';
					listTitle = '';
					visibility = 'family';
				}
			} catch {
				syncMessage = 'No se pudo confirmar el cambio. Recarga la lista.';
			} finally {
				await finishMutation();
			}
		};
	};

	function visibilityLabel(value: string): string {
		return (
			{
				family: 'Toda la familia',
				private: 'Privada',
				selected_members: 'Personas seleccionadas'
			}[value] ?? value
		);
	}

	function quantityLabel(quantity: number, unit: string | null): string {
		const formatted = Number(quantity).toLocaleString('es-ES', { maximumFractionDigits: 3 });
		return `${formatted}${unit ? ` ${unit}` : ''}`;
	}
</script>

<svelte:head>
	<title>Listas compartidas · MyFamily</title>
	<meta
		name="description"
		content="Listas de compra familiares privadas o compartidas en tiempo real."
	/>
</svelte:head>

<div class="mx-auto w-full max-w-6xl space-y-5 px-3 py-4 sm:px-5 sm:py-7">
	<header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<p class="mb-1 text-sm font-semibold tracking-wide text-primary uppercase">En tiempo real</p>
			<h1 class="text-3xl font-bold tracking-tight sm:text-4xl">Listas compartidas</h1>
			<p class="mt-2 text-sm text-base-content/65 sm:text-base">
				Marca mientras compras; la familia ve el cambio al momento.
			</p>
		</div>
		<button
			class="btn btn-primary sm:self-center"
			type="button"
			onclick={() => (showCreate = !showCreate)}
			disabled={!ready || busy}
		>
			{showCreate ? 'Cerrar formulario' : '+ Nueva lista'}
		</button>
	</header>

	{#if form?.error}
		<div role="alert" class="alert alert-soft alert-error"><span>{form.error}</span></div>
	{:else if form?.message}
		<div role="status" class="alert alert-soft alert-success"><span>{form.message}</span></div>
	{/if}

	{#if showCreate}
		<section class="rounded-box border border-base-300 bg-base-100 p-4 sm:p-6">
			<h2 class="text-xl font-bold">Crear lista</h2>
			<form
				method="POST"
				action="?/createList"
				use:enhance={enhanceMutation}
				class="mt-4 grid gap-4 md:grid-cols-2"
			>
				<label class="form-control">
					<span class="label-text mb-1 font-medium">Tipo de lista</span>
					<select
						class="select w-full"
						name="list_type"
						bind:value={listType}
						onchange={() => (sourceListId = '')}
					>
						{#each LIST_TYPES as type (type)}<option value={type}>{LIST_TYPE_LABELS[type]}</option
							>{/each}
					</select>
				</label>
				<label class="form-control">
					<span class="label-text mb-1 font-medium">Empezar desde tu histórico</span>
					<select
						class="select w-full"
						name="source_list_id"
						bind:value={sourceListId}
						onchange={selectTemplate}
					>
						<option value="">Lista vacía</option>
						{#each templates as template (template.id)}
							<option value={template.id}
								>{template.title} · {template.items.length} elementos · {visibilityLabel(
									template.visibility
								)}</option
							>
						{/each}
					</select>
				</label>
				{#if selectedTemplate && selectedTemplate.visibility !== 'family'}
					<p class="text-sm text-base-content/70 md:col-span-2">
						Esta plantilla tiene acceso restringido. La copia será privada y no copiará sus
						permisos.
					</p>
				{/if}
				<label class="form-control">
					<span class="label-text mb-1 font-medium">Nombre</span>
					<input
						class="input w-full"
						name="title"
						maxlength="120"
						bind:value={listTitle}
						required
					/>
				</label>
				<label class="form-control">
					<span class="label-text mb-1 font-medium">Visibilidad</span>
					<select class="select w-full" name="visibility" bind:value={visibility}>
						<option
							value="family"
							disabled={selectedTemplate && selectedTemplate.visibility !== 'family'}
							>Toda la familia</option
						>
						<option
							value="selected_members"
							disabled={selectedTemplate && selectedTemplate.visibility !== 'family'}
							>Personas seleccionadas</option
						>
						<option value="private">Solo yo</option>
					</select>
				</label>
				<label class="form-control md:col-span-2">
					<span class="label-text mb-1 font-medium">Descripción</span>
					<textarea class="textarea min-h-20 w-full" name="description" maxlength="2000"></textarea>
				</label>
				{#if visibility === 'selected_members'}
					<fieldset class="md:col-span-2">
						<legend class="mb-2 font-medium">Quién puede colaborar</legend>
						<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
							{#each data.members as member (member.id)}
								<label
									class="flex min-h-11 cursor-pointer items-center gap-3 rounded-field border border-base-300 px-3 py-2"
								>
									<input
										class="checkbox checkbox-sm checkbox-primary"
										type="checkbox"
										name="member_ids"
										value={member.id}
									/>
									<span class="truncate text-sm">{member.displayName}</span>
								</label>
							{/each}
						</div>
					</fieldset>
				{/if}
				<div class="md:col-span-2 md:flex md:justify-end">
					<button class="btn w-full btn-primary md:w-auto" type="submit" disabled={busy}
						>Crear lista</button
					>
				</div>
			</form>
		</section>
	{/if}

	<div class="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
		<aside class="min-w-0">
			<div class="mb-2 flex items-center justify-between">
				<h2 class="font-bold">Tus listas</h2>
				<span class="text-xs text-base-content/45">{data.lists.length}</span>
			</div>
			<div class="flex snap-x gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible">
				{#each data.lists as list (list.id)}
					<a
						href={resolve(`/family/${data.familyId}/lists?list=${list.id}`)}
						class="min-w-64 snap-start rounded-box border p-3 transition-colors lg:min-w-0 {data.selectedListId ===
						list.id
							? 'border-primary bg-primary/8'
							: 'border-base-300 bg-base-100 hover:border-primary/40'}"
					>
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0">
								<h3 class="truncate font-semibold">{list.title}</h3>
								<p class="mt-0.5 text-xs text-base-content/50">
									{visibilityLabel(list.visibility)}
									· {LIST_TYPE_LABELS[list.list_type]}
								</p>
							</div>
							<span class="badge shrink-0 badge-ghost badge-sm"
								>{list.completedCount}/{list.itemCount}</span
							>
						</div>
						<progress
							class="progress mt-3 h-1.5 w-full progress-primary"
							value={list.itemCount ? (list.completedCount / list.itemCount) * 100 : 0}
							max="100"
						></progress>
					</a>
				{/each}
				{#if data.lists.length === 0}
					<div
						class="rounded-box border border-dashed border-base-300 p-5 text-sm text-base-content/55"
					>
						Crea tu primera lista para empezar.
					</div>
				{/if}
			</div>
		</aside>

		<main class="min-w-0">
			{#if data.selectedList}
				<section
					class="overflow-hidden rounded-box border border-base-300 bg-base-100"
					aria-busy={busy}
				>
					<header class="border-b border-base-300 p-4 sm:p-5">
						<div class="flex flex-wrap items-start justify-between gap-3">
							<div class="min-w-0">
								<div class="flex flex-wrap items-center gap-2">
									<h2 class="text-2xl font-bold">{data.selectedList.title}</h2>
									<span class="badge badge-outline badge-sm"
										>{visibilityLabel(data.selectedList.visibility)}</span
									>
								</div>
								{#if data.selectedList.description}
									<p class="mt-1 text-sm text-base-content/60">{data.selectedList.description}</p>
								{/if}
							</div>
							<div class="text-right">
								<p class="text-lg font-bold">{completion}%</p>
								<p class="text-xs text-base-content/45" aria-live="polite">{syncMessage}</p>
							</div>
						</div>
						{#if data.selectedList.canEdit}
							<form
								method="POST"
								action="?/setType"
								use:enhance={enhanceMutation}
								class="mt-3 flex flex-wrap items-center gap-2"
							>
								<input type="hidden" name="item_id" value={data.selectedList.id} />
								<input type="hidden" name="version" value={data.selectedList.version} />
								<label for="existing-list-type" class="text-sm font-medium">Tipo de lista</label>
								<select
									id="existing-list-type"
									name="list_type"
									class="select select-sm"
									value={data.selectedList.list_type}
								>
									{#each LIST_TYPES as type (type)}<option value={type}
											>{LIST_TYPE_LABELS[type]}</option
										>{/each}
								</select>
								<button type="submit" class="btn btn-sm" disabled={busy}>Guardar tipo</button>
							</form>
						{/if}
						<progress class="progress mt-4 h-2 w-full progress-primary" value={completion} max="100"
						></progress>
						<div class="mt-3">
							<MemberRadioFilter
								name="completed_by"
								label="Compras marcadas por"
								members={data.members}
								value={completedBy}
								onselect={(value) => (completedBy = value)}
							/>
							{#if completedBy}<p class="mt-1 text-xs text-base-content/65">
									Los artículos pendientes siguen visibles para todas las personas.
								</p>{/if}
						</div>
						<div class="mt-3 flex flex-wrap items-center justify-between gap-2">
							<div class="join" aria-label="Vista de artículos">
								<button
									class={['btn join-item btn-sm', { 'btn-active': viewMode === 'list' }]}
									aria-pressed={viewMode === 'list'}
									onclick={() => (viewMode = 'list')}>Lista</button
								>
								<button
									class={['btn join-item btn-sm', { 'btn-active': viewMode === 'recent' }]}
									aria-pressed={viewMode === 'recent'}
									onclick={() => (viewMode = 'recent')}>Últimos marcados</button
								>
							</div>
							{#if undoAction && data.selectedList.canEdit}
								<button
									class="btn btn-ghost btn-sm"
									disabled={busy}
									onclick={undoLastAction}
									aria-label={`Deshacer último marcado de ${undoAction.title}`}>Deshacer</button
								>
							{/if}
						</div>
					</header>

					{#if data.selectedList.canEdit}
						<form
							method="POST"
							action="?/addItem"
							use:enhance={enhanceMutation}
							class="grid gap-2 border-b border-base-300 bg-base-200/45 p-3 sm:grid-cols-[minmax(0,1fr)_6rem_7rem_auto] sm:p-4"
						>
							<input type="hidden" name="list_id" value={data.selectedList.id} />
							<label class="sr-only" for="item-title">Artículo</label>
							<input
								id="item-title"
								class="input w-full"
								name="title"
								bind:value={itemTitle}
								placeholder="Añadir artículo…"
								maxlength="200"
								required
							/>
							<label class="sr-only" for="item-quantity">Cantidad</label>
							<input
								id="item-quantity"
								class="input w-full"
								name="quantity"
								type="number"
								bind:value={itemQuantity}
								min="0.001"
								max="9999999"
								step="0.001"
								required
							/>
							<label class="sr-only" for="item-unit">Unidad</label>
							<input
								id="item-unit"
								class="input w-full"
								name="unit"
								bind:value={itemUnit}
								placeholder="unidad"
								maxlength="40"
							/>
							<button class="btn btn-primary" type="submit" disabled={busy}>Añadir</button>
						</form>
						{#if suggestions.length > 0}
							<div class="border-b border-base-300 px-4 py-3">
								<p class="mb-2 text-sm text-base-content/70">
									De tu histórico de {LIST_TYPE_LABELS[
										data.selectedList.list_type
									].toLocaleLowerCase('es')}
								</p>
								<div class="flex flex-wrap gap-2">
									{#each suggestions as suggestion (suggestion.title)}
										<button
											type="button"
											class="btn max-w-full whitespace-normal btn-outline btn-sm"
											disabled={busy}
											onclick={() => {
												itemTitle = suggestion.title;
												itemQuantity = suggestion.quantity;
												itemUnit = suggestion.unit ?? '';
											}}
										>
											{#if itemEmoji(suggestion.title)}<span aria-hidden="true"
													>{itemEmoji(suggestion.title)}</span
												>{/if}
											{suggestion.title} · {quantityLabel(suggestion.quantity, suggestion.unit)}
										</button>
									{/each}
								</div>
							</div>
						{/if}
					{/if}

					<div class="divide-y divide-base-300">
						{#if viewMode === 'list'}
							{#each pendingItems as item (item.id)}
								<div class="group flex min-h-16 items-center gap-3 px-3 py-3 sm:px-5">
									<input
										type="checkbox"
										class="checkbox checkbox-xl checkbox-primary"
										checked={Boolean(item.completed_at)}
										disabled={busy || !data.selectedList.canEdit}
										onchange={() => toggleItem(item)}
										aria-label={`Marcar ${item.title} como comprado`}
									/>
									<div class="min-w-0 flex-1">
										<p class="font-medium">
											{#if itemEmoji(item.title)}<span aria-hidden="true"
													>{itemEmoji(item.title)}
												</span>{/if}<span>{item.title}</span>
										</p>
										<p class="text-xs text-base-content/50">
											{quantityLabel(item.quantity, item.unit)}
										</p>
									</div>
									{#if data.selectedList.canEdit}
										<form method="POST" action="?/deleteItem" use:enhance={enhanceMutation}>
											<input type="hidden" name="item_id" value={item.id} />
											<input type="hidden" name="version" value={item.version} />
											<button
												class="btn btn-circle text-base-content/40 opacity-100 btn-ghost btn-sm sm:opacity-0 sm:group-hover:opacity-100"
												type="submit"
												disabled={busy}
												aria-label={`Eliminar ${item.title}`}>×</button
											>
										</form>
									{/if}
								</div>
							{/each}
						{/if}

						{#if completedItems.length > 0}
							<details class="group/completed" open={viewMode === 'recent'}>
								<summary
									class="cursor-pointer list-none px-4 py-3 text-sm font-medium text-base-content/55 hover:bg-base-200/50"
								>
									{viewMode === 'recent' ? 'Últimos marcados' : 'Completados'} · {completedItems.length}
								</summary>
								<div class="divide-y divide-base-300 border-t border-base-300 bg-base-200/30">
									{#each completedItems as item (item.id)}
										<div class="flex min-h-14 items-center gap-3 px-3 py-2 sm:px-5">
											<input
												type="checkbox"
												class="checkbox checkbox-xl checkbox-success"
												checked
												disabled={busy || !data.selectedList.canEdit}
												onchange={() => toggleItem(item)}
												aria-label={`Devolver ${item.title} a pendientes`}
											/>
											<div class="min-w-0 flex-1 opacity-55">
												<p class="font-medium line-through">
													{#if itemEmoji(item.title)}<span aria-hidden="true"
															>{itemEmoji(item.title)}
														</span>{/if}<span>{item.title}</span>
												</p>
												<p class="text-xs">
													{quantityLabel(item.quantity, item.unit)}{item.completedByName
														? ` · ${item.completedByName}`
														: ''}
												</p>
											</div>
										</div>
									{/each}
								</div>
							</details>
						{/if}

						{#if viewMode === 'recent' && completedItems.length === 0}
							<p class="px-5 py-8 text-center text-sm text-base-content/55" role="status">
								Aún no hay artículos marcados.
							</p>
						{:else if localItems.length === 0}
							<div class="px-5 py-12 text-center">
								<p class="text-3xl" aria-hidden="true">🧺</p>
								<h3 class="mt-2 font-semibold">La lista está vacía</h3>
								<p class="mt-1 text-sm text-base-content/55">
									Añade el primer artículo cuando quieras.
								</p>
							</div>
						{/if}
					</div>
				</section>
			{:else}
				<section class="rounded-box border border-dashed border-base-300 px-5 py-16 text-center">
					<p class="text-3xl" aria-hidden="true">📝</p>
					<h2 class="mt-2 text-xl font-bold">Aún no hay listas</h2>
					<p class="mt-1 text-sm text-base-content/55">
						Crea una lista familiar, privada o para personas concretas.
					</p>
				</section>
			{/if}
		</main>
	</div>
</div>
