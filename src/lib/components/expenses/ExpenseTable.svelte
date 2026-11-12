<script lang="ts">
	import type { Tables } from '$lib/types/database';
	import { resolve } from '$app/paths';
	import type { CalendarEventOption } from '$lib/server/calendar/resource-links';
	import type {
		ExpenseCollectionSummary,
		ExpenseMember,
		ExpenseRecord
	} from '$lib/server/expenses/queries';
	import ExpenseSplitEditor from './ExpenseSplitEditor.svelte';

	interface Props {
		expenses: ExpenseRecord[];
		categories: Tables<'expense_categories'>[];
		members: ExpenseMember[];
		collection: ExpenseCollectionSummary;
		currentUserId: string;
		canManage: boolean;
		actionQuery: string;
		calendarEvents: CalendarEventOption[];
		calendarEnabled: boolean;
	}

	let {
		expenses,
		categories,
		members,
		collection,
		currentUserId,
		canManage,
		actionQuery,
		calendarEvents,
		calendarEnabled
	}: Props = $props();
	let editAmounts = $state<Record<string, string>>({});
	const activeMembers = $derived(members.filter((member) => member.status === 'active'));

	function money(value: number | string): string {
		return new Intl.NumberFormat('es-ES', {
			style: 'currency',
			currency: collection.currency
		}).format(Number(value));
	}

	function localDate(value: string): string {
		const [year, month, day] = value.split('-').map(Number);
		return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }).format(
			new Date(year, month - 1, day)
		);
	}
	function calendarHref(event: CalendarEventOption): string {
		const parts = new Intl.DateTimeFormat('en-CA', {
			timeZone: event.timezone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		}).formatToParts(new Date(event.starts_at));
		const part = (type: string) => parts.find((value) => value.type === type)?.value ?? '';
		return `/family/${collection.familyId}/calendar?event=${event.id}&date=${part('year')}-${part('month')}-${part('day')}`;
	}

	function canEdit(createdBy: string): boolean {
		return canManage || (collection.role === 'contributor' && createdBy === currentUserId);
	}

	function editAmount(expenseId: string, fallback: number | string): string {
		return editAmounts[expenseId] ?? String(fallback);
	}

	function setEditAmount(expenseId: string, value: string): void {
		editAmounts = { ...editAmounts, [expenseId]: value };
	}
</script>

