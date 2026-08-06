<script lang="ts">
	import type { Tables } from '$lib/types/database';
	import type { ExpenseFilterState, ExpensePeriod } from '$lib/server/expenses/filters';
	import type { ExpenseMember } from '$lib/server/expenses/queries';

	interface Props {
		filters: ExpenseFilterState;
		members: ExpenseMember[];
		categories: Tables<'expense_categories'>[];
		exportHref: string;
	}

	let { filters, members, categories, exportHref }: Props = $props();
	let overrides = $state<{
		period?: ExpensePeriod['preset'];
		anchor?: string;
		from?: string;
		to?: string;
		payer?: string;
		category?: string;
	}>({});

	function anchor(period: ExpensePeriod): string {
		return period.preset === 'custom' ? period.from : period.anchor;
	}

	const selectedPeriod = $derived(overrides.period ?? filters.period.preset);
	const selectedAnchor = $derived(overrides.anchor ?? anchor(filters.period));
	const selectedFrom = $derived(overrides.from ?? filters.from);
	const selectedTo = $derived(overrides.to ?? filters.to);
	const selectedPayer = $derived(overrides.payer ?? filters.paidBy ?? '');
	const selectedCategory = $derived(overrides.category ?? filters.categoryId ?? '');
</script>

<section
	class="rounded-box border border-base-300 bg-base-100 p-4"
	aria-labelledby="expense-filters-title"
>
	<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
		<div>
			<h2 id="expense-filters-title" class="font-semibold">Intervalo y filtros</h2>
			<p class="text-xs text-base-content/55">
				Las fechas se interpretan como días locales, sin conversión horaria.
			</p>
		</div>
		<a class="btn btn-ghost btn-sm" href={exportHref} data-testid="expenses-export">Exportar CSV</a>
	</div>
	<form method="GET" class="grid gap-3 md:grid-cols-2 xl:grid-cols-6 xl:items-end">
		<label class="form-control" for="expense-filter-period">
			<span class="label-text mb-1 text-xs font-medium">Periodo</span>
			<select
				id="expense-filter-period"
				class="select-bordered select select-sm"
				name="period"
				value={selectedPeriod}
				onchange={(event) =>
					(overrides.period = event.currentTarget.value as ExpensePeriod['preset'])}
				data-testid="expenses-filter-period"
			>
				<option value="month">Mes</option><option value="quarter">Trimestre</option><option
					value="year">Año</option
				><option value="custom">Personalizado</option>
			</select>
		</label>
		<label class="form-control" for="expense-filter-anchor">
			<span class="label-text mb-1 text-xs font-medium">Fecha de referencia</span>
			<input
				id="expense-filter-anchor"
				class="input-bordered input input-sm"
				name="anchor"
				type="date"
				value={selectedAnchor}
				oninput={(event) => (overrides.anchor = event.currentTarget.value)}
			/>
		</label>
		<label class="form-control" for="expense-filter-from">
			<span class="label-text mb-1 text-xs font-medium"
				>Desde <span class="font-normal opacity-50">(personalizado)</span></span
			>
			<input
				id="expense-filter-from"
				class="input-bordered input input-sm"
				name="from"
				type="date"
				value={selectedFrom}
				oninput={(event) => (overrides.from = event.currentTarget.value)}
			/>
		</label>
		<label class="form-control" for="expense-filter-to">
			<span class="label-text mb-1 text-xs font-medium"
				>Hasta <span class="font-normal opacity-50">(personalizado)</span></span
			>
			<input
				id="expense-filter-to"
				class="input-bordered input input-sm"
				name="to"
				type="date"
				value={selectedTo}
				oninput={(event) => (overrides.to = event.currentTarget.value)}
			/>
		</label>
		<label class="form-control" for="expense-filter-payer">
			<span class="label-text mb-1 text-xs font-medium">Pagador</span>
			<select
				id="expense-filter-payer"
				class="select-bordered select select-sm"
				name="paid_by"
				value={selectedPayer}
				onchange={(event) => (overrides.payer = event.currentTarget.value)}
				data-testid="expenses-filter-payer"
			>
				<option value="">Todos</option>
				{#each members.filter((member) => member.status === 'active') as member (member.userId)}<option
						value={member.userId}>{member.profile.displayName}</option
					>{/each}
			</select>
		</label>
		<label class="form-control" for="expense-filter-category">
			<span class="label-text mb-1 text-xs font-medium">Categoría</span>
			<select
				id="expense-filter-category"
				class="select-bordered select select-sm"
				name="category"
				value={selectedCategory}
				onchange={(event) => (overrides.category = event.currentTarget.value)}
				data-testid="expenses-filter-category"
			>
				<option value="">Todas</option>
				{#each categories as category (category.id)}<option value={category.id}
						>{category.name}</option
					>{/each}
			</select>
		</label>
		<div class="flex justify-end gap-2 md:col-span-2 xl:col-span-6">
			<a class="btn btn-ghost btn-sm" href="?">Limpiar</a>
			<button class="btn btn-sm btn-primary" type="submit">Aplicar filtros</button>
		</div>
	</form>
</section>
