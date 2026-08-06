<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { WishlistCoordinationSummary } from '$lib/wishlist/coordination';

	type CoordinationAction = 'purchase' | 'reservation';

	let {
		itemId,
		summary,
		reservationNames = [],
		variant = 'full'
	}: {
		itemId: string;
		summary: WishlistCoordinationSummary;
		reservationNames?: string[];
		variant?: 'full' | 'summary';
	} = $props();

	let pendingAction = $state<CoordinationAction | null>(null);
	let actionError = $state('');

	function enhanceCoordination(action: CoordinationAction): SubmitFunction {
		return () => {
			pendingAction = action;
			actionError = '';

			return async ({ result, update }) => {
				if (result.type === 'failure') {
					const data = result.data as { error?: string } | undefined;
					actionError = data?.error ?? 'No se pudo guardar la coordinación.';
				}
				await update({ reset: false });
				pendingAction = null;
			};
		};
	}

	const reservationTitle = $derived(
		reservationNames.length > 0
			? `Interesados: ${reservationNames.join(', ')}`
			: 'Nadie ha mostrado interés todavía'
	);
</script>

<section
	class={variant === 'full'
		? 'w-full max-w-full min-w-0 overflow-hidden rounded-box border border-base-300 bg-base-200/60 p-4'
		: 'rounded-box bg-base-200/70 p-3'}
	aria-label="Coordinación del regalo"
	data-testid="wishlist-coordination"
>
	<div class="flex items-start justify-between gap-3" aria-live="polite">
		<div>
			<p class="text-sm font-semibold">
				{summary.remainingQuantity}
				{summary.remainingQuantity === 1 ? 'unidad disponible' : 'unidades disponibles'}
			</p>
			<p class="text-xs text-base-content/65">
				de {summary.desiredQuantity} · {summary.purchasedQuantity} compradas ·
				{summary.reservedQuantity} en consideración
			</p>
		</div>
		<span
			class="badge badge-sm {summary.remainingQuantity === 0 ? 'badge-success' : 'badge-ghost'}"
		>
			{summary.remainingQuantity === 0 ? 'Coordinado' : 'Disponible'}
		</span>
	</div>

	<progress
		class="progress mt-2 w-full progress-primary"
		value={summary.desiredQuantity - summary.remainingQuantity}
		max={summary.desiredQuantity}
		aria-label={`${summary.desiredQuantity - summary.remainingQuantity} de ${summary.desiredQuantity} unidades coordinadas`}
	></progress>

	{#if summary.reservationCount > 0}
		<p class="mt-1 text-xs text-base-content/65" title={reservationTitle}>
			{summary.reservationCount}
			{summary.reservationCount === 1 ? 'persona interesada' : 'personas interesadas'}
		</p>
	{/if}

	{#if variant === 'full'}
		<div class="mt-4 grid max-w-full min-w-0 gap-4 lg:grid-cols-2">
			<div class="w-full max-w-full min-w-0 rounded-box bg-base-100 p-3">
				<h3 class="font-semibold">Me interesa</h3>
				<p class="mb-3 text-xs text-base-content/65">
					Avísalo mientras decides, sin marcarlo como comprado.
				</p>
				<form
					method="POST"
					action="?/toggleReservation"
					use:enhance={enhanceCoordination('reservation')}
					class="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end"
				>
					<input type="hidden" name="item_id" value={itemId} />
					<input type="hidden" name="is_reserved" value="true" />
					<label class="form-control w-full sm:w-24" for={`reservation-quantity-${itemId}`}>
						<span class="label-text text-xs">Cantidad</span>
						<input
							id={`reservation-quantity-${itemId}`}
							class="input-bordered input input-sm max-w-full min-w-0 text-base"
							name="quantity"
							type="number"
							min="1"
							max={Math.max(1, summary.maxReservationQuantity)}
							value={summary.myReservationQuantity || 1}
							required
						/>
					</label>
					<button
						type="submit"
						class="btn w-full btn-sm btn-info sm:flex-1"
						disabled={pendingAction !== null || summary.maxReservationQuantity < 1}
					>
						{#if pendingAction === 'reservation'}
							<span class="loading loading-xs loading-spinner" aria-hidden="true"></span>
						{/if}
						{summary.myReservationQuantity > 0 ? 'Actualizar interés' : 'Me interesa'}
					</button>
				</form>
				{#if summary.myReservationQuantity > 0}
					<form
						method="POST"
						action="?/toggleReservation"
						use:enhance={enhanceCoordination('reservation')}
						class="mt-2"
					>
						<input type="hidden" name="item_id" value={itemId} />
						<input type="hidden" name="is_reserved" value="false" />
						<button type="submit" class="btn btn-ghost btn-xs" disabled={pendingAction !== null}>
							Dejar de considerarlo
						</button>
					</form>
				{/if}
			</div>

			<div class="w-full max-w-full min-w-0 rounded-box bg-base-100 p-3">
				<h3 class="font-semibold">Ya lo compré</h3>
				<p class="mb-3 text-xs text-base-content/65">Confirma cuántas unidades has comprado.</p>
				<form
					method="POST"
					action="?/togglePurchase"
					use:enhance={enhanceCoordination('purchase')}
					class="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end"
				>
					<input type="hidden" name="item_id" value={itemId} />
					<input type="hidden" name="is_purchased" value="true" />
					<label class="form-control w-full sm:w-24" for={`purchase-quantity-${itemId}`}>
						<span class="label-text text-xs">Cantidad</span>
						<input
							id={`purchase-quantity-${itemId}`}
							class="input-bordered input input-sm max-w-full min-w-0 text-base"
							name="quantity"
							type="number"
							min="1"
							max={Math.max(1, summary.maxPurchaseQuantity)}
							value={summary.myPurchaseQuantity || summary.myReservationQuantity || 1}
							required
						/>
					</label>
					<button
						type="submit"
						class="btn w-full btn-sm btn-success sm:flex-1"
						disabled={pendingAction !== null || summary.maxPurchaseQuantity < 1}
					>
						{#if pendingAction === 'purchase'}
							<span class="loading loading-xs loading-spinner" aria-hidden="true"></span>
						{/if}
						{summary.myPurchaseQuantity > 0 ? 'Actualizar compra' : 'Marcar comprado'}
					</button>
				</form>
				{#if summary.myPurchaseQuantity > 0}
					<form
						method="POST"
						action="?/togglePurchase"
						use:enhance={enhanceCoordination('purchase')}
						class="mt-2"
					>
						<input type="hidden" name="item_id" value={itemId} />
						<input type="hidden" name="is_purchased" value="false" />
						<button type="submit" class="btn btn-ghost btn-xs" disabled={pendingAction !== null}>
							Deshacer compra
						</button>
					</form>
				{/if}
			</div>
		</div>

		{#if actionError}
			<div class="mt-3 alert alert-error" role="alert">
				<span>{actionError}</span>
			</div>
		{/if}
	{/if}
</section>
