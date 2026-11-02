<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { WishlistEventCategoryDto, WishlistItemDto } from '$lib/server/wishlist/presenters';
	import { onMount, tick, untrack } from 'svelte';
	import WishlistItemDetails from './WishlistItemDetails.svelte';
	import type { CalendarEventOption } from '$lib/server/calendar/resource-links';

	type FieldErrors = Partial<
		Record<
			| 'name'
			| 'description'
			| 'price'
			| 'currency'
			| 'desired_quantity'
			| 'links'
			| 'image'
			| 'calendar_event_id',
			string
		>
	>;

	interface LinkField {
		id: string;
		value: string;
	}

	let {
		item,
		eventCategories,
		calendarEvents,
		todosEventId,
		onSuccess,
		onCancel
	}: {
		item: WishlistItemDto | null;
		eventCategories: WishlistEventCategoryDto[];
		calendarEvents: CalendarEventOption[];
		todosEventId: string;
		onSuccess: () => void;
		onCancel: () => void;
	} = $props();

	const initial = untrack(() => {
		const selectedEvents = item?.gift_item_events.map((event) => event.event_category_id) ?? [];
		return {
			name: item?.name ?? '',
			description: item?.description ?? '',
			price: item?.price?.toString() ?? '',
			currency: item?.currency ?? 'EUR',
			priority: item?.priority ?? 0,
			desiredQuantity: item?.desired_quantity ?? 1,
			imagePath: item?.image_url ?? '',
			imageSrc: item?.image_src ?? null,
			eventIds: selectedEvents.length > 0 ? selectedEvents : todosEventId ? [todosEventId] : [],
			links: (item?.links ?? []).map((value, index) => ({ id: `link-${index}`, value })),
			advancedOpen: Boolean(item?.image_url || item?.links.length),
			calendarSelection: item ? '__keep__' : ''
		};
	});
	let name = $state(initial.name);
	let description = $state(initial.description);
	let price = $state(initial.price);
	let currency = $state(initial.currency);
	let priority = $state(initial.priority);
	let desiredQuantity = $state(initial.desiredQuantity);
	let imagePath = $state(initial.imagePath);
	let removeImage = $state(false);
	let imagePreviewUrl = $state<string | null>(initial.imageSrc);
	let eventIds = $state<string[]>(initial.eventIds);
	let calendarSelection = $state(initial.calendarSelection);
	let nextLinkId = initial.links.length;
	let links = $state<LinkField[]>(initial.links);
	let advancedOpen = $state(initial.advancedOpen);
	let isSubmitting = $state(false);
	let formError = $state<string | null>(null);
	let fieldErrors = $state<FieldErrors>({});

	const parsedPrice = $derived.by(() => {
		const normalized = price.trim().replace(',', '.');
		if (!normalized) return null;
		const value = Number(normalized);
		return Number.isFinite(value) && value >= 0 ? value : null;
	});
	const previewLinks = $derived(
		links.map((link) => link.value.trim()).filter((link) => link.startsWith('https://'))
	);
	const previewEvents = $derived(
		eventCategories
			.filter((event) => eventIds.includes(event.id))
			.map((event) => ({ id: event.id, name: event.name, icon: event.icon }))
	);

	onMount(() => {
		const nameInput = document.querySelector<HTMLInputElement>(
			'[data-wishlist-form] [name="name"]'
		);
		nameInput?.focus();
		nameInput?.select();

		return () => {
			if (imagePreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(imagePreviewUrl);
		};
	});

	function addLink() {
		links = [...links, { id: `link-${nextLinkId++}`, value: '' }];
		advancedOpen = true;
	}

	function removeLink(id: string) {
		links = links.filter((link) => link.id !== id);
		fieldErrors.links = undefined;
	}

	function toggleEvent(eventId: string) {
		if (eventId === todosEventId) {
			eventIds = todosEventId ? [todosEventId] : [];
			return;
		}

		if (eventIds.includes(eventId)) {
			eventIds = eventIds.filter((id) => id !== eventId && id !== todosEventId);
			if (eventIds.length === 0 && todosEventId) eventIds = [todosEventId];
		} else {
			eventIds = [...eventIds.filter((id) => id !== todosEventId), eventId];
		}
	}

	function handleImageChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0] ?? null;
		fieldErrors.image = undefined;

		if (imagePreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(imagePreviewUrl);
		if (!file) {
			imagePreviewUrl = removeImage ? null : (item?.image_src ?? null);
			return;
		}

		if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
			fieldErrors.image = 'Usa una imagen JPG, PNG, GIF o WebP.';
			input.value = '';
			imagePreviewUrl = removeImage ? null : (item?.image_src ?? null);
			return;
		}

		if (file.size > 5 * 1024 * 1024) {
			fieldErrors.image = 'La imagen no puede superar 5 MB.';
			input.value = '';
			imagePreviewUrl = removeImage ? null : (item?.image_src ?? null);
			return;
		}

		removeImage = false;
		imagePreviewUrl = URL.createObjectURL(file);
	}

	function validateForm(submitter: HTMLElement | null): boolean {
		if (submitter instanceof HTMLButtonElement && submitter.formAction.includes('/deleteItem')) {
			return true;
		}

		const errors: FieldErrors = {};
		const normalizedPrice = price.trim().replace(',', '.');
		if (!name.trim()) errors.name = 'Escribe un nombre para el regalo.';
		if (name.trim().length > 120) errors.name = 'El nombre no puede superar 120 caracteres.';
		if (description.length > 2000)
			errors.description = 'La descripción no puede superar 2.000 caracteres.';
		if (
			normalizedPrice &&
			(!Number.isFinite(Number(normalizedPrice)) || Number(normalizedPrice) < 0)
		) {
			errors.price = 'Introduce un precio igual o superior a 0.';
		}
		if (!/^[A-Z]{3}$/.test(currency)) errors.currency = 'Selecciona una moneda válida.';
		if (!Number.isInteger(desiredQuantity) || desiredQuantity < 1 || desiredQuantity > 999) {
			errors.desired_quantity = 'La cantidad debe estar entre 1 y 999.';
		}
		const submittedLinks = links.map((link) => link.value.trim()).filter(Boolean);
		if (submittedLinks.length > 10) errors.links = 'Solo se permiten 10 enlaces.';
		if (submittedLinks.some((link) => !link.startsWith('https://'))) {
			errors.links = 'Todos los enlaces deben comenzar por https://.';
		}
		fieldErrors = errors;
		formError = null;
		if (Object.keys(errors).length === 0) return true;

		void focusFirstError();
		return false;
	}

	async function focusFirstError() {
		await tick();
		const firstInvalid = document.querySelector<HTMLElement>(
			'[data-wishlist-form] [aria-invalid="true"]'
		);
		firstInvalid?.focus();
	}

	function applyFailure(data: unknown) {
		const failure = data as { error?: unknown; fieldErrors?: unknown } | null;
		formError =
			typeof failure?.error === 'string' ? failure.error : 'Revisa los datos del formulario.';
		if (failure?.fieldErrors && typeof failure.fieldErrors === 'object') {
			fieldErrors = failure.fieldErrors as FieldErrors;
		}
		void focusFirstError();
	}
