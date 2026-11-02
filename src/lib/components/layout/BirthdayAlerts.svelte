<script lang="ts">
	import { resolve } from '$app/paths';
	import type { BirthdayAlert } from '$lib/birthdays/upcoming';

	let { alerts, errorMessage = '' }: { alerts: BirthdayAlert[]; errorMessage?: string } = $props();
	const dateFormatter = new Intl.DateTimeFormat('es-ES', {
		day: 'numeric',
		month: 'long',
		timeZone: 'UTC'
	});
</script>

{#if errorMessage}
	<p role="status" class="mb-4 rounded-box border border-base-300 p-3 text-sm">{errorMessage}</p>
{:else if alerts.length}
	<aside aria-label="Cumpleaños próximos" class="mb-4 rounded-box border border-base-300 p-4">
		<h2 class="font-semibold">Cumpleaños próximos</h2>
		<ul class="mt-2 divide-y divide-base-300">
			{#each alerts as alert (alert.userId)}
				<li
					class="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
				>
					<p class="min-w-0 break-words">
						<span class="font-semibold">{alert.displayName}</span>:
						{alert.daysUntil === 0
							? 'hoy'
							: alert.daysUntil === 1
								? 'mañana'
								: `en ${alert.daysUntil} días`}
						<time datetime={alert.date}
							>({dateFormatter.format(new Date(`${alert.date}T00:00:00Z`))})</time
						>
					</p>
					<a
						class="shrink-0 link text-primary"
						href={resolve(...([alert.wishlistHref] as unknown as ['/']))}
						aria-label={`Ver wishlist de ${alert.displayName}`}>Ver wishlist</a
					>
				</li>
			{/each}
		</ul>
	</aside>
{/if}
