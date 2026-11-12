<script lang="ts">
	import { browser } from '$app/environment';
	import { invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { untrack } from 'svelte';
	import { startCalendarAutoSync, type CalendarAutoSyncState } from '$lib/calendar/auto-sync';

	let {
		familyId,
		enabled,
		connectionKey
	}: { familyId: string; enabled: boolean; connectionKey: string } = $props();
	let state = $state<CalendarAutoSyncState>({ syncing: false, message: '', errors: [] });
	const syncIdentity = $derived(`${familyId}:${enabled}:${connectionKey}`);

	$effect(() => {
		const identity = syncIdentity;
		return untrack(() => {
			if (!browser || !enabled || !identity) return;
			return startCalendarAutoSync({
				endpoint: resolve(`/family/${encodeURIComponent(familyId)}/calendar/sync` as '/'),
				invalidate: () => invalidate('app:calendar'),
				onState: (nextState) => (state = nextState)
			});
		});
	});
</script>

{#if enabled}
	<div role="status" aria-live="polite" aria-atomic="true" class="space-y-1 text-sm">
		<p>
			{state.message ||
				'Sincronización automática cada dos minutos mientras el calendario esté abierto.'}
		</p>
		{#each state.errors as error (error)}
			<p class="text-error">{error}</p>
		{/each}
	</div>
{/if}
