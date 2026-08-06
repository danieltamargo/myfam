<script lang="ts">
	import { moneyToCents, splitExpenseEqually, splitTotalInCents } from '$lib/expenses/splits';
	import type { ExpenseMember, ExpenseSplit } from '$lib/server/expenses/queries';

	interface Props {
		members: ExpenseMember[];
		amount: number | string;
		currency: string;
		inputId: string;
		initialSplits?: ExpenseSplit[];
		compact?: boolean;
	}

	let { members, amount, currency, inputId, initialSplits = [], compact = false }: Props = $props();
	let modeOverride = $state<'equal' | 'manual' | null>(null);
	let selectedOverride = $state<string[] | null>(null);
	let manualOverrides = $state<Record<string, string>>({});

	const activeMembers = $derived(members.filter((member) => member.status === 'active'));
	const initialIds = $derived(
		initialSplits.length > 0
			? initialSplits.map((split) => split.userId)
			: activeMembers.map((member) => member.userId)
	);
	const selectedIds = $derived(selectedOverride ?? initialIds);
	const mode = $derived(modeOverride ?? (initialSplits.length > 0 ? 'manual' : 'equal'));
	const equalSplits = $derived(splitExpenseEqually(amount, selectedIds));
	const initialAmounts = $derived(
		new Map(initialSplits.map((split) => [split.userId, split.amount.toFixed(2)]))
	);

	function manualValue(userId: string): string {
		return (
			manualOverrides[userId] ??
			initialAmounts.get(userId) ??
			equalSplits.find((split) => split.userId === userId)?.amount.toFixed(2) ??
			''
		);
	}

	const manualSplits = $derived(
		selectedIds.map((userId) => ({ userId, amount: Number(manualValue(userId).replace(',', '.')) }))
	);
	const splits = $derived(mode === 'equal' ? equalSplits : manualSplits);
	const expectedCents = $derived(moneyToCents(amount));
	const assignedCents = $derived(splitTotalInCents(splits));
	const isExact = $derived(
		expectedCents !== null && assignedCents !== null && expectedCents === assignedCents
	);
	const serialized = $derived(JSON.stringify(splits));

	function toggleParticipant(userId: string, checked: boolean): void {
		selectedOverride = checked
			? [...selectedIds, userId]
			: selectedIds.filter((candidate) => candidate !== userId);
	}

	function updateManual(userId: string, value: string): void {
		manualOverrides = { ...manualOverrides, [userId]: value };
	}

	function moneyFromCents(cents: number | null): string {
		return cents === null ? '—' : (cents / 100).toFixed(2).replace('.', ',');
	}
</script>

<fieldset class="rounded-box border border-base-300 bg-base-200/40 {compact ? 'p-3' : 'p-4'}">
	<legend class="px-2 text-sm font-semibold">Reparto del gasto</legend>
	<div class="flex flex-wrap gap-4 text-sm">
		<label class="label cursor-pointer gap-2">
			<input
				class="radio radio-sm radio-primary"
				type="radio"
				name={`split_mode_${inputId}`}
				value="equal"
				checked={mode === 'equal'}
				onchange={() => (modeOverride = 'equal')}
			/>
			<span>Partes iguales</span>
		</label>
		<label class="label cursor-pointer gap-2">
			<input
				class="radio radio-sm radio-primary"
				type="radio"
				name={`split_mode_${inputId}`}
				value="manual"
				checked={mode === 'manual'}
				onchange={() => (modeOverride = 'manual')}
			/>
			<span>Importes manuales</span>
		</label>
	</div>

	<div class="mt-3 grid gap-2 {compact ? 'sm:grid-cols-2' : 'md:grid-cols-2'}">
		{#each activeMembers as member (member.userId)}
			<div class="flex items-center gap-3 rounded-lg bg-base-100 px-3 py-2">
				<input
					class="checkbox checkbox-sm checkbox-primary"
					type="checkbox"
					aria-label={`Incluir a ${member.profile.displayName}`}
					checked={selectedIds.includes(member.userId)}
					onchange={(event) =>
						toggleParticipant(member.userId, (event.currentTarget as HTMLInputElement).checked)}
				/>
				<span class="min-w-0 flex-1 truncate text-sm">{member.profile.displayName}</span>
				{#if selectedIds.includes(member.userId)}
					{#if mode === 'manual'}
						<label
							class="input-bordered input input-sm w-28"
							aria-label={`Importe de ${member.profile.displayName}`}
						>
							<input
								type="number"
								min="0.01"
								step="0.01"
								value={manualValue(member.userId)}
								oninput={(event) =>
									updateManual(member.userId, (event.currentTarget as HTMLInputElement).value)}
							/>
							<span class="text-xs opacity-50">{currency}</span>
						</label>
					{:else}
						<span class="font-mono text-sm">
							{equalSplits.find((split) => split.userId === member.userId)?.amount.toFixed(2) ??
								'—'}
						</span>
					{/if}
				{/if}
			</div>
		{/each}
	</div>

	<input type="hidden" name="splits_json" value={serialized} />
	<div class="mt-3 flex items-center justify-between gap-3 text-xs">
		<span class={isExact ? 'text-success' : 'text-error'}>
			{isExact ? 'El reparto cuadra exactamente.' : 'El reparto debe coincidir con el importe.'}
		</span>
		<span class="font-mono text-base-content/60">
			{moneyFromCents(assignedCents)} / {moneyFromCents(expectedCents)}
		</span>
	</div>
</fieldset>
