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
		icon: string;
		color: string;
	};

	let {
		members,
		eventCategories,
		selectedMemberId = $bindable(),
		selectedEventId = $bindable()
	}: {
		members: Member[];
		eventCategories: EventCategory[];
		selectedMemberId: string | 'all';
		selectedEventId: string | 'all';
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
	</div>
</aside>
