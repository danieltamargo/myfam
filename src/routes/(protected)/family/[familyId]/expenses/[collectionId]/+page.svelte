<script lang="ts">
	import { resolve } from '$app/paths';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import type { ActionData, PageData } from './$types';
	import ExpenseBreakdown from '$lib/components/expenses/ExpenseBreakdown.svelte';
	import ExpenseFilters from '$lib/components/expenses/ExpenseFilters.svelte';
	import ExpenseSplitEditor from '$lib/components/expenses/ExpenseSplitEditor.svelte';
	import ExpenseSummary from '$lib/components/expenses/ExpenseSummary.svelte';
	import ExpenseTable from '$lib/components/expenses/ExpenseTable.svelte';
	import RecurringExpenseForm from '$lib/components/expenses/RecurringExpenseForm.svelte';
	import ExpenseSettlements from '$lib/components/expenses/ExpenseSettlements.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let createAmount = $state('');
	const activeMembers = $derived(data.members.filter((member) => member.status === 'active'));
	const expenseDate = $derived(
		data.filters.period.preset === 'custom' ? data.filters.to : data.filters.period.anchor
	);

	function filterParams(cursor?: string): string {
		const params = new SvelteURLSearchParams();
		params.set('period', data.filters.period.preset);
		if (data.filters.period.preset === 'custom') {
			params.set('from', data.filters.period.from);
			params.set('to', data.filters.period.to);
		} else params.set('anchor', data.filters.period.anchor);
		if (data.filters.paidBy) params.set('paid_by', data.filters.paidBy);
		if (data.filters.categoryId) params.set('category', data.filters.categoryId);
		if (cursor) params.set('cursor', cursor);
		return params.toString();
	}

	const exportHref = $derived(
		`/family/${data.family.id}/expenses/${data.collection.id}/export?${filterParams()}`
	);

	function money(value: number | string): string {
		return new Intl.NumberFormat('es-ES', {
			style: 'currency',
			currency: data.collection.currency
		}).format(Number(value));
	}

	function localDate(value: string): string {
		const [year, month, day] = value.split('-').map(Number);
		return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }).format(
			new Date(year, month - 1, day)
		);
	}

	function memberName(userId: string): string {
		return (
			data.members.find((member) => member.userId === userId)?.profile.displayName ?? 'Participante'
		);
	}
</script>

<svelte:head>
	<title>{data.collection.name} · Gastos · MyFamily</title>
	<meta name="description" content={`Panel temporal de gastos de ${data.collection.name}.`} />
</svelte:head>

