<script lang="ts">
	import MemberRadioFilter from '$lib/components/ui/MemberRadioFilter.svelte';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let uploadOpen = $state(false);
	let displayName = $state('');
	let uploadVisibility = $state('private');
	let uploadMemberIds = $state<string[]>([]);
	let pendingAction = $state<string | null>(null);

	function formatDate(value: string): string {
		return new Intl.DateTimeFormat('es-ES', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		}).format(new Date(value));
	}

	function formatSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	function fileKind(mimeType: string): string {
		if (mimeType === 'application/pdf') return 'PDF';
		if (mimeType.startsWith('image/')) return 'Imagen';
		if (mimeType === 'text/plain') return 'Texto';
		if (mimeType.includes('wordprocessingml')) return 'Word';
		if (mimeType.includes('spreadsheetml')) return 'Excel';
		return 'PowerPoint';
	}

	function fileIcon(mimeType: string): string {
		if (mimeType === 'application/pdf') return '▰';
		if (mimeType.startsWith('image/')) return '▧';
		if (mimeType.includes('spreadsheetml')) return '▦';
		return '▤';
	}

	function expiryState(expiresAt: string | null): { label: string; className: string } | null {
		if (!expiresAt) return null;
		const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000);
		if (days <= 0) return { label: 'Caducado', className: 'badge-error' };
		if (days <= 7) return { label: `Caduca en ${days} d`, className: 'badge-warning' };
		return { label: `Hasta ${formatDate(expiresAt)}`, className: 'badge-ghost' };
	}

	function folderQuery(folder?: string, cursor?: string): string {
		const params = new SvelteURLSearchParams();
		if (data.selectedMember) params.set('member', data.selectedMember);
		if (folder) params.set('folder', folder);
		if (cursor) params.set('cursor', cursor);
		const query = params.toString();
		return query ? `?${query}` : '';
	}

	function useFileName(event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file && !displayName) displayName = file.name.replace(/\.[^.]+$/, '').slice(0, 180);
	}

	const enhanceMutation: SubmitFunction = ({ formElement }) => {
		pendingAction = formElement.dataset.action ?? 'guardando';
		return async ({ update, result }) => {
			await update();
			if (result.type === 'success' && pendingAction === 'subiendo') uploadOpen = false;
			pendingAction = null;
		};
	};
</script>

<svelte:head>
	<title>Documentos privados · MyFamily</title>
	<meta
		name="description"
		content="Documentos familiares privados con permisos explícitos y enlaces temporales."
	/>
</svelte:head>

