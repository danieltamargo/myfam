<script lang="ts">
	import type { ExpenseDashboard } from '$lib/server/expenses/queries';

	interface Props {
		dashboard: ExpenseDashboard;
		currency: string;
		from: string;
		to: string;
	}

	let { dashboard, currency, from, to }: Props = $props();

	function money(value: number): string {
		return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(value);
	}

	function compactDate(value: string): string {
		const [, month, day] = value.split('-');
		return `${day}/${month}`;
	}
</script>

<section class="grid gap-3 lg:grid-cols-[1.5fr_1fr]" aria-label="Resumen del periodo">
	<div class="rounded-box bg-neutral p-6 text-neutral-content shadow-sm">
		<p class="text-sm text-neutral-content/65">Total del periodo</p>
		<p class="mt-2 text-4xl font-bold tracking-tight" data-testid="expenses-current-total">
			{money(dashboard.currentTotal)}
		</p>
		<p class="mt-4 font-mono text-xs text-neutral-content/55">
			{compactDate(from)} — {compactDate(to)}
		</p>
	</div>
	<div class="rounded-box border border-base-300 bg-base-100 p-6">
		<p class="text-sm text-base-content/55">Periodo anterior</p>
		<p class="mt-2 text-2xl font-semibold">{money(dashboard.previousTotal)}</p>
		{#if dashboard.changePercent === null}
			<p class="mt-4 text-sm text-base-content/50">Sin base previa para comparar</p>
		{:else}
			<p
				class={`mt-4 text-sm font-medium ${dashboard.changePercent <= 0 ? 'text-success' : 'text-warning'}`}
			>
				{dashboard.changePercent > 0 ? '↑' : '↓'}
				{Math.abs(dashboard.changePercent).toFixed(1)}% frente al periodo anterior
			</p>
		{/if}
	</div>
</section>
