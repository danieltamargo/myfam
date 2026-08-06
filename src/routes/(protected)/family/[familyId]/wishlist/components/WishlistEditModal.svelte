<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { WishlistEventCategoryDto, WishlistItemDto } from '$lib/server/wishlist/presenters';
	type WishlistFormData = {
		name: string;
		description: string;
		price: string;
		priority: number;
		image_url: string;
		images: string[];
		links: string[];
		event_ids: string[];
	};

	let {
		item,
		eventCategories,
		todosEventId,
		formData = $bindable(),
		showLinksSection = $bindable(),
		showImagesSection = $bindable(),
		isSubmitting = $bindable(),
		toggleEvent,
		addLinkField,
		removeLinkField,
		addImageField,
		removeImageField,
		prepareFormData,
		onClose
	}: {
		item: WishlistItemDto | null;
		eventCategories: WishlistEventCategoryDto[];
		todosEventId: string;
		formData: WishlistFormData;
		showLinksSection: boolean;
		showImagesSection: boolean;
		isSubmitting: boolean;
		toggleEvent: (eventId: string) => void;
		addLinkField: () => void;
		removeLinkField: (index: number) => void;
		addImageField: () => void;
		removeImageField: (index: number) => void;
		prepareFormData: (formElement: HTMLFormElement) => FormData;
		onClose: () => void;
	} = $props();
</script>

