<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { ExpensePageData } from '$lib/server/expenses/queries';

	let {
		suggestions,
		settlements,
		currency,
		actionQuery,
		warning,
		serverMessage
	}: {
		suggestions: ExpensePageData['settlementSuggestions'];
		settlements: ExpensePageData['settlements'];
		currency: string;
		actionQuery: string;
		warning: string | null;
		serverMessage: string | null;
	} = $props();
	let busy = $state(false);
	let requestError = $state('');
	let confirmedMessage = $state('');
	const record: SubmitFunction = ({ cancel }) => {
		if (busy) {
			cancel();
			return;
		}
		busy = true;
		requestError = '';
		confirmedMessage = '';
		return async ({ result, update }) => {
			try {
				if (result.type === 'error') {
					requestError = 'No se pudo confirmar el registro. Reintenta sin recargar la página.';
					return;
				}
				await update();
				if (result.type === 'success' && typeof result.data?.message === 'string')
					confirmedMessage = result.data.message;
			} catch {
				requestError = 'No se pudo confirmar el registro. Reintenta sin recargar la página.';
			} finally {
				busy = false;
			}
		};
	};
	function money(cents: number): string {
		return new Intl.NumberFormat('es-ES', {
			style: 'currency',
			currency,
			minimumFractionDigits: 2
		}).format(cents / 100);
	}
</script>

<section aria-labelledby="reembolsos" class="space-y-3" aria-busy={busy}>
	{#if confirmedMessage || serverMessage}<p class="alert alert-success" role="status">
			{confirmedMessage || serverMessage}
		</p>{/if}
	{#if requestError}<p class="alert alert-error" role="alert">{requestError}</p>{/if}
	<div>
		<h2 id="reembolsos" class="text-xl font-semibold">Reembolsos sugeridos</h2>
		<p class="mt-1 text-sm text-base-content/65">
			Saldos de toda la colección, descontando los reembolsos registrados. No dependen del filtro de
			fechas.
		</p>
		<p class="mt-1 text-sm text-base-content/65">
			Registra únicamente pagos que ya se hayan realizado por otro medio. Este botón no transfiere
			dinero.
		</p>
	</div>
	{#if warning}
		<p class="alert alert-warning" role="status">{warning}</p>
	{:else}
		<ul class="divide-y divide-base-300 rounded-box border border-base-300">
			{#each suggestions as suggestion (suggestion.idempotencyKey)}
				<li class="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
					<p>
						<span class="font-semibold">{suggestion.fromLabel}</span> debe reembolsar {money(
							suggestion.amountCents
						)} a <span class="font-semibold">{suggestion.toLabel}</span>.
					</p>
					{#if suggestion.canRecord}
						<form method="POST" action={`?${actionQuery}&/recordSettlement`} use:enhance={record}>
							<input type="hidden" name="from_user_id" value={suggestion.fromUserId} />
							<input type="hidden" name="to_user_id" value={suggestion.toUserId} />
							<input type="hidden" name="amount_cents" value={suggestion.amountCents} />
							<input type="hidden" name="idempotency_key" value={suggestion.idempotencyKey} />
							<button class="btn btn-outline btn-sm" type="submit" disabled={busy}
								>Registrar pago realizado</button
							>
						</form>
					{/if}
				</li>
			{:else}
				<li class="p-4 text-base-content/65">No hay reembolsos pendientes.</li>
			{/each}
		</ul>
	{/if}
	{#if settlements.length}
		<details class="rounded-box border border-base-300 p-4">
			<summary class="cursor-pointer font-medium">Últimos reembolsos registrados</summary>
			<ul class="mt-3 space-y-2 text-sm">
				{#each settlements as settlement (settlement.id)}
					<li>
						{settlement.fromLabel} a {settlement.toLabel}: {money(settlement.amountCents)} ·
						<time datetime={settlement.createdAt}
							>{new Date(settlement.createdAt).toLocaleDateString('es-ES')}</time
						>
					</li>
				{/each}
			</ul>
		</details>
	{/if}
</section>
