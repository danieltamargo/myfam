<script lang="ts">
	import PlannerOverview from '$lib/components/planner/PlannerOverview.svelte';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

<svelte:head>
	<title>Planner de {data.family.name} · MyFamily</title>
	<meta
		name="description"
		content={`Agenda, tareas, listas y gastos accesibles de ${data.family.name}.`}
	/>
</svelte:head>

<div class="mx-auto max-w-6xl space-y-6 py-2 sm:py-4">
	<header>
		<p class="text-sm font-semibold text-primary">Hoy en familia</p>
		<h1 class="mt-1 text-3xl font-bold break-words sm:text-4xl">Planner de {data.family.name}</h1>
		<p class="mt-2 max-w-2xl text-base-content/65">
			Lo que necesita atención y lo que viene después, reunido sin duplicar tus datos.
		</p>
	</header>

	<PlannerOverview familyId={data.familyId} familyName={data.family.name} planner={data.planner} />
</div>
