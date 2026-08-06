<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const activeCollections = $derived(
		data.collections.filter((collection) => !collection.archivedAt)
	);
	const archivedCollections = $derived(
		data.collections.filter((collection) => collection.archivedAt)
	);

	function roleLabel(role: string): string {
		return (
			{
				owner: 'Propietario',
				manager: 'Gestor',
				contributor: 'Colaborador',
				viewer: 'Solo lectura'
			}[role] ?? role
		);
	}
</script>

<svelte:head>
	<title>Gastos · MyFamily</title>
	<meta
		name="description"
		content="Colecciones privadas para organizar los gastos de tu familia."
	/>
</svelte:head>

<div class="mx-auto max-w-6xl space-y-8 pb-12">
	<header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<p class="mb-2 text-sm font-semibold tracking-wide text-primary uppercase">
				Economía familiar
			</p>
			<h1 class="text-3xl font-bold tracking-tight sm:text-4xl">Gastos</h1>
			<p class="mt-2 max-w-2xl text-base-content/65">
				Separa viajes, hogares o proyectos y decide quién puede ver o editar cada colección.
			</p>
		</div>
		<a class="btn btn-primary" href="#nueva-coleccion">Nueva colección</a>
	</header>

	{#if form?.error}
		<div class="alert alert-error" role="alert"><span>{form.error}</span></div>
	{/if}

	{#if data.invitations.length > 0}
		<section aria-labelledby="invitaciones-gastos" class="space-y-3">
			<div>
				<p class="text-xs font-semibold tracking-widest text-primary uppercase">Acción pendiente</p>
				<h2 id="invitaciones-gastos" class="mt-1 text-xl font-semibold">Invitaciones</h2>
			</div>
			{#each data.invitations as invitation (invitation.collectionId)}
				<div class="alert items-start alert-info sm:items-center">
					<div class="min-w-0 flex-1">
						<p class="font-semibold">{invitation.collectionName}</p>
						<p class="text-sm opacity-80">
							Te invitan como {roleLabel(invitation.role)}
							{#if invitation.description}
								· {invitation.description}{/if}
						</p>
					</div>
					<form method="POST" action="?/acceptInvitation">
						<input type="hidden" name="collection_id" value={invitation.collectionId} />
						<button class="btn btn-sm btn-primary" type="submit">Aceptar</button>
					</form>
				</div>
			{/each}
		</section>
	{/if}

	<section aria-labelledby="colecciones-activas" class="space-y-4">
		<div class="flex items-end justify-between gap-4">
			<div>
				<p class="text-xs font-semibold tracking-widest text-base-content/45 uppercase">
					Tu espacio
				</p>
				<h2 id="colecciones-activas" class="mt-1 text-xl font-semibold">Colecciones activas</h2>
			</div>
			<span class="badge badge-ghost">{activeCollections.length}</span>
		</div>

		{#if activeCollections.length === 0}
			<div class="rounded-box border border-dashed border-base-300 bg-base-100 p-8 text-center">
				<div class="text-4xl" aria-hidden="true">🧾</div>
				<h3 class="mt-3 text-lg font-semibold">Todavía no hay gastos compartidos</h3>
				<p class="mt-1 text-sm text-base-content/60">
					Crea una colección privada y añade solo a las personas que la necesiten.
				</p>
			</div>
		{:else}
			<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
				{#each activeCollections as collection (collection.id)}
					<a
						href={`/family/${data.family.id}/expenses/${collection.id}`}
						class="card bg-base-100 transition card-border hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
					>
						<div class="card-body gap-4">
							<div class="flex items-start justify-between gap-3">
								<div
									class="grid size-11 place-items-center rounded-box bg-primary/10 text-xl"
									aria-hidden="true"
								>
									💶
								</div>
								<span class="badge badge-soft badge-primary">{roleLabel(collection.role)}</span>
							</div>
							<div>
								<h3 class="card-title">{collection.name}</h3>
								<p class="mt-1 line-clamp-2 text-sm text-base-content/60">
									{collection.description ?? 'Sin descripción'}
								</p>
							</div>
							<div class="card-actions items-center justify-between border-t border-base-200 pt-4">
								<span class="font-mono text-xs text-base-content/50">{collection.currency}</span>
								<span class="text-sm font-semibold text-primary">Abrir →</span>
							</div>
						</div>
					</a>
				{/each}
			</div>
		{/if}
	</section>

	<section
		id="nueva-coleccion"
		aria-labelledby="crear-coleccion"
		class="card bg-base-100 card-border"
	>
		<div class="card-body gap-6">
			<div>
				<p class="text-xs font-semibold tracking-widest text-primary uppercase">Nuevo espacio</p>
				<h2 id="crear-coleccion" class="mt-1 text-xl font-semibold">Crear colección</h2>
				<p class="mt-1 text-sm text-base-content/60">
					Serás su propietario. Después podrás invitar participantes con permisos independientes.
				</p>
			</div>
			<form method="POST" action="?/createCollection" class="grid gap-4 md:grid-cols-6">
				<label class="form-control md:col-span-3" for="expense-collection-name">
					<span class="label-text mb-2 font-medium">Nombre</span>
					<input
						id="expense-collection-name"
						class="input-bordered input w-full"
						name="name"
						maxlength="80"
						required
						placeholder="Viaje de verano"
					/>
				</label>
				<label class="form-control md:col-span-1" for="expense-collection-currency">
					<span class="label-text mb-2 font-medium">Moneda</span>
					<select
						id="expense-collection-currency"
						class="select-bordered select w-full"
						name="currency"
					>
						<option value="EUR">EUR</option>
						<option value="USD">USD</option>
						<option value="GBP">GBP</option>
					</select>
				</label>
				<label class="form-control md:col-span-6" for="expense-collection-description">
					<span class="label-text mb-2 font-medium"
						>Descripción <span class="font-normal opacity-50">(opcional)</span></span
					>
					<textarea
						id="expense-collection-description"
						class="textarea-bordered textarea min-h-24 w-full"
						name="description"
						maxlength="2000"
						placeholder="Qué gastos queréis organizar aquí"
					></textarea>
				</label>
				<div class="md:col-span-6 md:justify-self-end">
					<button class="btn btn-primary" type="submit">Crear colección</button>
				</div>
			</form>
		</div>
	</section>

	{#if archivedCollections.length > 0}
		<details class="collapse-arrow collapse border border-base-300 bg-base-100">
			<summary class="collapse-title font-semibold"
				>Archivadas ({archivedCollections.length})</summary
			>
			<div class="collapse-content">
				<ul class="divide-y divide-base-200">
					{#each archivedCollections as collection (collection.id)}
						<li class="flex items-center justify-between gap-4 py-3">
							<div>
								<p class="font-medium">{collection.name}</p>
								<p class="text-xs text-base-content/50">
									{collection.currency} · {roleLabel(collection.role)}
								</p>
							</div>
							<a
								class="btn btn-ghost btn-sm"
								href={`/family/${data.family.id}/expenses/${collection.id}`}>Ver</a
							>
						</li>
					{/each}
				</ul>
			</div>
		</details>
	{/if}
</div>