<div class="modal-open modal">
	<div class="modal-box max-w-2xl bg-base-100">
		<!-- Header -->
		<div class="mb-6 flex items-center justify-between border-b border-base-300 pb-4">
			<h3 class="text-2xl font-bold">
				{item ? '✏️ Editar Regalo' : '✨ Nuevo Regalo'}
			</h3>
			<button type="button" class="btn btn-circle btn-ghost btn-sm" onclick={onClose}> ✕ </button>
		</div>

		<form
			method="POST"
			action={item ? '?/updateItem' : '?/createItem'}
			use:enhance={({ formElement }) => {
				const submitData = prepareFormData(formElement);
				isSubmitting = true;
				return async ({ result, update }) => {
					isSubmitting = false;
					if (result.type === 'success') {
						onClose();
						await invalidateAll();
					} else {
						await update();
					}
				};
			}}
		>
			{#if item}
				<input type="hidden" name="item_id" value={item.id} />
				<input type="hidden" name="version" value={item.version} />
			{/if}

			<div class="space-y-6">
				<!-- Name & Description -->
				<div class="space-y-4">
					<div>
						<label for="name" class="mb-2 block text-sm font-medium">
							Nombre del regalo <span class="text-error">*</span>
						</label>
						<input
							type="text"
							id="name"
							name="name"
							class="input-bordered input w-full transition-colors focus:input-primary"
							bind:value={formData.name}
							placeholder="ej: Nintendo Switch, 4x Calcetines negros..."
							required
						/>
					</div>

					<div>
						<label for="description" class="mb-2 block text-sm font-medium">Descripción</label>
						<textarea
							id="description"
							name="description"
							class="textarea-bordered textarea w-full transition-colors focus:textarea-primary"
							rows="3"
							bind:value={formData.description}
							placeholder="Añade detalles opcionales: color, talla, modelo..."
						></textarea>
					</div>
				</div>

				<!-- Price & Priority Grid -->
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div>
						<label for="price" class="mb-2 block text-sm font-medium">Precio (€)</label>
						<input
							type="text"
							inputmode="decimal"
							id="price"
							name="price"
							class="input-bordered input w-full transition-colors focus:input-primary"
							bind:value={formData.price}
							placeholder="29.99"
							pattern="[0-9]*\.?[0-9]*"
						/>
					</div>

					<div>
						<label for="priority" class="mb-2 block text-sm font-medium">Prioridad</label>
						<select
							id="priority"
							name="priority"
							class="select-bordered select w-full transition-colors focus:select-primary"
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
				<div class="rounded-lg bg-base-200 p-4">
					<p class="mb-3 text-sm font-medium">Eventos</p>
					<div class="flex flex-wrap gap-2">
						{#each eventCategories as event (event.id)}
							{@const isSelected = formData.event_ids.includes(event.id)}
							<button
								type="button"
								class="btn transition-all btn-sm hover:scale-105 {isSelected
									? 'shadow-md'
									: 'btn-outline'}"
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
					<p class="mt-2 text-xs text-base-content/60">
						Por defecto "Todos". Selecciona eventos específicos si quieres.
					</p>
				</div>

				<!-- Images Section (Collapsible) -->
				<div class="rounded-lg bg-base-200 p-4">
					{#if !showImagesSection}
						<button
							type="button"
							class="btn gap-2 btn-ghost btn-sm"
							onclick={() => {
								showImagesSection = true;
								if (formData.images.length === 0) {
									formData.images = [''];
								}
							}}
						>
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
								<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
								<circle cx="8.5" cy="8.5" r="1.5"></circle>
								<polyline points="21 15 16 10 5 21"></polyline>
							</svg>
							Añadir imágenes
						</button>
					{:else}
						<div class="space-y-3">
							<div class="flex items-center justify-between">
								<p class="text-sm font-medium">Imágenes</p>
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

							{#each formData.images as image, i (i)}
								<div class="flex gap-2">
									<input
										type="url"
										class="input-bordered input input-sm flex-1 transition-colors focus:input-primary"
										bind:value={formData.images[i]}
										placeholder="https://example.com/imagen.jpg"
									/>
									<button
										type="button"
										class="btn btn-circle btn-outline btn-sm btn-error hover:btn-error"
										onclick={() => removeImageField(i)}
										title="Eliminar"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-4 w-4"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
										>
											<polyline points="3 6 5 6 21 6"></polyline>
											<path
												d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
											></path>
											<line x1="10" y1="11" x2="10" y2="17"></line>
											<line x1="14" y1="11" x2="14" y2="17"></line>
										</svg>
									</button>
								</div>
							{/each}

							<button type="button" class="btn gap-2 btn-ghost btn-sm" onclick={addImageField}>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-4 w-4"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<line x1="12" y1="5" x2="12" y2="19"></line>
									<line x1="5" y1="12" x2="19" y2="12"></line>
								</svg>
								Añadir otra imagen
							</button>
						</div>
					{/if}
				</div>

				<!-- Links Section (Collapsible) -->
				<div class="rounded-lg bg-base-200 p-4">
					{#if !showLinksSection}
						<button
							type="button"
							class="btn gap-2 btn-ghost btn-sm"
							onclick={() => {
								showLinksSection = true;
								if (formData.links.length === 0) {
									formData.links = [''];
								}
							}}
						>
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
								<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
								<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
							</svg>
							Añadir enlaces
						</button>
					{:else}
						<div class="space-y-3">
							<div class="flex items-center justify-between">
								<p class="text-sm font-medium">Enlaces</p>
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

							{#each formData.links as link, i (i)}
								<div class="flex gap-2">
									<input
										type="url"
										name="links"
										class="input-bordered input input-sm flex-1 transition-colors focus:input-primary"
										bind:value={formData.links[i]}
										placeholder="https://amazon.es/producto..."
									/>
									<button
										type="button"
										class="btn btn-circle btn-outline btn-sm btn-error hover:btn-error"
										onclick={() => removeLinkField(i)}
										title="Eliminar"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-4 w-4"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
										>
											<polyline points="3 6 5 6 21 6"></polyline>
											<path
												d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
											></path>
											<line x1="10" y1="11" x2="10" y2="17"></line>
											<line x1="14" y1="11" x2="14" y2="17"></line>
										</svg>
									</button>
								</div>
							{/each}

							<button type="button" class="btn gap-2 btn-ghost btn-sm" onclick={addLinkField}>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-4 w-4"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
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
			<div class="mt-8 flex items-center justify-between border-t border-base-300 pt-6">
				<div>
					{#if item}
						<button
							type="submit"
							formaction="?/deleteItem"
							formnovalidate
							class="btn gap-2 btn-outline btn-error"
							disabled={isSubmitting}
						>
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
								<polyline points="3 6 5 6 21 6"></polyline>
								<path
									d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
								></path>
								<line x1="10" y1="11" x2="10" y2="17"></line>
								<line x1="14" y1="11" x2="14" y2="17"></line>
							</svg>
							Eliminar
						</button>
					{/if}
				</div>

				<div class="flex gap-2">
					<button type="button" class="btn btn-ghost" onclick={onClose} disabled={isSubmitting}>
						Cancelar
					</button>
					<button type="submit" class="btn gap-2 btn-primary" disabled={isSubmitting}>
						{#if isSubmitting}
							<span class="loading loading-sm loading-spinner"></span>
							Guardando...
						{:else}
							<span>{item ? '💾' : '✨'}</span>
							{item ? 'Guardar cambios' : 'Crear regalo'}
						{/if}
					</button>
				</div>
			</div>
		</form>
	</div>
	<button type="button" class="modal-backdrop cursor-default" aria-label="Cerrar" onclick={onClose}
	></button>
</div>
