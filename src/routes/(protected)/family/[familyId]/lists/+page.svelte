<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { createClient } from '$lib/supabase';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let showCreate = $state(false);
	let visibility = $state('family');
	type ListItem = PageProps['data']['items'][number];
	let localItems = $derived<ListItem[]>(data.items);
	let syncMessage = $state('Sincronizada');
	const supabase = createClient();

	onMount(() => {
		const channel = supabase
			.channel(`family-lists:${data.familyId}`)
			.on(
				'postgres_changes',
				{ event: '*', schema: 'public', table: 'family_list_items' },
				async () => {
					syncMessage = 'Actualizando…';
					await invalidateAll();
					syncMessage = 'Sincronizada';
				}
			)
			.subscribe();
		return () => {
			supabase.removeChannel(channel);
		};
	});

	const pendingItems = $derived(localItems.filter((item) => !item.completed_at));
	const completedItems = $derived(localItems.filter((item) => item.completed_at));
	const completion = $derived(
		localItems.length === 0 ? 0 : Math.round((completedItems.length / localItems.length) * 100)
	);

	async function toggleItem(item: (typeof localItems)[number]) {
		if (!data.selectedList?.canEdit) return;
		const previous = localItems;
		const completing = !item.completed_at;
		const optimisticTime = completing ? new Date().toISOString() : null;
		localItems = localItems.map((candidate) =>
			candidate.id === item.id
				? {
						...candidate,
						completed_at: optimisticTime,
						completed_by: completing ? 'optimistic' : null
					}
				: candidate
		);
		syncMessage = 'Guardando…';
		const { data: nextVersion, error } = await supabase.rpc('set_family_list_item_completed', {
			p_item_id: item.id,
			p_version: item.version,
			p_completed: completing
		});
		if (error) {
			localItems = previous;
			syncMessage = error.code === '40001' ? 'Cambios nuevos: recargando…' : 'No se pudo guardar';
			await invalidateAll();
			return;
		}
		localItems = localItems.map((candidate) =>
			candidate.id === item.id ? { ...candidate, version: nextVersion } : candidate
		);
		syncMessage = 'Sincronizada';
	}

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
			<form method="POST" action="?/createList" use:enhance class="mt-4 grid gap-4 md:grid-cols-2">
				<label class="form-control">
					<span class="label-text mb-1 font-medium">Nombre</span>
					<input class="input w-full" name="title" maxlength="120" required />
				</label>
				<label class="form-control">
					<span class="label-text mb-1 font-medium">Visibilidad</span>
					<select class="select w-full" name="visibility" bind:value={visibility}>
						<option value="family">Toda la familia</option>
						<option value="selected_members">Personas seleccionadas</option>
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
					<button class="btn w-full btn-primary md:w-auto" type="submit">Crear lista</button>
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
				<section class="overflow-hidden rounded-box border border-base-300 bg-base-100">
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
						<progress class="progress mt-4 h-2 w-full progress-primary" value={completion} max="100"
						></progress>
					</header>

					{#if data.selectedList.canEdit}
						<form
							method="POST"
							action="?/addItem"
							use:enhance
							class="grid gap-2 border-b border-base-300 bg-base-200/45 p-3 sm:grid-cols-[minmax(0,1fr)_6rem_7rem_auto] sm:p-4"
						>
							<input type="hidden" name="list_id" value={data.selectedList.id} />
							<label class="sr-only" for="item-title">Artículo</label>
							<input
								id="item-title"
								class="input w-full"
								name="title"
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
								value="1"
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
								placeholder="unidad"
								maxlength="40"
							/>
							<button class="btn btn-primary" type="submit">Añadir</button>
						</form>
					{/if}

					<div class="divide-y divide-base-300">
						{#each pendingItems as item (item.id)}
							<div class="group flex min-h-16 items-center gap-3 px-3 py-3 sm:px-5">
								<input
									type="checkbox"
									class="checkbox checkbox-xl checkbox-primary"
									checked={Boolean(item.completed_at)}
									disabled={!data.selectedList.canEdit}
									onchange={() => toggleItem(item)}
									aria-label={`Marcar ${item.title} como comprado`}
								/>
								<div class="min-w-0 flex-1">
									<p class="font-medium">{item.title}</p>
									<p class="text-xs text-base-content/50">
										{quantityLabel(item.quantity, item.unit)}
									</p>
								</div>
								{#if data.selectedList.canEdit}
									<form method="POST" action="?/deleteItem" use:enhance>
										<input type="hidden" name="item_id" value={item.id} />
										<input type="hidden" name="version" value={item.version} />
										<button
											class="btn btn-circle text-base-content/40 opacity-100 btn-ghost btn-sm sm:opacity-0 sm:group-hover:opacity-100"
											type="submit"
											aria-label={`Eliminar ${item.title}`}>×</button
										>
									</form>
								{/if}
							</div>
						{/each}

						{#if completedItems.length > 0}
							<details class="group/completed">
								<summary
									class="cursor-pointer list-none px-4 py-3 text-sm font-medium text-base-content/55 hover:bg-base-200/50"
								>
									Completados · {completedItems.length}
								</summary>
								<div class="divide-y divide-base-300 border-t border-base-300 bg-base-200/30">
									{#each completedItems as item (item.id)}
										<div class="flex min-h-14 items-center gap-3 px-3 py-2 sm:px-5">
											<input
												type="checkbox"
												class="checkbox checkbox-xl checkbox-success"
												checked
												disabled={!data.selectedList.canEdit}
												onchange={() => toggleItem(item)}
												aria-label={`Devolver ${item.title} a pendientes`}
											/>
											<div class="min-w-0 flex-1 opacity-55">
												<p class="font-medium line-through">{item.title}</p>
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

						{#if localItems.length === 0}
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
