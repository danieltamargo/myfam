<script lang="ts">
	import MemberRadioFilter from '$lib/components/ui/MemberRadioFilter.svelte';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { FamilyNoteRecord } from '$lib/server/notes/queries';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	type EditorMode = 'closed' | 'create' | 'edit';
	let editorMode = $state<EditorMode>('closed');
	let editorTitle = $state('');
	let editorContent = $state('');
	let editorVisibility = $state('private');
	let editorMemberIds = $state<string[]>([]);

	const filters = [
		{ id: 'all', label: 'Recientes' },
		{ id: 'mine', label: 'Mías' },
		{ id: 'shared', label: 'Compartidas' },
		{ id: 'archived', label: 'Archivadas' }
	] as const;

	function beginCreate(): void {
		editorMode = 'create';
		editorTitle = '';
		editorContent = '';
		editorVisibility = 'private';
		editorMemberIds = [];
	}

	function beginEdit(note: FamilyNoteRecord): void {
		editorMode = 'edit';
		editorTitle = note.title;
		editorContent = note.content;
		editorVisibility = note.visibility;
		editorMemberIds = [...note.memberIds];
	}

	function formatDate(value: string): string {
		return new Intl.DateTimeFormat('es-ES', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		}).format(new Date(value));
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

	function excerpt(content: string): string {
		return content.replace(/\s+/g, ' ').trim() || 'Sin contenido';
	}

	function notesQuery(noteId?: string, filter = data.filter): string {
		const params = new SvelteURLSearchParams({ filter });
		if (data.selectedMember) params.set('member', data.selectedMember);
		if (data.search) params.set('search', data.search);
		if (noteId) params.set('note', noteId);
		return params.toString();
	}

	const closeAfterSuccess: SubmitFunction = () => {
		return async ({ update, result }) => {
			await update();
			if (result.type === 'success') editorMode = 'closed';
		};
	};
</script>

<svelte:head>
	<title>Notas seguras · MyFamily</title>
	<meta name="description" content="Notas familiares privadas o compartidas con búsqueda segura." />
</svelte:head>

