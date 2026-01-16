<script lang="ts">
	type Member = {
		user_id: string | null;
		profiles: {
			display_name: string | null;
			avatar_url: string | null;
		} | null;
	};

	type EventCategory = {
		id: string;
		name: string;
		icon: string | null;
		color: string | null;
	};

	let {
		members,
		eventCategories,
		selectedMemberId = $bindable(),
		selectedEventId = $bindable(),
		selectedPurchaseStatus = $bindable()
	}: {
		members: Member[];
		eventCategories: EventCategory[];
		selectedMemberId: string | 'all';
		selectedEventId: string | 'all';
		selectedPurchaseStatus: 'all' | 'purchased' | 'not_purchased';
	} = $props();
</script>

<aside class="w-full md:w-64 shrink-0">
	<div class="bg-base-200 rounded-lg p-4 space-y-4 md:sticky md:top-4">
		<div class="text-sm font-medium text-base-content/70">Filtros</div>

		<!-- Member Filters (Avatar circles) -->
		<div>
			<div class="text-xs font-medium text-base-content/60 mb-2">Miembro</div>
			<div class="grid grid-cols-3 gap-2">
				<!-- Individual members -->
				{#each members as member}
					{@const isSelected = selectedMemberId === member.user_id}
					<button
						type="button"
						class="tooltip tooltip-bottom"
						data-tip={member.profiles?.display_name || 'Usuario'}
						onclick={() => {
							if (selectedMemberId === member.user_id) {
								selectedMemberId = 'all';
							} else {
								selectedMemberId = member.user_id!;
							}
						}}
					>
						<div
							class="avatar placeholder rounded-full {isSelected
								? 'ring ring-primary ring-offset-2'
								: 'opacity-60 hover:opacity-100'} transition-all cursor-pointer w-full"
						>
							<div class="bg-primary text-primary-content rounded-full w-full aspect-square">
								{#if member.profiles?.avatar_url}
									<img
										src={member.profiles.avatar_url}
										alt={member.profiles.display_name || 'Avatar'}
										referrerpolicy="no-referrer"
										crossorigin="anonymous"
									/>
								{:else}
									<span class="text-xs grid place-items-center h-full">
										{(member.profiles?.display_name || 'U').substring(0, 2).toUpperCase()}
									</span>
								{/if}
							</div>
						</div>
					</button>
				{/each}
			</div>
		</div>

		<!-- Event Filters (Chips) -->
		<div>
			<div class="text-xs font-medium text-base-content/60 mb-2">Evento</div>
			<div class="flex flex-col gap-2">
				<!-- Individual events -->
				{#each eventCategories as event}
					{@const isSelected = selectedEventId === event.id}
					<button
						type="button"
						class="btn btn-sm transition-all hover:scale-105 {isSelected
							? 'shadow-md'
							: 'btn-ghost'} w-full justify-start"
						style={isSelected
							? `background-color: ${event.color}; color: white; border-color: ${event.color};`
							: ''}
						onclick={() => {
							if (selectedEventId === event.id) {
								selectedEventId = 'all';
							} else {
								selectedEventId = event.id;
							}
						}}
					>
						<span>{event.icon}</span>
						<span>{event.name}</span>
					</button>
				{/each}
			</div>
		</div>

		<!-- Purchase Status Filter -->
		<div>
			<div class="text-xs font-medium text-base-content/60 mb-2">Estado</div>
			<div class="flex flex-col gap-2">
				<button
					type="button"
					class="btn btn-sm transition-all hover:scale-105 {selectedPurchaseStatus === 'purchased'
						? 'btn-success shadow-md text-white'
						: 'btn-ghost'} w-full justify-start"
					onclick={() => {
						if (selectedPurchaseStatus === 'purchased') {
							selectedPurchaseStatus = 'all';
						} else {
							selectedPurchaseStatus = 'purchased';
						}
					}}
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="20 6 9 17 4 12"></polyline>
					</svg>
					<span>Comprados</span>
				</button>
				<button
					type="button"
					class="btn btn-sm transition-all hover:scale-105 {selectedPurchaseStatus === 'not_purchased'
						? 'btn-info shadow-md text-white'
						: 'btn-ghost'} w-full justify-start"
					onclick={() => {
						if (selectedPurchaseStatus === 'not_purchased') {
							selectedPurchaseStatus = 'all';
						} else {
							selectedPurchaseStatus = 'not_purchased';
						}
					}}
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="9" cy="21" r="1"></circle>
						<circle cx="20" cy="21" r="1"></circle>
						<path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
					</svg>
					<span>Por comprar</span>
				</button>
			</div>
		</div>
	</div>
</aside>