<div class="mx-auto max-w-7xl space-y-6 pb-12">
	<nav class="breadcrumbs text-sm text-base-content/60" aria-label="Ruta de navegación">
		<ul>
			<li><a href={resolve(`/family/${data.family.id}/expenses` as '/')}>Gastos</a></li>
			<li>{data.collection.name}</li>
		</ul>
	</nav>

	<header
		class="flex flex-col gap-5 border-b border-base-200 pb-6 lg:flex-row lg:items-end lg:justify-between"
	>
		<div class="min-w-0">
			<div class="flex flex-wrap items-center gap-2">
				<h1 class="truncate text-3xl font-bold tracking-tight sm:text-4xl">
					{data.collection.name}
				</h1>
				{#if data.collection.archivedAt}<span class="badge badge-neutral">Archivada</span>{/if}
			</div>
			<p class="mt-2 max-w-2xl text-base-content/60">
				{data.collection.description ?? 'Registro compartido de gastos.'}
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<a
				class="btn btn-ghost"
				href={resolve(`/family/${data.family.id}/expenses/${data.collection.id}/settings` as '/')}
				>Ajustes</a
			>
			{#if data.canCreate}<a class="btn btn-primary" href="#nuevo-gasto">Añadir gasto</a>{/if}
		</div>
	</header>

	{#if form?.error}<div class="alert alert-error" role="alert">
			<span>{form.error}</span>
		</div>{:else if form?.message && !('settlementRecorded' in form && form.settlementRecorded)}<div
			class="alert alert-success"
			role="status"
		>
			<span>{form.message}</span>
		</div>{/if}

	{#key `${data.collection.id}:${filterParams()}`}
		<ExpenseFilters
			filters={data.filters}
			members={data.members}
			categories={data.categories}
			{exportHref}
			collectionHref={`/family/${data.family.id}/expenses/${data.collection.id}`}
		/>
	{/key}
	<ExpenseSummary
		dashboard={data.dashboard}
		currency={data.collection.currency}
		from={data.filters.from}
		to={data.filters.to}
	/>
	<ExpenseBreakdown
		dashboard={data.dashboard}
		currency={data.collection.currency}
		granularity={data.filters.granularity}
	/>

	<section aria-labelledby="balances" class="space-y-3">
		<div>
			<p class="text-xs font-semibold tracking-widest text-base-content/45 uppercase">Reparto</p>
			<h2 id="balances" class="mt-1 text-xl font-semibold">Balance informativo</h2>
			<p class="mt-1 text-sm text-base-content/55">
				Calculado para el periodo seleccionado; no representa pagos ni liquidaciones.
			</p>
		</div>
		<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
			{#each data.balances as balance (balance.userId)}
				<article class="rounded-box border border-base-300 bg-base-100 p-4">
					<div class="flex items-start justify-between gap-3">
						<h3 class="truncate font-semibold">{balance.label}</h3>
						<span
							class="badge badge-sm {balance.balance > 0
								? 'badge-success'
								: balance.balance < 0
									? 'badge-warning'
									: 'badge-ghost'}"
						>
							{balance.balance > 0 ? 'A favor' : balance.balance < 0 ? 'Debe' : 'Cuadrado'}
						</span>
					</div>
					<p class="mt-3 font-mono text-xl font-semibold">{money(Math.abs(balance.balance))}</p>
					<p class="mt-2 text-xs text-base-content/50">
						Pagó {money(balance.paid)} · Le corresponde {money(balance.owed)}
					</p>
				</article>
			{/each}
		</div>
	</section>

	{#key data.collection.id}
		<ExpenseSettlements
			suggestions={data.settlementSuggestions}
			warning={data.settlementWarning}
			serverMessage={form && 'settlementRecorded' in form && form.settlementRecorded
				? form.message
				: null}
			settlements={data.settlements}
			currency={data.collection.currency}
			actionQuery={filterParams()}
		/>
	{/key}

	<section aria-labelledby="movimientos" class="space-y-3">
		<div class="flex items-end justify-between gap-4">
			<div>
				<p class="text-xs font-semibold tracking-widest text-base-content/45 uppercase">Ledger</p>
				<h2 id="movimientos" class="mt-1 text-xl font-semibold">Movimientos del periodo</h2>
			</div>
			<span class="font-mono text-xs text-base-content/50">{data.collection.currency}</span>
		</div>
		<ExpenseTable
			expenses={data.expenses}
			categories={data.categories}
			members={data.members}
			collection={data.collection}
			currentUserId={data.currentUserId}
			canManage={data.canManage}
			actionQuery={filterParams()}
		/>
		{#if data.nextCursor}
			<div class="flex justify-center pt-2">
				<a
					class="btn btn-ghost btn-sm"
					href={resolve(
						`/family/${data.family.id}/expenses/${data.collection.id}?${filterParams(data.nextCursor)}` as '/'
					)}>Ver movimientos anteriores</a
				>
			</div>
		{/if}
	</section>

	{#if data.canCreate}
		<section
			id="nuevo-gasto"
			aria-labelledby="titulo-nuevo-gasto"
			class="card bg-base-100 card-border"
		>
			<div class="card-body gap-5">
				<div>
					<p class="text-xs font-semibold tracking-widest text-primary uppercase">
						Nuevo movimiento
					</p>
					<h2 id="titulo-nuevo-gasto" class="mt-1 text-xl font-semibold">Añadir gasto</h2>
				</div>
				<form
					method="POST"
					action={`?${filterParams()}&/createExpense`}
					enctype="multipart/form-data"
					class="grid gap-4 md:grid-cols-6"
				>
					<label class="form-control md:col-span-3" for="expense-description"
						><span class="label-text mb-2 font-medium">Concepto</span><input
							id="expense-description"
							class="input-bordered input"
							name="description"
							maxlength="160"
							required
							placeholder="Compra semanal"
						/></label
					>
					<label class="form-control md:col-span-1" for="expense-amount"
						><span class="label-text mb-2 font-medium">Importe</span><input
							id="expense-amount"
							class="input-bordered input"
							name="amount"
							type="number"
							min="0.01"
							step="0.01"
							required
							bind:value={createAmount}
							placeholder="0,00"
						/></label
					>
					<label class="form-control md:col-span-2" for="expense-date"
						><span class="label-text mb-2 font-medium">Fecha</span><input
							id="expense-date"
							class="input-bordered input"
							name="occurred_on"
							type="date"
							value={expenseDate}
							required
						/></label
					>
					<label class="form-control md:col-span-2" for="expense-payer"
						><span class="label-text mb-2 font-medium">Pagó</span><select
							id="expense-payer"
							class="select-bordered select"
							name="paid_by"
							value={data.currentUserId}
							required
							>{#each activeMembers as member (member.userId)}<option value={member.userId}
									>{member.profile.displayName}</option
								>{/each}</select
						></label
					>
					<label class="form-control md:col-span-2" for="expense-category"
						><span class="label-text mb-2 font-medium">Categoría</span><select
							id="expense-category"
							class="select-bordered select"
							name="category_id"
							><option value="">Sin categoría</option
							>{#each data.categories as category (category.id)}<option value={category.id}
									>{category.name}</option
								>{/each}</select
						></label
					>
					<label class="form-control md:col-span-2" for="expense-receipt"
						><span class="label-text mb-2 font-medium"
							>Recibo <span class="font-normal opacity-50">(opcional)</span></span
						><input
							id="expense-receipt"
							class="file-input-bordered file-input"
							name="receipt"
							type="file"
							accept="image/jpeg,image/png,image/webp,application/pdf"
						/><span class="mt-1 text-xs text-base-content/50">PDF o imagen, máximo 8 MB.</span
						></label
					>
					<label class="form-control md:col-span-6" for="expense-notes"
						><span class="label-text mb-2 font-medium"
							>Notas <span class="font-normal opacity-50">(opcional)</span></span
						><textarea
							id="expense-notes"
							class="textarea-bordered textarea min-h-24"
							name="notes"
							maxlength="4000"
							placeholder="Contexto útil para el resto de participantes"
						></textarea></label
					>
					<div class="md:col-span-6">
						<ExpenseSplitEditor
							members={data.members}
							amount={createAmount}
							currency={data.collection.currency}
							inputId="new-expense"
						/>
					</div>
					<div class="md:col-span-6 md:justify-self-end">
						<button class="btn btn-primary" type="submit">Añadir gasto</button>
					</div>
				</form>
			</div>
		</section>
	{/if}

	<section aria-labelledby="recurring-expenses" class="space-y-4">
		<div>
			<p class="text-xs font-semibold tracking-widest text-base-content/45 uppercase">
				Automatización
			</p>
			<h2 id="recurring-expenses" class="mt-1 text-xl font-semibold">Gastos recurrentes</h2>
		</div>
		{#if data.recurringRules.length > 0}
			<div class="grid gap-3 lg:grid-cols-2">
				{#each data.recurringRules as rule (rule.id)}
					<article class="rounded-box border border-base-300 bg-base-100 p-4">
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0">
								<h3 class="truncate font-semibold">{rule.description}</h3>
								<p class="mt-1 text-sm text-base-content/55">
									{rule.frequency === 'weekly' ? 'Semanal' : 'Mensual'} · Próximo
									{localDate(rule.next_run)}
								</p>
							</div>
							<span class="badge {rule.active ? 'badge-success' : 'badge-ghost'}">
								{rule.active ? 'Activa' : 'Pausada'}
							</span>
						</div>
						<p class="mt-3 font-mono text-lg font-semibold">{money(rule.amount)}</p>
						<p class="mt-1 text-xs text-base-content/50">
							Pagará {rule.payer.displayName} · {rule.splits
								.map((split) => `${memberName(split.userId)} ${money(split.amount)}`)
								.join(' · ')}
						</p>
						{#if rule.canMutate}
							<form
								method="POST"
								action={`?${filterParams()}&/setRecurringActive`}
								class="mt-4 flex justify-end"
							>
								<input type="hidden" name="rule_id" value={rule.id} />
								<input type="hidden" name="active" value={rule.active ? 'false' : 'true'} />
								<button class="btn btn-ghost btn-sm" type="submit">
									{rule.active ? 'Pausar' : 'Reactivar'}
								</button>
							</form>
						{/if}
					</article>
				{/each}
			</div>
		{/if}
		{#if data.canCreate}<RecurringExpenseForm
				members={data.members}
				categories={data.categories}
				currency={data.collection.currency}
				currentUserId={data.currentUserId}
				defaultDate={expenseDate}
				actionQuery={filterParams()}
			/>{/if}
	</section>

	{#if data.collection.role === 'viewer'}
		<div class="alert" role="status">
			<span>Tienes acceso de solo lectura a esta colección.</span>
		</div>
	{/if}
</div>
