<script lang="ts">
	import type {
		WishlistEventCategoryDto,
		WishlistMemberDto
	} from '$lib/server/wishlist/presenters';

	type FilterName = 'member' | 'category' | 'priority' | 'status';

	let {
		members,
		eventCategories,
		selectedMemberId,
		selectedCategoryId,
		selectedPriority,
		selectedStatus,
		onChange,
		onClear
	}: {
		members: WishlistMemberDto[];
		eventCategories: WishlistEventCategoryDto[];
		selectedMemberId: string;
		selectedCategoryId: string;
		selectedPriority: string;
		selectedStatus: string;
		onChange: (name: FilterName, value: string) => void;
		onClear: () => void;
	} = $props();

	const hasFilters = $derived(
		[selectedMemberId, selectedCategoryId, selectedPriority, selectedStatus].some(
			(value) => value !== 'all'
		)
	);
</script>

<aside class="w-full shrink-0 md:w-64" aria-label="Filtros de wishlist">
	<div class="rounded-box border border-base-300 bg-base-100 p-4 md:sticky md:top-4">
		<div class="mb-4 flex items-center justify-between gap-2">
			<h2 class="font-semibold">Filtros</h2>
			{#if hasFilters}
				<button type="button" class="btn btn-ghost btn-xs" onclick={onClear}>Limpiar</button>
			{/if}
		</div>

		<div class="grid gap-3 sm:grid-cols-2 md:grid-cols-1">
			<label class="form-control" for="wishlist-filter-member">
				<span class="label-text mb-1 text-xs font-semibold">Miembro</span>
				<select
					id="wishlist-filter-member"
					class="select-bordered select w-full select-sm"
					value={selectedMemberId}
					onchange={(event) => onChange('member', event.currentTarget.value)}
					data-testid="wishlist-filter-member"
				>
					<option value="all">Todos</option>
					{#each members as member (member.user_id)}
						<option value={member.user_id}>{member.profiles.display_name}</option>
					{/each}
				</select>
			</label>

			<label class="form-control" for="wishlist-filter-category">
				<span class="label-text mb-1 text-xs font-semibold">Categoría</span>
				<select
					id="wishlist-filter-category"
					class="select-bordered select w-full select-sm"
					value={selectedCategoryId}
					onchange={(event) => onChange('category', event.currentTarget.value)}
					data-testid="wishlist-filter-category"
				>
					<option value="all">Todas</option>
					{#each eventCategories as category (category.id)}
						<option value={category.id}>{category.icon ?? '•'} {category.name}</option>
					{/each}
				</select>
			</label>

			<label class="form-control" for="wishlist-filter-priority">
				<span class="label-text mb-1 text-xs font-semibold">Prioridad</span>
				<select
					id="wishlist-filter-priority"
					class="select-bordered select w-full select-sm"
					value={selectedPriority}
					onchange={(event) => onChange('priority', event.currentTarget.value)}
					data-testid="wishlist-filter-priority"
				>
					<option value="all">Todas</option>
					<option value="2">Muy alta</option>
					<option value="1">Alta</option>
					<option value="0">Normal</option>
					<option value="-1">Baja</option>
				</select>
			</label>

			<label class="form-control" for="wishlist-filter-status">
				<span class="label-text mb-1 text-xs font-semibold">Estado</span>
				<select
					id="wishlist-filter-status"
					class="select-bordered select w-full select-sm"
					value={selectedStatus}
					onchange={(event) => onChange('status', event.currentTarget.value)}
					data-testid="wishlist-filter-status"
				>
					<option value="all">Todos</option>
					<optgroup label="Regalo">
						<option value="active">Activo</option>
						<option value="fulfilled">Completado</option>
						<option value="archived">Archivado</option>
					</optgroup>
					<optgroup label="Coordinación">
						<option value="available">Con unidades libres</option>
						<option value="reserved">Con interés</option>
						<option value="purchased">Con compras</option>
					</optgroup>
				</select>
			</label>
		</div>

		<p class="mt-4 text-xs text-base-content/55">Los filtros quedan guardados en el enlace.</p>
	</div>
</aside>
