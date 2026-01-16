<script lang="ts">
	import { onMount } from 'svelte';
	import { createClient } from '$lib/supabase';
	import { page } from '$app/stores';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import { GAME_METADATA, type GameType } from '$lib/types/games';

	// Import components
	import RoomCard from './components/RoomCard.svelte';
	import CreateRoomModal from './components/CreateRoomModal.svelte';
	import JoinRoomModal from './components/JoinRoomModal.svelte';

	let { data }: { data: PageData } = $props();

	// Modal states
	let showCreateModal = $state(false);
	let showJoinModal = $state(false);

	// Filter state
	let selectedGameType = $state<GameType | 'all'>('all');

	// Realtime subscription
	onMount(() => {
		const supabase = createClient();
		const familyId = $page.params.familyId;

		// Create a single channel for all game lobby updates
		const channel = supabase
			.channel(`game-lobby:${familyId}`)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'game_rooms',
					filter: `family_id=eq.${familyId}`
				},
				(payload) => {
					console.log('Room change:', payload);
					invalidateAll();
				}
			)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'room_participants'
				},
				(payload) => {
					console.log('Participant change:', payload);
					invalidateAll();
				}
			)
			.subscribe((status) => {
				console.log('Realtime subscription status:', status);
			});

		return () => {
			supabase.removeChannel(channel);
		};
	});

	// Group participants by room
	let participantsByRoom = $derived(() => {
		const groups: Record<string, any[]> = {};

		for (const participant of data.participants) {
			if (!groups[participant.room_id]) {
				groups[participant.room_id] = [];
			}
			groups[participant.room_id].push(participant);
		}

		return groups;
	});

	// Filter rooms by game type
	let filteredRooms = $derived(() => {
		if (selectedGameType === 'all') {
			return data.rooms;
		}
		return data.rooms.filter(room => room.game_type === selectedGameType);
	});

	// Check if user is in a room
	function isUserInRoom(roomId: string): boolean {
		return data.userParticipation.some(p => p.room_id === roomId);
	}

	// Get participants for a room
	function getRoomParticipants(roomId: string) {
		return participantsByRoom()[roomId] || [];
	}
</script>

<div class="container mx-auto p-6 space-y-6">
	<!-- Header -->
	<div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
		<div>
			<h1 class="text-3xl font-bold">Mini Juegos</h1>
			<p class="text-base-content/70 mt-1">Juega con tu familia en tiempo real</p>
		</div>

		<div class="flex gap-2">
			<button onclick={() => (showJoinModal = true)} class="btn btn-outline gap-2">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="w-5 h-5"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"
					/>
				</svg>
				Unirse con código
			</button>
			<button onclick={() => (showCreateModal = true)} class="btn btn-primary gap-2">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="w-5 h-5"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
				</svg>
				Crear Sala
			</button>
		</div>
	</div>

	<!-- Game Type Filter -->
	<div class="flex flex-wrap gap-2">
		<button
			onclick={() => (selectedGameType = 'all')}
			class="btn btn-sm {selectedGameType === 'all' ? 'btn-primary' : 'btn-ghost'}"
		>
			Todos
		</button>
		{#each Object.entries(GAME_METADATA) as [type, metadata]}
			<button
				onclick={() => (selectedGameType = type as GameType)}
				class="btn btn-sm {selectedGameType === type ? 'btn-primary' : 'btn-ghost'}"
			>
				<span>{metadata.icon}</span>
				<span>{metadata.name}</span>
			</button>
		{/each}
	</div>

	<!-- Active Rooms -->
	<div>
		<h2 class="text-xl font-semibold mb-4">Salas Activas</h2>

		{#if filteredRooms().length === 0}
			<div class="card bg-base-200">
				<div class="card-body items-center text-center py-12">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="1.5"
						stroke="currentColor"
						class="w-16 h-16 text-base-content/30"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 01-.657.643 48.39 48.39 0 01-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 01-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 00-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 01-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 00.657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 01-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.4.604-.4.959v0c0 .333.277.599.61.58a48.1 48.1 0 005.427-.63 48.05 48.05 0 00.582-4.717.532.532 0 00-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.96.401v0a.656.656 0 00.658-.663 48.422 48.422 0 00-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 01-.61-.58v0z"
						/>
					</svg>
					<h3 class="text-lg font-semibold mt-4">No hay salas activas</h3>
					<p class="text-base-content/70">Crea una sala nueva para empezar a jugar</p>
					<button onclick={() => (showCreateModal = true)} class="btn btn-primary mt-4">
						Crear Primera Sala
					</button>
				</div>
			</div>
		{:else}
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{#each filteredRooms() as room (room.id)}
					<RoomCard
						{room}
						participants={getRoomParticipants(room.id)}
						isUserInRoom={isUserInRoom(room.id)}
						currentUserId={data.currentUserId}
					/>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Quick Stats / Leaderboards Preview -->
	<div>
		<h2 class="text-xl font-semibold mb-4">Clasificaciones</h2>
		<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
			{#each Object.entries(GAME_METADATA) as [type, metadata]}
				{@const leaderboard = data.leaderboards[type as GameType] || []}
				<div class="card bg-base-200">
					<div class="card-body">
						<h3 class="card-title text-lg">
							<span>{metadata.icon}</span>
							<span>{metadata.name}</span>
						</h3>

						{#if leaderboard.length === 0}
							<p class="text-sm text-base-content/60">No hay partidas aún</p>
						{:else}
							<div class="space-y-2 mt-2">
								{#each leaderboard.slice(0, 3) as entry, index}
									<div class="flex items-center gap-2">
										<div class="text-lg font-bold w-6">
											{#if index === 0}
												<span class="text-yellow-500">🥇</span>
											{:else if index === 1}
												<span class="text-gray-400">🥈</span>
											{:else if index === 2}
												<span class="text-orange-600">🥉</span>
											{/if}
										</div>
										<div class="avatar">
											<div class="w-8 h-8 rounded-full">
												{#if entry.avatar_url}
													<img src={entry.avatar_url} alt={entry.display_name} />
												{:else}
													<div class="bg-primary text-primary-content flex items-center justify-center">
														{entry.display_name.charAt(0).toUpperCase()}
													</div>
												{/if}
											</div>
										</div>
										<div class="flex-1 min-w-0">
											<div class="text-sm font-medium truncate">{entry.display_name}</div>
											<div class="text-xs text-base-content/60">
												{entry.games_won} victorias • {entry.win_rate}%
											</div>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	</div>
</div>

<!-- Modals -->
{#if showCreateModal}
	<CreateRoomModal
		members={data.members}
		onClose={() => (showCreateModal = false)}
	/>
{/if}

{#if showJoinModal}
	<JoinRoomModal
		onClose={() => (showJoinModal = false)}
	/>
{/if}
