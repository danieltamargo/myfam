<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const today = new Date().toLocaleDateString('en-CA');
	const activeMembers = $derived(data.members.filter((member) => member.status === 'active'));
	const pageTotal = $derived(
		data.expenses.reduce((sum, expense) => sum + Number(expense.amount), 0)
	);

	function formatMoney(value: number | string): string {
		return new Intl.NumberFormat('es-ES', {
			style: 'currency',
			currency: data.collection.currency
		}).format(Number(value));
	}

	function formatDate(value: string): string {
		const [year, month, day] = value.split('-').map(Number);
		return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }).format(
			new Date(year, month - 1, day)
		);
	}

	function canEdit(createdBy: string): boolean {
		return (
			data.canManage || (data.collection.role === 'contributor' && createdBy === data.currentUserId)
		);
	}
</script>

<svelte:head>
	<title>{data.collection.name} · Gastos · MyFamily</title>
</svelte:head>

<div class="mx-auto max-w-7xl space-y-6 pb-12">
	<nav class="breadcrumbs text-sm text-base-content/60" aria-label="Ruta de navegación">
		<ul>
			<li><a href={`/family/${data.family.id}/expenses`}>Gastos</a></li>
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
				href={`/family/${data.family.id}/expenses/${data.collection.id}/settings`}
			>
				Ajustes
			</a>
			{#if data.canCreate}
				<a class="btn btn-primary" href="#nuevo-gasto">Añadir gasto</a>
			{/if}
		</div>
	</header>

	{#if form?.error}
		<div class="alert alert-error" role="alert"><span>{form.error}</span></div>
	{:else if form?.message}
		<div class="alert alert-success" role="status"><span>{form.message}</span></div>
	{/if}

	<section class="grid gap-3 sm:grid-cols-3" aria-label="Resumen de la página">
		<div class="stat rounded-box border border-base-300 bg-base-100">
			<div class="stat-title">Importe visible</div>
			<div class="stat-value text-2xl">{formatMoney(pageTotal)}</div>
			<div class="stat-desc">En esta página</div>
		</div>
		<div class="stat rounded-box border border-base-300 bg-base-100">
			<div class="stat-title">Movimientos</div>
			<div class="stat-value text-2xl">{data.expenses.length}</div>
			<div class="stat-desc">Máximo 25 por página</div>
		</div>
		<div class="stat rounded-box border border-base-300 bg-base-100">
			<div class="stat-title">Participantes</div>
			<div class="stat-value text-2xl">{activeMembers.length}</div>
			<div class="stat-desc">Con acceso activo</div>
		</div>
	</section>

	<section aria-labelledby="movimientos" class="space-y-3">
		<div class="flex items-end justify-between gap-4">
			<div>
				<p class="text-xs font-semibold tracking-widest text-base-content/45 uppercase">Ledger</p>
				<h2 id="movimientos" class="mt-1 text-xl font-semibold">Movimientos recientes</h2>
			</div>
			<span class="font-mono text-xs text-base-content/50">{data.collection.currency}</span>
		</div>

		{#if data.expenses.length === 0}
			<div
				class="rounded-box border border-dashed border-base-300 bg-base-100 px-6 py-12 text-center"
			>
				<div class="text-4xl" aria-hidden="true">🧾</div>
				<h3 class="mt-3 font-semibold">No hay movimientos todavía</h3>
				<p class="mt-1 text-sm text-base-content/60">
					El primer gasto aparecerá aquí con su pagador y categoría.
				</p>
			</div>
		{:else}
			<div class="overflow-x-auto rounded-box border border-base-300 bg-base-100">
				<table class="table">
					<thead>
						<tr>
							<th>Fecha</th>
							<th>Concepto</th>
							<th>Pagó</th>
							<th>Categoría</th>
							<th class="text-right">Importe</th>
							<th><span class="sr-only">Acciones</span></th>
						</tr>
					</thead>
					<tbody>
						{#each data.expenses as expense (expense.id)}
							<tr>
								<td class="text-sm whitespace-nowrap text-base-content/60"
									>{formatDate(expense.occurred_on)}</td
								>
								<td class="min-w-52">
									<p class="font-medium">{expense.description}</p>
									{#if expense.notes}<p class="max-w-sm truncate text-xs text-base-content/50">
											{expense.notes}
										</p>{/if}
								</td>
								<td>{expense.payer.displayName}</td>
								<td>
									{#if expense.category}
										<span class="inline-flex items-center gap-2 text-sm">
											<span
												class="size-2 rounded-full"
												style:background-color={expense.category.color ?? '#64748B'}
											></span>
											{expense.category.name}
										</span>
									{:else}<span class="text-sm text-base-content/40">Sin categoría</span>{/if}
								</td>
								<td class="text-right font-mono font-semibold">{formatMoney(expense.amount)}</td>
								<td class="text-right">
									<div class="flex justify-end gap-1">
										{#if expense.receiptUrl}
											<a
												class="btn btn-ghost btn-xs"
												href={expense.receiptUrl}
												target="_blank"
												rel="noreferrer">Recibo</a
											>
										{/if}
										{#if canEdit(expense.created_by) && !data.collection.archivedAt}
											<a class="btn btn-ghost btn-xs" href={`#editar-${expense.id}`}>Editar</a>
										{/if}
									</div>
								</td>
							</tr>
							{#if canEdit(expense.created_by) && !data.collection.archivedAt}
								<tr id={`editar-${expense.id}`}>
									<td colspan="6" class="bg-base-200/60 p-0">
										<details class="collapse-arrow collapse">
											<summary class="collapse-title min-h-0 py-3 text-sm font-semibold"
												>Editar {expense.description}</summary
											>
											<div class="collapse-content">
												<form
													method="POST"
													action="?/updateExpense"
													enctype="multipart/form-data"
													class="grid gap-3 pt-2 md:grid-cols-6"
												>
													<input type="hidden" name="expense_id" value={expense.id} />
													<input type="hidden" name="version" value={expense.version} />
													<label
														class="form-control md:col-span-2"
														for={`description-${expense.id}`}
													>
														<span class="label-text mb-1">Concepto</span>
														<input
															id={`description-${expense.id}`}
															class="input-bordered input input-sm"
															name="description"
															value={expense.description}
															maxlength="160"
															required
														/>
													</label>
													<label class="form-control" for={`amount-${expense.id}`}>
														<span class="label-text mb-1">Importe</span>
														<input
															id={`amount-${expense.id}`}
															class="input-bordered input input-sm"
															name="amount"
															type="number"
															min="0.01"
															step="0.01"
															value={expense.amount}
															required
														/>
													</label>
													<label class="form-control" for={`date-${expense.id}`}>
														<span class="label-text mb-1">Fecha</span>
														<input
															id={`date-${expense.id}`}
															class="input-bordered input input-sm"
															name="occurred_on"
															type="date"
															value={expense.occurred_on}
															required
														/>
													</label>
													<label class="form-control" for={`payer-${expense.id}`}>
														<span class="label-text mb-1">Pagó</span>
														<select
															id={`payer-${expense.id}`}
															class="select-bordered select select-sm"
															name="paid_by"
															value={expense.paid_by}
															required
														>
															{#each activeMembers as member (member.userId)}<option
																	value={member.userId}>{member.profile.displayName}</option
																>{/each}
														</select>
													</label>
													<label class="form-control" for={`category-${expense.id}`}>
														<span class="label-text mb-1">Categoría</span>
														<select
															id={`category-${expense.id}`}
															class="select-bordered select select-sm"
															name="category_id"
															value={expense.category_id ?? ''}
														>
															<option value="">Sin categoría</option>
															{#each data.categories as category (category.id)}<option
																	value={category.id}>{category.name}</option
																>{/each}
														</select>
													</label>
													<label class="form-control md:col-span-3" for={`notes-${expense.id}`}>
														<span class="label-text mb-1">Notas</span>
														<textarea
															id={`notes-${expense.id}`}
															class="textarea-bordered textarea textarea-sm"
															name="notes"
															maxlength="4000">{expense.notes ?? ''}</textarea
														>
													</label>
													<label class="form-control md:col-span-2" for={`receipt-${expense.id}`}>
														<span class="label-text mb-1">Sustituir recibo</span>
														<input
															id={`receipt-${expense.id}`}
															class="file-input-bordered file-input file-input-sm"
															name="receipt"
															type="file"
															accept="image/jpeg,image/png,image/webp,application/pdf"
														/>
													</label>
													<label class="label cursor-pointer justify-start gap-2 self-end pb-2">
														<input
															class="checkbox checkbox-sm"
															type="checkbox"
															name="remove_receipt"
															value="true"
														/>
														<span class="label-text">Quitar recibo</span>
													</label>
													<div class="flex flex-wrap justify-end gap-2 md:col-span-6">
														<button class="btn btn-sm btn-primary" type="submit"
															>Guardar cambios</button
														>
													</div>
												</form>
												<form
													method="POST"
													action="?/deleteExpense"
													class="mt-3 flex justify-end border-t border-base-300 pt-3"
												>
													<input type="hidden" name="expense_id" value={expense.id} />
													<input type="hidden" name="version" value={expense.version} />
													<button class="btn btn-outline btn-xs btn-error" type="submit"
														>Eliminar gasto</button
													>
												</form>
											</div>
										</details>
									</td>
								</tr>
							{/if}
						{/each}
					</tbody>
				</table>
			</div>
		{/if}

		{#if data.nextCursor}
			<div class="flex justify-center pt-2">
				<a class="btn btn-ghost btn-sm" href={`?cursor=${encodeURIComponent(data.nextCursor)}`}
					>Ver movimientos anteriores</a
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
					action="?/createExpense"
					enctype="multipart/form-data"
					class="grid gap-4 md:grid-cols-6"
				>
					<label class="form-control md:col-span-3" for="expense-description">
						<span class="label-text mb-2 font-medium">Concepto</span>
						<input
							id="expense-description"
							class="input-bordered input"
							name="description"
							maxlength="160"
							required
							placeholder="Compra semanal"
						/>
					</label>
					<label class="form-control md:col-span-1" for="expense-amount">
						<span class="label-text mb-2 font-medium">Importe</span>
						<input
							id="expense-amount"
							class="input-bordered input"
							name="amount"
							type="number"
							min="0.01"
							step="0.01"
							required
							placeholder="0,00"
						/>
					</label>
					<label class="form-control md:col-span-2" for="expense-date">
						<span class="label-text mb-2 font-medium">Fecha</span>
						<input
							id="expense-date"
							class="input-bordered input"
							name="occurred_on"
							type="date"
							value={today}
							required
						/>
					</label>
					<label class="form-control md:col-span-2" for="expense-payer">
						<span class="label-text mb-2 font-medium">Pagó</span>
						<select
							id="expense-payer"
							class="select-bordered select"
							name="paid_by"
							value={data.currentUserId}
							required
						>
							{#each activeMembers as member (member.userId)}<option value={member.userId}
									>{member.profile.displayName}</option
								>{/each}
						</select>
					</label>
					<label class="form-control md:col-span-2" for="expense-category">
						<span class="label-text mb-2 font-medium">Categoría</span>
						<select id="expense-category" class="select-bordered select" name="category_id">
							<option value="">Sin categoría</option>
							{#each data.categories as category (category.id)}<option value={category.id}
									>{category.name}</option
								>{/each}
						</select>
					</label>
					<label class="form-control md:col-span-2" for="expense-receipt">
						<span class="label-text mb-2 font-medium"
							>Recibo <span class="font-normal opacity-50">(opcional)</span></span
						>
						<input
							id="expense-receipt"
							class="file-input-bordered file-input"
							name="receipt"
							type="file"
							accept="image/jpeg,image/png,image/webp,application/pdf"
						/>
						<span class="mt-1 text-xs text-base-content/50">PDF o imagen, máximo 8 MB.</span>
					</label>
					<label class="form-control md:col-span-6" for="expense-notes">
						<span class="label-text mb-2 font-medium"
							>Notas <span class="font-normal opacity-50">(opcional)</span></span
						>
						<textarea
							id="expense-notes"
							class="textarea-bordered textarea min-h-24"
							name="notes"
							maxlength="4000"
							placeholder="Contexto útil para el resto de participantes"
						></textarea>
					</label>
					<div class="md:col-span-6 md:justify-self-end">
						<button class="btn btn-primary" type="submit">Añadir gasto</button>
					</div>
				</form>
			</div>
		</section>
	{:else if data.collection.role === 'viewer'}
		<div class="alert" role="status">
			<span>Tienes acceso de solo lectura a esta colección.</span>
		</div>
	{/if}
</div>
