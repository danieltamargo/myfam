<script lang="ts">
	import type { Tables } from '$lib/types/database';
	import type { ExpenseMember } from '$lib/server/expenses/queries';
	import ExpenseSplitEditor from './ExpenseSplitEditor.svelte';

	interface Props {
		members: ExpenseMember[];
		categories: Tables<'expense_categories'>[];
		currency: string;
		currentUserId: string;
		defaultDate: string;
	}

	let { members, categories, currency, currentUserId, defaultDate }: Props = $props();
	let amount = $state('');
	const activeMembers = $derived(members.filter((member) => member.status === 'active'));
</script>

<details class="collapse-arrow collapse rounded-box border border-base-300 bg-base-100">
	<summary class="collapse-title text-lg font-semibold">Programar un gasto recurrente</summary>
	<div class="collapse-content">
		<p class="mb-4 text-sm text-base-content/60">
			Crea una regla semanal o mensual. Cada ocurrencia conserva el reparto y nunca genera pagos
			automáticos.
		</p>
		<form method="POST" action="?/createRecurring" class="grid gap-4 md:grid-cols-6">
			<label class="form-control md:col-span-3" for="recurring-description">
				<span class="label-text mb-2 font-medium">Concepto</span>
				<input
					id="recurring-description"
					class="input-bordered input"
					name="description"
					maxlength="160"
					required
					placeholder="Alquiler"
				/>
			</label>
			<label class="form-control md:col-span-1" for="recurring-amount">
				<span class="label-text mb-2 font-medium">Importe</span>
				<input
					id="recurring-amount"
					class="input-bordered input"
					name="amount"
					type="number"
					min="0.01"
					step="0.01"
					required
					bind:value={amount}
				/>
			</label>
			<label class="form-control md:col-span-1" for="recurring-frequency">
				<span class="label-text mb-2 font-medium">Frecuencia</span>
				<select id="recurring-frequency" class="select-bordered select" name="frequency" required>
					<option value="monthly">Mensual</option>
					<option value="weekly">Semanal</option>
				</select>
			</label>
			<label class="form-control md:col-span-1" for="recurring-date">
				<span class="label-text mb-2 font-medium">Próxima fecha</span>
				<input
					id="recurring-date"
					class="input-bordered input"
					name="occurred_on"
					type="date"
					value={defaultDate}
					required
				/>
			</label>
			<label class="form-control md:col-span-2" for="recurring-payer">
				<span class="label-text mb-2 font-medium">Pagará</span>
				<select
					id="recurring-payer"
					class="select-bordered select"
					name="paid_by"
					value={currentUserId}
					required
				>
					{#each activeMembers as member (member.userId)}
						<option value={member.userId}>{member.profile.displayName}</option>
					{/each}
				</select>
			</label>
			<label class="form-control md:col-span-2" for="recurring-category">
				<span class="label-text mb-2 font-medium">Categoría</span>
				<select id="recurring-category" class="select-bordered select" name="category_id">
					<option value="">Sin categoría</option>
					{#each categories as category (category.id)}
						<option value={category.id}>{category.name}</option>
					{/each}
				</select>
			</label>
			<label class="form-control md:col-span-2" for="recurring-notes">
				<span class="label-text mb-2 font-medium">Notas</span>
				<input id="recurring-notes" class="input-bordered input" name="notes" maxlength="4000" />
			</label>
			<div class="md:col-span-6">
				<ExpenseSplitEditor {members} {amount} {currency} inputId="recurring" />
			</div>
			<div class="md:col-span-6 md:justify-self-end">
				<button class="btn btn-primary" type="submit">Guardar regla</button>
			</div>
		</form>
	</div>
</details>