</script>

<form
	method="POST"
	enctype="multipart/form-data"
	novalidate
	action={item ? '?/updateItem' : '?/createItem'}
	data-wishlist-form
	aria-busy={isSubmitting}
	use:enhance={({ submitter, cancel }) => {
		if (!validateForm(submitter)) {
			cancel();
			return;
		}
		isSubmitting = true;
		formError = null;
		return async ({ result, update }) => {
			isSubmitting = false;
			if (result.type === 'success') {
				await update({ reset: false });
				await invalidateAll();
				onSuccess();
				return;
			}
			if (result.type === 'failure') {
				applyFailure(result.data);
				await update({ reset: false, invalidateAll: false });
				return;
			}
			await update({ reset: false });
		};
	}}
>
	{#if item}
		<input type="hidden" name="item_id" value={item.id} />
		<input type="hidden" name="version" value={item.version} />
	{/if}
	<input type="hidden" name="image_url" value={removeImage ? '' : imagePath} />
	<input type="hidden" name="remove_image" value={removeImage.toString()} />

	{#if formError}
		<div role="alert" class="mb-5 alert alert-soft alert-error">
			<span>{formError}</span>
		</div>
	{/if}

	<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
		<fieldset class="min-w-0 space-y-5" disabled={isSubmitting}>
			<div>
				<label for="wishlist-name" class="mb-2 block text-sm font-semibold">
					Nombre del regalo <span class="text-error" aria-hidden="true">*</span>
				</label>
				<input
					id="wishlist-name"
					name="name"
					type="text"
					class="input w-full {fieldErrors.name ? 'input-error' : 'input-bordered'}"
					bind:value={name}
					maxlength="120"
					placeholder="Ej.: auriculares inalámbricos"
					required
					aria-invalid={Boolean(fieldErrors.name)}
					aria-describedby={fieldErrors.name ? 'wishlist-name-error' : undefined}
					oninput={() => (fieldErrors.name = undefined)}
				/>
				{#if fieldErrors.name}
					<p id="wishlist-name-error" class="mt-1 text-sm text-error">{fieldErrors.name}</p>
				{/if}
			</div>

			<div>
				<div class="mb-2 flex items-center justify-between gap-3">
					<label for="wishlist-description" class="text-sm font-semibold">Descripción</label>
					<span class="text-xs text-base-content/50">{description.length}/2000</span>
				</div>
				<textarea
					id="wishlist-description"
					name="description"
					class="textarea min-h-24 w-full {fieldErrors.description
						? 'textarea-error'
						: 'textarea-bordered'}"
					bind:value={description}
					maxlength="2000"
					placeholder="Modelo, talla, color o cualquier detalle útil"
					aria-invalid={Boolean(fieldErrors.description)}
					oninput={() => (fieldErrors.description = undefined)}
				></textarea>
				{#if fieldErrors.description}
					<p class="mt-1 text-sm text-error">{fieldErrors.description}</p>
				{/if}
			</div>

			<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				<div class="sm:col-span-1">
					<label for="wishlist-price" class="mb-2 block text-sm font-semibold"
						>Precio estimado</label
					>
					<input
						id="wishlist-price"
						name="price"
						type="text"
						inputmode="decimal"
						class="input w-full {fieldErrors.price ? 'input-error' : 'input-bordered'}"
						bind:value={price}
						placeholder="29,99"
						aria-invalid={Boolean(fieldErrors.price)}
						oninput={() => (fieldErrors.price = undefined)}
					/>
					{#if fieldErrors.price}<p class="mt-1 text-sm text-error">{fieldErrors.price}</p>{/if}
				</div>
				<div>
					<label for="wishlist-currency" class="mb-2 block text-sm font-semibold">Moneda</label>
					<select
						id="wishlist-currency"
						name="currency"
						class="select-bordered select w-full"
						bind:value={currency}
					>
						<option value="EUR">EUR</option>
						<option value="USD">USD</option>
						<option value="GBP">GBP</option>
					</select>
				</div>
				<div>
					<label for="wishlist-quantity" class="mb-2 block text-sm font-semibold">Cantidad</label>
					<input
						id="wishlist-quantity"
						name="desired_quantity"
						type="number"
						class="input w-full {fieldErrors.desired_quantity ? 'input-error' : 'input-bordered'}"
						bind:value={desiredQuantity}
						min="1"
						max="999"
						aria-invalid={Boolean(fieldErrors.desired_quantity)}
					/>
				</div>
				<div>
					<label for="wishlist-priority" class="mb-2 block text-sm font-semibold">Prioridad</label>
					<select
						id="wishlist-priority"
						name="priority"
						class="select-bordered select w-full"
						bind:value={priority}
					>
						<option value={2}>Muy alta</option>
						<option value={1}>Alta</option>
						<option value={0}>Normal</option>
						<option value={-1}>Baja</option>
					</select>
				</div>
			</div>

			<section aria-labelledby="wishlist-events-label" class="rounded-box bg-base-200 p-4">
				<p id="wishlist-events-label" class="mb-3 text-sm font-semibold">¿Para qué evento?</p>
				<div class="flex flex-wrap gap-2">
					{#each eventCategories as event (event.id)}
						{@const selected = eventIds.includes(event.id)}
						<button
							type="button"
							class="btn btn-sm {selected ? 'btn-primary' : 'btn-outline'}"
							aria-pressed={selected}
							onclick={() => toggleEvent(event.id)}
						>
							<span aria-hidden="true">{event.icon ?? '🎁'}</span>
							{event.name}
						</button>
						{#if selected}<input type="hidden" name="event_ids" value={event.id} />{/if}
					{/each}
				</div>
			</section>

			<section class="rounded-box bg-base-200 p-4">
				<label class="form-control" for="wishlist-calendar-event">
					<span class="mb-2 text-sm font-semibold">Evento del calendario (opcional)</span>
					<select
						id="wishlist-calendar-event"
						name="calendar_event_id"
						class="select w-full"
						bind:value={calendarSelection}
						aria-invalid={Boolean(fieldErrors.calendar_event_id)}
					>
						{#if item}<option value="__keep__"
								>{item.calendar_event
									? `Mantener: ${item.calendar_event.title}`
									: 'No cambiar asociación'}</option
							>{/if}
						<option value="">Sin evento: regalo genérico</option>
						{#each calendarEvents as event (event.id)}
							<option value={event.id}
								>{event.title} · {new Intl.DateTimeFormat('es-ES', {
									dateStyle: 'short',
									timeZone: event.timezone
								}).format(new Date(event.starts_at))}</option
							>
						{/each}
					</select>
				</label>
				<p class="mt-2 text-xs text-base-content/65">
					Solo aparecen eventos que puedes ver. El evento mantiene su propia privacidad aunque
					compartas este regalo.
				</p>
				{#if fieldErrors.calendar_event_id}<p role="alert" class="mt-1 text-sm text-error">
						{fieldErrors.calendar_event_id}
					</p>{/if}
			</section>

			<details
				class="collapse-arrow collapse border border-base-300 bg-base-100"
				bind:open={advancedOpen}
			>
				<summary class="collapse-title font-semibold">Imagen y enlaces opcionales</summary>
				<div class="collapse-content space-y-5">
					<div>
						<label for="wishlist-image" class="mb-2 block text-sm font-semibold"
							>Imagen privada</label
						>
						<input
							id="wishlist-image"
							name="image"
							type="file"
							class="file-input-bordered file-input w-full"
							accept="image/jpeg,image/png,image/gif,image/webp"
							onchange={handleImageChange}
							aria-invalid={Boolean(fieldErrors.image)}
						/>
						<p class="mt-1 text-xs text-base-content/55">
							JPG, PNG, GIF o WebP, hasta 5 MB. Se guarda en almacenamiento privado.
						</p>
						{#if fieldErrors.image}<p class="mt-1 text-sm text-error">{fieldErrors.image}</p>{/if}
						{#if item?.image_url && !removeImage}
							<label class="mt-3 flex cursor-pointer items-center gap-2 text-sm">
								<input
									type="checkbox"
									class="checkbox checkbox-sm checkbox-error"
									bind:checked={removeImage}
									onchange={() =>
										(imagePreviewUrl = removeImage ? null : (item?.image_src ?? null))}
								/>
								Quitar la imagen actual
							</label>
						{/if}
					</div>

					<div class="space-y-3">
						<div class="flex items-center justify-between gap-3">
							<p class="text-sm font-semibold">Enlaces de compra</p>
							<button
								type="button"
								class="btn btn-ghost btn-sm"
								onclick={addLink}
								disabled={links.length >= 10}>+ Añadir enlace</button
							>
						</div>
						{#if links.length === 0}
							<p class="text-sm text-base-content/50">Puedes añadir hasta 10 enlaces HTTPS.</p>
						{/if}
						{#each links as link (link.id)}
							<div class="flex gap-2">
								<input
									name="links"
									type="url"
									class="input-bordered input input-sm min-w-0 flex-1"
									bind:value={link.value}
									placeholder="https://tienda.example/regalo"
									aria-label="Enlace de compra"
								/>
								<button
									type="button"
									class="btn btn-square text-error btn-ghost btn-sm"
									onclick={() => removeLink(link.id)}
									aria-label="Quitar enlace">×</button
								>
							</div>
						{/each}
						{#if fieldErrors.links}<p class="text-sm text-error">{fieldErrors.links}</p>{/if}
					</div>
				</div>
			</details>
		</fieldset>

		<aside
			class="h-fit rounded-box border border-base-300 bg-base-200/60 p-5 lg:sticky lg:top-4"
			aria-label="Vista previa segura"
		>
			<div class="mb-4 flex items-center justify-between gap-3">
				<h4 class="font-bold">Así se verá</h4>
				<span class="badge badge-soft badge-sm badge-success">Vista segura</span>
			</div>
			<WishlistItemDetails
				{name}
				{description}
				price={parsedPrice}
				{currency}
				{priority}
				{desiredQuantity}
				imageSrc={imagePreviewUrl}
				links={previewLinks}
				events={previewEvents}
				preview
			/>
		</aside>
	</div>

	<footer
		class="sticky -bottom-6 -mx-6 mt-6 flex flex-col-reverse gap-3 border-t border-base-300 bg-base-100 px-6 pt-4 pb-6 sm:flex-row sm:items-center sm:justify-between"
	>
		<div>
			{#if item}
				<button
					type="submit"
					formaction="?/deleteItem"
					formnovalidate
					class="btn btn-outline btn-error"
					disabled={isSubmitting}>Eliminar regalo</button
				>
			{/if}
		</div>
		<div class="flex flex-col-reverse gap-2 sm:flex-row">
			<button type="button" class="btn btn-ghost" onclick={onCancel} disabled={isSubmitting}
				>Cancelar</button
			>
			<button type="submit" class="btn min-w-40 btn-primary" disabled={isSubmitting}>
				{#if isSubmitting}<span class="loading loading-sm loading-spinner"></span> Guardando…{:else}{item
						? 'Guardar cambios'
						: 'Crear regalo'}{/if}
			</button>
		</div>
	</footer>
</form>
