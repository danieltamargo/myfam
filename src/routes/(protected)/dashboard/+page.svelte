<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import PlannerOverview from '$lib/components/planner/PlannerOverview.svelte';
	import type { ActionData, PageData } from './$types';

	interface Props {
		data: PageData;
		form: ActionData;
	}

	let { data, form }: Props = $props();
</script>

<svelte:head>
	<title>Inicio familiar · MyFamily</title>
	<meta name="description" content="Agenda y actividad de tu familia en un único lugar." />
</svelte:head>

<div class="container mx-auto max-w-6xl space-y-7 p-4 py-6 sm:p-8">
	<header class="flex flex-wrap items-end justify-between gap-4">
		<div>
			<p class="text-sm font-semibold text-primary">Tu día en familia</p>
			<h1 class="mt-1 text-3xl font-bold sm:text-4xl">Hola de nuevo</h1>
			<p class="mt-2 text-base-content/65">Lo importante de hoy, sin cambiar de contexto.</p>
		</div>
		<a class="btn btn-ghost btn-sm" href={resolve('/families')}>Gestionar familias</a>
	</header>

	{#if form?.message}
		<div class={`alert ${form.success ? 'alert-success' : 'alert-error'}`} role="status">
			<span>{form.message}</span>
		</div>
	{/if}

	{#if data.invitations.length > 0}
		<section aria-labelledby="pending-invitations-title" class="space-y-3">
			<div class="flex items-center gap-2">
				<h2 id="pending-invitations-title" class="text-xl font-bold">Invitaciones pendientes</h2>
				<span class="badge badge-primary">{data.invitations.length}</span>
			</div>
			<div class="grid gap-3 md:grid-cols-2">
				{#each data.invitations as invitation (invitation.id)}
					<article class="card border border-primary/30 bg-primary/5">
						<div class="card-body gap-3 p-4">
							<div>
								<h3 class="font-semibold">
									{invitation.family?.alias ?? invitation.family?.name ?? 'Familia'}
								</h3>
								<p class="text-sm text-base-content/65">
									Invitación de {invitation.invitedBy?.display_name?.trim() || 'un familiar'}
								</p>
							</div>
							<div class="card-actions justify-end">
								<form method="POST" action="?/rejectInvitation" use:enhance>
									<input type="hidden" name="invitation_id" value={invitation.id} />
									<button type="submit" class="btn btn-ghost btn-sm">Rechazar</button>
								</form>
								<form method="POST" action="?/acceptInvitation" use:enhance>
									<input type="hidden" name="invitation_id" value={invitation.id} />
									<button type="submit" class="btn btn-sm btn-primary">Aceptar</button>
								</form>
							</div>
						</div>
					</article>
				{/each}
			</div>
		</section>
	{/if}

	{#if data.activeFamily && data.planner}
		<section class="rounded-box border border-base-300 bg-base-200/50 p-4 sm:p-6">
			{#if data.families.length > 1}
				<nav aria-label="Tus familias" class="mb-5 flex gap-2 overflow-x-auto pb-1">
					{#each data.families as family (family.id)}
						<a
							class={`btn shrink-0 btn-sm ${family.id === data.activeFamily.id ? 'btn-primary' : 'btn-ghost'}`}
							href={resolve(`/family/${encodeURIComponent(family.id)}/planner`)}
							aria-current={family.id === data.activeFamily.id ? 'page' : undefined}
						>
							{family.name}
						</a>
					{/each}
				</nav>
			{/if}
			<PlannerOverview
				familyId={data.activeFamily.id}
				familyName={data.activeFamily.name}
				planner={data.planner}
				showFamilyName
			/>
		</section>
	{:else if data.plannerError}
		<div class="alert alert-error" role="alert">
			<span>No se pudo cargar el resumen familiar.</span>
			<a class="btn btn-sm" href={resolve('/dashboard')}>Reintentar</a>
		</div>
	{:else}
		<section class="card border border-base-300 bg-base-100">
			<div class="card-body items-center py-12 text-center">
				<span aria-hidden="true" class="text-5xl">🏡</span>
				<h2 class="mt-2 card-title text-2xl">Crea tu primera familia</h2>
				<p class="max-w-md text-base-content/65">
					El planner se completará con los módulos y la información que decidáis compartir.
				</p>
				<a class="btn mt-3 btn-primary" href={resolve('/families')}>Empezar</a>
			</div>
		</section>
	{/if}

	<footer class="flex flex-wrap gap-2 border-t border-base-300 pt-5 text-sm">
		<a class="link link-hover" href={resolve('/families')}>Todas las familias</a>
		<span aria-hidden="true" class="text-base-content/30">·</span>
		<a class="link link-hover" href={resolve('/profile')}>Preferencias de perfil</a>
	</footer>
</div>
