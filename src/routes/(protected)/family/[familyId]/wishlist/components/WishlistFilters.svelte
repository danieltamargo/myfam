<script lang="ts">
	import * as messages from '$paraglide/messages';
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
			<h2 class="font-semibold">{messages['feature.filters']()}</h2>
			{#if hasFilters}
				<button type="button" class="btn btn-ghost btn-xs" onclick={onClear}
					>{messages['details.clear']()}</button
				>
			{/if}
		</div>

		<div class="grid gap-3 sm:grid-cols-2 md:grid-cols-1">
			<label class="form-control" for="wishlist-filter-member">
				<span class="label-text mb-1 text-xs font-semibold">{messages['feature.member']()}</span>
				<select
					id="wishlist-filter-member"
					class="select-bordered select w-full select-sm"
					value={selectedMemberId}
					onchange={(event) => onChange('member', event.currentTarget.value)}
					data-testid="wishlist-filter-member"
				>
					<option value="all">{messages['ui.everyone']()}</option>
					{#each members as member (member.user_id)}
						<option value={member.user_id}>{member.profiles.display_name}</option>
					{/each}
				</select>
			</label>

			<label class="form-control" for="wishlist-filter-category">
				<span class="label-text mb-1 text-xs font-semibold">{messages['ui.category']()}</span>
				<select
					id="wishlist-filter-category"
					class="select-bordered select w-full select-sm"
					value={selectedCategoryId}
					onchange={(event) => onChange('category', event.currentTarget.value)}
					data-testid="wishlist-filter-category"
				>
					<option value="all">{messages['feature.all_72']()}</option>
					{#each eventCategories as category (category.id)}
						<option value={category.id}>{category.icon ?? '•'} {category.name}</option>
					{/each}
				</select>
			</label>

			<label class="form-control" for="wishlist-filter-priority">
				<span class="label-text mb-1 text-xs font-semibold">{messages['ui.priority']()}</span>
				<select
					id="wishlist-filter-priority"
					class="select-bordered select w-full select-sm"
					value={selectedPriority}
					onchange={(event) => onChange('priority', event.currentTarget.value)}
					data-testid="wishlist-filter-priority"
				>
					<option value="all">{messages['feature.all_72']()}</option>
					<option value="2">{messages['feature.very_high']()}</option>
					<option value="1">{messages['ui.high']()}</option>
					<option value="0">Normal</option>
					<option value="-1">{messages['ui.low']()}</option>
				</select>
			</label>

			<label class="form-control" for="wishlist-filter-status">
				<span class="label-text mb-1 text-xs font-semibold">{messages['details.status']()}</span>
				<select
					id="wishlist-filter-status"
					class="select-bordered select w-full select-sm"
					value={selectedStatus}
					onchange={(event) => onChange('status', event.currentTarget.value)}
					data-testid="wishlist-filter-status"
				>
					<option value="all">{messages['ui.everyone']()}</option>
					<optgroup label="Regalo">
						<option value="active">{messages['feature.active']()}</option>
						<option value="archived">{messages['feature.archived']()}</option>
					</optgroup>
					<optgroup label="Coordinación">
						<option value="available">{messages['feature.available_to_buy']()}</option>
						<option value="reserved">{messages['feature.reserved']()}</option>
						<option value="purchased">{messages['feature.purchased']()}</option>
					</optgroup>
				</select>
			</label>
		</div>

		<p class="mt-4 text-xs text-base-content/55">
			{messages['feature.filters_are_saved_in_the_link']()}
		</p>
	</div>
</aside>