{#if expenses.length === 0}
	<div class="rounded-box border border-dashed border-base-300 bg-base-100 px-6 py-12 text-center">
		<div class="text-4xl" aria-hidden="true">🧾</div>
		<h3 class="mt-3 font-semibold">No hay movimientos en este intervalo</h3>
		<p class="mt-1 text-sm text-base-content/60">Prueba otro periodo o añade el primer gasto.</p>
	</div>
{:else}
	<div class="overflow-x-auto rounded-box border border-base-300 bg-base-100">
		<table class="table" data-testid="expenses-table">
			<thead>
				<tr
					><th>Fecha</th><th>Concepto</th><th>Pagó</th><th>Categoría</th><th class="text-right"
						>Importe</th
					><th><span class="sr-only">Acciones</span></th></tr
				>
			</thead>
			<tbody>
				{#each expenses as expense (expense.id)}
					<tr>
						<td class="text-sm whitespace-nowrap text-base-content/60"
							>{localDate(expense.occurred_on)}</td
						>
						<td class="min-w-52"
							><p class="font-medium">{expense.description}</p>
							{#if expense.calendarEvent}
								<a class="link text-xs" href={resolve(calendarHref(expense.calendarEvent) as '/')}
									>{expense.calendarEvent.title}</a
								>
							{/if}
							{#if expense.notes}<p class="max-w-sm truncate text-xs text-base-content/50">
									{expense.notes}
								</p>{/if}</td
						>
						<td>{expense.payer.displayName}</td>
						<td>
							{#if expense.category}<span class="inline-flex items-center gap-2 text-sm"
									><span
										class="size-2 rounded-full"
										style:background-color={expense.category.color ?? '#64748B'}
									></span>{expense.category.name}</span
								>{:else}<span class="text-sm text-base-content/40">Sin categoría</span>{/if}
						</td>
						<td class="text-right">
							<p class="font-mono font-semibold">{money(expense.amount)}</p>
							{#if expense.splits.length > 0}
								<p class="mt-1 text-xs text-base-content/45">
									{expense.splits.length}
									{expense.splits.length === 1 ? 'parte' : 'partes'}
								</p>
							{/if}
						</td>
						<td class="text-right">
							<div class="flex justify-end gap-1">
								{#if expense.receiptUrl}
									<!-- eslint-disable svelte/no-navigation-without-resolve -- Storage returns an absolute signed URL. -->
									<a
										class="btn btn-ghost btn-xs"
										href={expense.receiptUrl}
										target="_blank"
										rel="noreferrer">Recibo</a
									>
									<!-- eslint-enable svelte/no-navigation-without-resolve -->
								{/if}
								{#if canEdit(expense.created_by) && !collection.archivedAt}<a
										class="btn btn-ghost btn-xs"
										href={`#editar-${expense.id}`}>Editar</a
									>{/if}
							</div>
						</td>
					</tr>
					{#if canEdit(expense.created_by) && !collection.archivedAt}
						<tr id={`editar-${expense.id}`}>
							<td colspan="6" class="bg-base-200/60 p-0">
								<details class="collapse-arrow collapse">
									<summary class="collapse-title min-h-0 py-3 text-sm font-semibold"
										>Editar {expense.description}</summary
									>
									<div class="collapse-content">
										<form
											method="POST"
											action={`?${actionQuery}&/updateExpense`}
											enctype="multipart/form-data"
											class="grid gap-3 pt-2 md:grid-cols-6"
										>
											<input type="hidden" name="expense_id" value={expense.id} /><input
												type="hidden"
												name="version"
												value={expense.version}
											/>
											<label class="form-control md:col-span-2" for={`description-${expense.id}`}
												><span class="label-text mb-1">Concepto</span><input
													id={`description-${expense.id}`}
													class="input-bordered input input-sm"
													name="description"
													value={expense.description}
													maxlength="160"
													required
												/></label
											>
											<label class="form-control" for={`amount-${expense.id}`}
												><span class="label-text mb-1">Importe</span><input
													id={`amount-${expense.id}`}
													class="input-bordered input input-sm"
													name="amount"
													type="number"
													min="0.01"
													step="0.01"
													value={editAmount(expense.id, expense.amount)}
													oninput={(event) =>
														setEditAmount(
															expense.id,
															(event.currentTarget as HTMLInputElement).value
														)}
													required
												/></label
											>
											<label class="form-control" for={`date-${expense.id}`}
												><span class="label-text mb-1">Fecha</span><input
													id={`date-${expense.id}`}
													class="input-bordered input input-sm"
													name="occurred_on"
													type="date"
													value={expense.occurred_on}
													required
												/></label
											>
											<label class="form-control" for={`payer-${expense.id}`}
												><span class="label-text mb-1">Pagó</span><select
													id={`payer-${expense.id}`}
													class="select-bordered select select-sm"
													name="paid_by"
													value={expense.paid_by}
													required
													>{#each activeMembers as member (member.userId)}<option
															value={member.userId}>{member.profile.displayName}</option
														>{/each}</select
												></label
											>
											<label class="form-control" for={`category-${expense.id}`}
												><span class="label-text mb-1">Categoría</span><select
													id={`category-${expense.id}`}
													class="select-bordered select select-sm"
													name="category_id"
													value={expense.category_id ?? ''}
													><option value="">Sin categoría</option
													>{#each categories as category (category.id)}<option value={category.id}
															>{category.name}</option
														>{/each}</select
												></label
											>
											<label class="form-control md:col-span-3" for={`notes-${expense.id}`}
												><span class="label-text mb-1">Notas</span><textarea
													id={`notes-${expense.id}`}
													class="textarea-bordered textarea textarea-sm"
													name="notes"
													maxlength="4000">{expense.notes ?? ''}</textarea
												></label
											>
											<label class="form-control md:col-span-2" for={`receipt-${expense.id}`}
												><span class="label-text mb-1">Sustituir recibo</span><input
													id={`receipt-${expense.id}`}
													class="file-input-bordered file-input file-input-sm"
													name="receipt"
													type="file"
													accept="image/jpeg,image/png,image/webp,application/pdf"
												/></label
											>
											<label class="label cursor-pointer justify-start gap-2 self-end pb-2"
												><input
													class="checkbox checkbox-sm"
													type="checkbox"
													name="remove_receipt"
													value="true"
												/><span class="label-text">Quitar recibo</span></label
											>
											{#if calendarEnabled}
												<label class="form-control md:col-span-3" for={`event-${expense.id}`}>
													<span class="label-text mb-1">Evento</span>
													<select
														id={`event-${expense.id}`}
														class="select select-sm"
														name="calendar_event_id"
													>
														<option value="keep">Conservar asociación actual</option>
														<option value="">Sin evento (gasto genérico)</option>
														{#each calendarEvents as event (event.id)}<option value={event.id}
																>{event.title}</option
															>{/each}
													</select>
												</label>
											{/if}
											<div class="md:col-span-6">
												<ExpenseSplitEditor
													{members}
													amount={editAmount(expense.id, expense.amount)}
													currency={collection.currency}
													inputId={`expense-${expense.id}`}
													initialSplits={expense.splits}
													compact
												/>
											</div>
											<div class="flex justify-end md:col-span-6">
												<button class="btn btn-sm btn-primary" type="submit">Guardar cambios</button
												>
											</div>
										</form>
										<form
											method="POST"
											action={`?${actionQuery}&/deleteExpense`}
											class="mt-3 flex justify-end border-t border-base-300 pt-3"
										>
											<input type="hidden" name="expense_id" value={expense.id} /><input
												type="hidden"
												name="version"
												value={expense.version}
											/>
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
