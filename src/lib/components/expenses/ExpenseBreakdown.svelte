<script lang="ts">
	import type { ExpenseDashboard } from '$lib/server/expenses/queries';

	interface Props {
		dashboard: ExpenseDashboard;
		currency: string;
		granularity: 'day' | 'month';
	}

	let { dashboard, currency, granularity }: Props = $props();

	function money(value: number): string {
		return new Intl.NumberFormat('es-ES', {
			style: 'currency',
			currency,
			maximumFractionDigits: 0
		}).format(value);
	}

	function percentage(value: number, total: number): number {
		return total <= 0 ? 0 : Math.max(2, (value / total) * 100);
	}

	function seriesHeight(value: number): number {
		const maximum = Math.max(...dashboard.series.map((point) => point.total), 0);
		return maximum <= 0 ? 0 : Math.max(6, (value / maximum) * 100);
	}

	function periodLabel(value: string): string {
		const [year, month, day] = value.split('-');
		return granularity === 'month' ? `${month}/${year.slice(2)}` : `${day}/${month}`;
	}
</script>

<section class="grid gap-4 lg:grid-cols-2" aria-label="Desgloses del gasto">
	<div class="card bg-base-100 card-border">
		<div class="card-body gap-4">
			<h2 class="card-title text-lg">Por categoría</h2>
			{#if dashboard.byCategory.length === 0}<p class="text-sm text-base-content/50">
					No hay datos en este intervalo.
				</p>{/if}
			{#each dashboard.byCategory as item (item.id)}
				<div>
					<div class="mb-1 flex items-center justify-between gap-3 text-sm">
						<span class="inline-flex items-center gap-2"
							><span class="size-2 rounded-full" style:background-color={item.color ?? '#64748B'}
							></span>{item.label}</span
						><span class="font-mono font-medium">{money(item.total)}</span>
					</div>
					<div class="h-2 overflow-hidden rounded-full bg-base-200">
						<div
							class="h-full rounded-full bg-primary"
							style:width={`${percentage(item.total, dashboard.currentTotal)}%`}
						></div>
					</div>
				</div>
			{/each}
		</div>
	</div>
	<div class="card bg-base-100 card-border">
		<div class="card-body gap-4">
			<h2 class="card-title text-lg">Por pagador</h2>
			{#if dashboard.byPayer.length === 0}<p class="text-sm text-base-content/50">
					No hay datos en este intervalo.
				</p>{/if}
			{#each dashboard.byPayer as item (item.id)}
				<div>
					<div class="mb-1 flex items-center justify-between gap-3 text-sm">
						<span>{item.label}</span><span class="font-mono font-medium">{money(item.total)}</span>
					</div>
					<div class="h-2 overflow-hidden rounded-full bg-base-200">
						<div
							class="h-full rounded-full bg-secondary"
							style:width={`${percentage(item.total, dashboard.currentTotal)}%`}
						></div>
					</div>
				</div>
			{/each}
		</div>
	</div>
	<div class="card bg-base-100 card-border lg:col-span-2">
		<div class="card-body gap-4">
			<div>
				<h2 class="card-title text-lg">Evolución</h2>
				<p class="text-xs text-base-content/50">
					Agrupación {granularity === 'month' ? 'mensual' : 'diaria'}; los días sin gasto se omiten.
				</p>
			</div>
			{#if dashboard.series.length === 0}
				<div
					class="grid h-36 place-items-center rounded-box bg-base-200/50 text-sm text-base-content/50"
				>
					Sin movimientos
				</div>
			{:else}
				<div
					class="flex h-44 items-end gap-2 overflow-x-auto border-b border-base-300 px-1 pt-6"
					role="img"
					aria-label="Evolución del gasto del periodo"
				>
					{#each dashboard.series as point (point.period)}
						<div
							class="group flex h-full min-w-8 flex-1 flex-col items-center justify-end gap-2"
							title={`${periodLabel(point.period)}: ${money(point.total)}`}
						>
							<span class="text-[10px] font-medium opacity-0 transition group-hover:opacity-100"
								>{money(point.total)}</span
							>
							<div
								class="w-full max-w-12 rounded-t bg-primary/75"
								style:height={`${seriesHeight(point.total)}%`}
							></div>
							<span class="pb-2 font-mono text-[10px] text-base-content/50"
								>{periodLabel(point.period)}</span
							>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</section>