<div class="mx-auto w-full max-w-7xl space-y-5 px-3 py-4 sm:px-5 sm:py-7">
	<header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div class="max-w-2xl">
			<p class="mb-1 text-sm font-semibold tracking-wide text-primary uppercase">
				Memoria familiar
			</p>
			<h1 class="text-3xl font-bold tracking-tight sm:text-4xl">Notas seguras</h1>
			<p class="mt-2 text-sm text-base-content/65 sm:text-base">
				Guarda ideas y acuerdos con privacidad explícita y búsqueda rápida.
			</p>
		</div>
		<button class="btn btn-primary sm:self-center" type="button" onclick={beginCreate}
			>+ Nueva nota</button
		>
	</header>

	<form method="GET" class="rounded-box border border-base-300 bg-base-100 p-3 sm:p-4">
		<input type="hidden" name="filter" value={data.filter} />
		{#if data.search}<input type="hidden" name="search" value={data.search} />{/if}
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
		<form method="GET" class="flex flex-col gap-2 sm:flex-row">
			<input type="hidden" name="filter" value={data.filter} />
			<input type="hidden" name="member" value={data.selectedMember} />
			<label class="input min-w-0 flex-1">
				<span aria-hidden="true">⌕</span>
				<input
					type="search"
					name="search"
					value={data.search}
					placeholder="Buscar por título o contenido"
					maxlength="100"
					aria-label="Buscar notas"
				/>
			</label>
			<button class="btn btn-neutral" type="submit">Buscar</button>
			{#if data.search}
				<a
					class="btn btn-ghost"
					href={resolve(
						`/family/${data.familyId}/notes?filter=${data.filter}&member=${data.selectedMember}`
					)}>Limpiar</a
				>
			{/if}
		</form>
		<nav aria-label="Filtros de notas" class="tabs-box mt-3 tabs overflow-x-auto">
			{#each filters as filter (filter.id)}
				<a
					class="tab whitespace-nowrap {data.filter === filter.id ? 'tab-active' : ''}"
					href={resolve(`/family/${data.familyId}/notes?${notesQuery(undefined, filter.id)}`)}
					>{filter.label}</a
				>
			{/each}
		</nav>
	</section>

	<div class="grid min-h-[32rem] gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
		<aside class="min-w-0">
			<div class="mb-2 flex items-center justify-between">
				<h2 class="font-bold">Notas</h2>
				<span class="text-xs text-base-content/45">{data.notes.length}</span>
			</div>
			<div class="flex snap-x gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible">
				{#each data.notes as note (note.id)}
					<a
						href={resolve(`/family/${data.familyId}/notes?${notesQuery(note.id)}`)}
						class="min-w-72 snap-start rounded-box border p-4 transition-colors lg:min-w-0 {data.selectedNoteId ===
						note.id
							? 'border-primary bg-primary/8'
							: 'border-base-300 bg-base-100 hover:border-primary/40'}"
					>
						<div class="flex items-start justify-between gap-3">
							<h3 class="line-clamp-1 font-semibold">{note.title}</h3>
							<span class="badge shrink-0 badge-ghost badge-sm"
								>{note.visibility === 'private' ? '🔒' : '👥'}</span
							>
						</div>
						<p class="mt-2 line-clamp-2 text-sm text-base-content/55">{excerpt(note.content)}</p>
						<p class="mt-3 text-xs text-base-content/45">{formatDate(note.updated_at)}</p>
					</a>
				{/each}
				{#if data.notes.length === 0}
					<div
						class="min-w-full rounded-box border border-dashed border-base-300 p-6 text-center text-sm text-base-content/55"
					>
						No hay notas que coincidan.
					</div>
				{/if}
			</div>
		</aside>

		<main class="min-w-0">
			{#if editorMode !== 'closed'}
				<section class="rounded-box border border-base-300 bg-base-100 p-4 sm:p-6">
					<div class="mb-5 flex items-start justify-between gap-3">
						<div>
							<p class="text-xs font-semibold tracking-wide text-primary uppercase">
								{editorMode === 'create' ? 'Nueva nota' : 'Editar nota'}
							</p>
							<h2 class="mt-1 text-2xl font-bold">
								{editorMode === 'create'
									? 'Escribe algo que merezca quedarse'
									: 'Actualiza la nota'}
							</h2>
						</div>
						<button
							class="btn btn-circle btn-ghost btn-sm"
							type="button"
							onclick={() => (editorMode = 'closed')}
							aria-label="Cerrar editor">×</button
						>
					</div>
					<form
						method="POST"
						action={editorMode === 'create' ? '?/createNote' : '?/updateNote'}
						use:enhance={closeAfterSuccess}
						class="space-y-4"
					>
						{#if editorMode === 'edit' && data.selectedNote}
							<input type="hidden" name="note_id" value={data.selectedNote.id} />
							<input type="hidden" name="version" value={data.selectedNote.version} />
						{/if}
						<label class="form-control">
							<span class="label-text mb-1 font-medium">Título</span>
							<input
								class="input w-full"
								name="title"
								maxlength="160"
								required
								bind:value={editorTitle}
							/>
						</label>
						<label class="form-control">
							<span class="label-text mb-1 font-medium">Texto / Markdown</span>
							<textarea
								class="textarea min-h-64 w-full font-mono text-sm leading-relaxed"
								name="content"
								maxlength="20000"
								placeholder="Escribe texto o Markdown. El HTML se mostrará como texto, nunca se ejecutará."
								bind:value={editorContent}
							></textarea>
						</label>
						<label class="form-control">
							<span class="label-text mb-1 font-medium">Visibilidad</span>
							<select class="select w-full" name="visibility" bind:value={editorVisibility}>
								<option value="private">Solo yo</option>
								<option value="selected_members">Personas seleccionadas</option>
								<option value="family">Toda la familia</option>
							</select>
						</label>
						{#if editorVisibility === 'selected_members'}
							<fieldset>
								<legend class="mb-2 font-medium">Quién puede leerla</legend>
								<div class="grid gap-2 sm:grid-cols-2">
									{#each data.members.filter((member) => member.id !== data.currentUserId) as member (member.id)}
										<label
											class="flex min-h-11 cursor-pointer items-center gap-3 rounded-field border border-base-300 px-3 py-2"
										>
											<input
												class="checkbox checkbox-sm checkbox-primary"
												type="checkbox"
												name="member_ids"
												value={member.id}
												bind:group={editorMemberIds}
											/>
											<span class="truncate text-sm">{member.displayName}</span>
										</label>
									{/each}
								</div>
							</fieldset>
						{/if}
						<div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
							<button class="btn btn-ghost" type="button" onclick={() => (editorMode = 'closed')}
								>Cancelar</button
							>
							<button class="btn btn-primary" type="submit"
								>{editorMode === 'create' ? 'Crear nota' : 'Guardar cambios'}</button
							>
						</div>
					</form>
				</section>
			{:else if data.selectedNote}
				<article class="rounded-box border border-base-300 bg-base-100 p-5 sm:p-8">
					<header
						class="flex flex-col gap-4 border-b border-base-300 pb-5 sm:flex-row sm:items-start sm:justify-between"
					>
						<div class="min-w-0">
							<div class="flex flex-wrap items-center gap-2">
								<h2 class="text-2xl font-bold sm:text-3xl">{data.selectedNote.title}</h2>
								<span class="badge badge-outline badge-sm"
									>{visibilityLabel(data.selectedNote.visibility)}</span
								>
								{#if data.selectedNote.archived_at}<span
										class="badge badge-soft badge-sm badge-warning">Archivada</span
									>{/if}
							</div>
							<p class="mt-2 text-xs text-base-content/50">
								Por {data.selectedNote.creatorName} · Actualizada {formatDate(
									data.selectedNote.updated_at
								)}
							</p>
						</div>
						{#if data.selectedNote.canEdit}
							<div class="flex gap-2">
								<button
									class="btn btn-sm btn-primary"
									type="button"
									onclick={() => beginEdit(data.selectedNote!)}>Editar</button
								>
								<form method="POST" action="?/setArchived" use:enhance>
									<input type="hidden" name="note_id" value={data.selectedNote.id} />
									<input type="hidden" name="version" value={data.selectedNote.version} />
									<input
										type="hidden"
										name="archived"
										value={data.selectedNote.archived_at ? 'false' : 'true'}
									/>
									<button class="btn btn-ghost btn-sm" type="submit"
										>{data.selectedNote.archived_at ? 'Restaurar' : 'Archivar'}</button
									>
								</form>
							</div>
						{/if}
					</header>
					<div class="min-h-64 py-7">
						{#if data.selectedNote.content}
							<p class="text-[0.98rem] leading-7 break-words whitespace-pre-wrap">
								{data.selectedNote.content}
							</p>
						{:else}
							<p class="text-base-content/45 italic">Esta nota no tiene contenido.</p>
						{/if}
					</div>
					{#if data.selectedNote.memberIds.length > 0}
						<footer class="border-t border-base-300 pt-4">
							<p class="mb-2 text-xs font-semibold tracking-wide text-base-content/45 uppercase">
								Compartida con
							</p>
							<div class="flex flex-wrap gap-2">
								{#each data.selectedNote.memberIds as memberId (memberId)}
									<span class="badge badge-ghost"
										>{data.members.find((member) => member.id === memberId)?.displayName ??
											'Usuario'}</span
									>
								{/each}
							</div>
						</footer>
					{/if}
				</article>
			{:else}
				<section class="rounded-box border border-dashed border-base-300 px-6 py-20 text-center">
					<p class="text-4xl" aria-hidden="true">✎</p>
					<h2 class="mt-3 text-xl font-bold">Tu espacio empieza aquí</h2>
					<p class="mt-1 text-sm text-base-content/55">
						Crea una nota privada y compártela solo cuando quieras.
					</p>
					<button class="btn mt-5 btn-primary" type="button" onclick={beginCreate}
						>Crear primera nota</button
					>
				</section>
			{/if}
		</main>
	</div>
</div>