<div class="mx-auto w-full max-w-7xl space-y-5 px-3 py-4 sm:px-5 sm:py-7">
	<header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div class="max-w-2xl">
			<p class="mb-1 text-sm font-semibold tracking-wide text-primary uppercase">Bóveda familiar</p>
			<h1 class="text-3xl font-bold tracking-tight sm:text-4xl">Documentos privados</h1>
			<p class="mt-2 text-sm text-base-content/65 sm:text-base">
				Cada archivo empieza siendo solo tuyo. Compartirlo siempre requiere elegir personas.
			</p>
		</div>
		<button
			class="btn btn-primary sm:self-center"
			type="button"
			onclick={() => (uploadOpen = true)}
		>
			+ Subir documento
		</button>
	</header>

	<form method="GET" class="rounded-box border border-base-300 bg-base-100 p-3 sm:p-4">
		{#if data.selectedFolder}<input type="hidden" name="folder" value={data.selectedFolder} />{/if}
		<MemberRadioFilter
			name="member"
			label="Autor"
			members={data.members}
			value={data.selectedMember}
			autoSubmit
		/>
	</form>

	{#if form?.error}
		<div role="alert" class="alert alert-soft alert-error"><span>{form.error}</span></div>
	{:else if form?.message}
		<div role="status" class="alert alert-soft alert-success"><span>{form.message}</span></div>
	{/if}

	<section class="rounded-box border border-base-300 bg-base-100 p-3 sm:p-4">
		<div class="flex items-center gap-2 overflow-x-auto pb-1" aria-label="Carpetas de documentos">
			<a
				class="btn whitespace-nowrap btn-sm {data.selectedFolder === null
					? 'btn-primary'
					: 'btn-ghost'}"
				href={resolve(`/family/${data.familyId}/documents${folderQuery()}`)}>Todos</a
			>
			{#each data.folders as folder (folder)}
				<a
					class="btn whitespace-nowrap btn-sm {data.selectedFolder === folder
						? 'btn-primary'
						: 'btn-ghost'}"
					href={resolve(`/family/${data.familyId}/documents${folderQuery(folder)}`)}>📁 {folder}</a
				>
			{/each}
		</div>
	</section>

	{#if uploadOpen}
		<section class="rounded-box border border-primary/30 bg-primary/5 p-4 sm:p-6">
			<div class="mb-5 flex items-start justify-between gap-3">
				<div>
					<p class="text-xs font-semibold tracking-wide text-primary uppercase">Nueva subida</p>
					<h2 class="mt-1 text-2xl font-bold">Guarda un archivo en tu espacio privado</h2>
				</div>
				<button
					class="btn btn-circle btn-ghost btn-sm"
					type="button"
					onclick={() => (uploadOpen = false)}
					aria-label="Cerrar formulario">×</button
				>
			</div>
			<form
				id="upload-document-form"
				method="POST"
				action="?/uploadDocument"
				enctype="multipart/form-data"
				use:enhance={enhanceMutation}
				data-action="subiendo"
				class="grid gap-4 lg:grid-cols-2"
			>
				<label class="form-control lg:col-span-2">
					<span class="label-text mb-1 font-medium">Archivo</span>
					<input
						class="file-input w-full"
						type="file"
						name="document"
						accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.docx,.xlsx,.pptx"
						required
						onchange={useFileName}
					/>
					<span class="mt-1 text-xs text-base-content/50">
						PDF, imágenes, texto u Office · máximo 15 MB · verificamos el contenido real.
					</span>
				</label>
				<label class="form-control">
					<span class="label-text mb-1 font-medium">Nombre visible</span>
					<input
						class="input w-full"
						name="display_name"
						maxlength="180"
						required
						bind:value={displayName}
					/>
				</label>
				<label class="form-control">
					<span class="label-text mb-1 font-medium">Carpeta lógica (opcional)</span>
					<input class="input w-full" name="folder_name" maxlength="80" placeholder="Salud" />
				</label>
				<label class="form-control">
					<span class="label-text mb-1 font-medium">Privacidad</span>
					<select class="select w-full" name="visibility" bind:value={uploadVisibility}>
						<option value="private">Solo yo</option>
						<option value="selected_members">Personas seleccionadas</option>
					</select>
				</label>
				<label class="form-control">
					<span class="label-text mb-1 font-medium">Caduca al terminar el día (opcional)</span>
					<input class="input w-full" type="date" name="expires_at" />
				</label>
				{#if uploadVisibility === 'selected_members'}
					<fieldset class="lg:col-span-2">
						<legend class="mb-2 font-medium">Quién puede descargarlo</legend>
						<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
							{#each data.members.filter((member) => member.id !== data.currentUserId) as member (member.id)}
								<label
									class="flex min-h-11 cursor-pointer items-center gap-3 rounded-field border border-base-300 bg-base-100 px-3 py-2"
								>
									<input
										class="checkbox checkbox-sm checkbox-primary"
										type="checkbox"
										name="member_ids"
										value={member.id}
										bind:group={uploadMemberIds}
									/>
									<span class="truncate text-sm">{member.displayName}</span>
								</label>
							{/each}
						</div>
					</fieldset>
				{/if}
				<div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end lg:col-span-2">
					<button class="btn btn-ghost" type="button" onclick={() => (uploadOpen = false)}
						>Cancelar</button
					>
					<button class="btn btn-primary" type="submit" disabled={pendingAction === 'subiendo'}>
						{#if pendingAction === 'subiendo'}<span class="loading loading-sm loading-spinner"
							></span>{/if}
						{pendingAction === 'subiendo' ? 'Protegiendo archivo…' : 'Subir de forma privada'}
					</button>
				</div>
			</form>
		</section>
	{/if}

	<section aria-labelledby="documents-heading">
		<div class="mb-3 flex items-center justify-between">
			<div>
				<h2 id="documents-heading" class="text-xl font-bold">
					{data.selectedFolder ? `Carpeta ${data.selectedFolder}` : 'Tus documentos accesibles'}
				</h2>
				<p class="text-xs text-base-content/50">
					Las descargas usan enlaces temporales de dos minutos.
				</p>
			</div>
			<span class="badge badge-ghost">{data.documents.length}</span>
		</div>

		<div class="grid min-w-0 gap-3">
			{#each data.documents as document (document.id)}
				{@const expiry = expiryState(document.expires_at)}
				<article
					class="min-w-0 overflow-hidden rounded-box border border-base-300 bg-base-100 p-4 sm:p-5"
				>
					<div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
						<div class="flex w-full min-w-0 items-start gap-3">
							<div
								class="grid size-12 shrink-0 place-items-center rounded-box bg-base-200 text-xl font-bold text-primary"
								aria-hidden="true"
							>
								{fileIcon(document.mime_type)}
							</div>
							<div class="min-w-0 flex-1">
								<div class="flex min-w-0 flex-wrap items-center gap-2">
									<h3 class="max-w-full min-w-0 basis-full truncate font-bold sm:basis-auto">
										{document.display_name}
									</h3>
									<span class="badge badge-outline badge-sm">{fileKind(document.mime_type)}</span>
									<span class="badge badge-ghost badge-sm">
										{document.visibility === 'private' ? '🔒 Solo tú' : '👥 Compartido'}
									</span>
									{#if expiry}<span class="badge badge-sm {expiry.className}">{expiry.label}</span
										>{/if}
								</div>
								<p class="mt-1 truncate text-sm text-base-content/55">{document.original_name}</p>
								<p class="mt-1 text-xs text-base-content/45">
									{formatSize(document.size_bytes)} · {document.folder_name ?? 'Sin carpeta'} · por
									{document.ownerName} · {formatDate(document.updated_at)}
								</p>
							</div>
						</div>
						<div class="flex w-full shrink-0 flex-wrap items-center gap-2 lg:w-auto">
							<form method="POST" action="?/downloadDocument">
								<input type="hidden" name="document_id" value={document.id} />
								<button class="btn btn-sm btn-primary" type="submit">Descargar</button>
							</form>
							{#if document.canManage}
								<details class="relative w-full sm:w-auto">
									<summary class="btn w-full btn-ghost btn-sm sm:w-auto">Gestionar</summary>
									<div
										class="mt-2 w-full rounded-box border border-base-300 bg-base-100 p-4 shadow-xl sm:absolute sm:right-0 sm:z-20 sm:w-88"
									>
										<form
											method="POST"
											action="?/updateAccess"
											use:enhance={enhanceMutation}
											data-action={`permisos-${document.id}`}
											class="space-y-3"
										>
											<input type="hidden" name="document_id" value={document.id} />
											<input type="hidden" name="version" value={document.version} />
											<label class="form-control">
												<span class="label-text mb-1 text-xs font-semibold">Carpeta lógica</span>
												<input
													class="input input-sm w-full"
													name="folder_name"
													maxlength="80"
													value={document.folder_name ?? ''}
												/>
											</label>
											<label class="form-control">
												<span class="label-text mb-1 text-xs font-semibold">Privacidad</span>
												<select
													class="select w-full select-sm"
													name="visibility"
													value={document.visibility}
												>
													<option value="private">Solo yo</option>
													<option value="selected_members">Personas seleccionadas</option>
												</select>
											</label>
											<label class="form-control">
												<span class="label-text mb-1 text-xs font-semibold">Caducidad</span>
												<input
													class="input input-sm w-full"
													type="date"
													name="expires_at"
													value={document.expires_at?.slice(0, 10) ?? ''}
												/>
											</label>
											<fieldset>
												<legend class="mb-1 text-xs font-semibold">Personas</legend>
												<div class="max-h-36 space-y-1 overflow-y-auto">
													{#each data.members.filter((member) => member.id !== data.currentUserId) as member (member.id)}
														<label
															class="flex min-h-9 cursor-pointer items-center gap-2 rounded-field px-2 hover:bg-base-200"
														>
															<input
																class="checkbox checkbox-xs checkbox-primary"
																type="checkbox"
																name="member_ids"
																value={member.id}
																checked={document.memberIds.includes(member.id)}
															/>
															<span class="truncate text-sm">{member.displayName}</span>
														</label>
													{/each}
												</div>
												<p class="mt-1 text-[0.68rem] text-base-content/45">
													Solo se aplican al elegir «Personas seleccionadas».
												</p>
											</fieldset>
											<button
												class="btn w-full btn-sm btn-primary"
												type="submit"
												disabled={pendingAction === `permisos-${document.id}`}
											>
												{pendingAction === `permisos-${document.id}`
													? 'Guardando…'
													: 'Guardar acceso'}
											</button>
										</form>
										<div class="divider my-3"></div>
										<form
											method="POST"
											action="?/deleteDocument"
											use:enhance={enhanceMutation}
											data-action={`borrando-${document.id}`}
										>
											<input type="hidden" name="document_id" value={document.id} />
											<input type="hidden" name="version" value={document.version} />
											<button class="btn w-full btn-soft btn-sm btn-error" type="submit">
												Borrar permanentemente
											</button>
										</form>
									</div>
								</details>
							{/if}
						</div>
					</div>
				</article>
			{/each}
		</div>

		{#if data.documents.length === 0}
			<div class="rounded-box border border-dashed border-base-300 px-6 py-16 text-center">
				<p class="text-4xl" aria-hidden="true">▤</p>
				<h2 class="mt-3 text-xl font-bold">Todavía no hay documentos aquí</h2>
				<p class="mt-1 text-sm text-base-content/55">
					Sube uno: nadie de la familia podrá abrirlo salvo que tú lo autorices.
				</p>
				<button class="btn mt-5 btn-primary" type="button" onclick={() => (uploadOpen = true)}>
					Subir el primero
				</button>
			</div>
		{/if}

		{#if data.nextCursor}
			<div class="mt-5 flex justify-center">
				<a
					class="btn btn-outline"
					href={resolve(
						`/family/${data.familyId}/documents${folderQuery(data.selectedFolder ?? undefined, data.nextCursor)}`
					)}
				>
					Ver documentos anteriores
				</a>
			</div>
		{/if}
	</section>
</div>
