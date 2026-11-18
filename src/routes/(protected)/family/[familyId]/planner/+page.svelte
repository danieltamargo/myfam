<script lang="ts">
	import * as messages from '$paraglide/messages';
	import PlannerOverview from '$lib/components/planner/PlannerOverview.svelte';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

<svelte:head>
	<title>{messages['details.planner_for']()} {data.family.name} · MyFamily</title>
	<meta
		name="description"
		content={`Agenda, tareas, listas y gastos accesibles de ${data.family.name}.`}
	/>
</svelte:head>

<div class="mx-auto max-w-6xl space-y-6 py-2 sm:py-4">
	<header>
		<p class="text-sm font-semibold text-primary">{messages['screen.your_family_today_102']()}</p>
		<h1 class="mt-1 text-3xl font-bold break-words sm:text-4xl">
			{messages['details.planner_for']()}
			{data.family.name}
		</h1>
		<p class="mt-2 max-w-2xl text-base-content/65">
			{messages['screen.see_what_needs_your_attention_and_what_s_coming_up']()}
		</p>
	</header>

	<PlannerOverview familyId={data.familyId} familyName={data.family.name} planner={data.planner} />
</div>
