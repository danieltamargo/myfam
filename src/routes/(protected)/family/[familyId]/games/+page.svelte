<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import { createClient } from '$lib/supabase';
	import type { PageProps } from './$types';
	import {
		FAMILY_GAME_TYPES,
		FAMILY_GAME_NAMES,
		type FamilyGameType
	} from '$lib/games/family-games';

	let { data, form }: PageProps = $props();
	let opponent = $state('');
	let gameType = $state<FamilyGameType>('tic_tac_toe');
	let busy = $state(false);
	let syncError = $state('');
	const opponents = $derived(
		data.members.filter((member) => member.user_id !== data.currentUserId)
	);
	const statusLabels: Record<string, string> = {
		waiting: 'Esperando',
		in_progress: 'En juego',
		finished: 'Finalizada',
		cancelled: 'Cancelada'
	};

	onMount(() => {
		const supabase = createClient();
		let refreshing = false;
		async function refresh() {
			if (refreshing || busy) return;
			refreshing = true;
			try {
				await invalidateAll();
				syncError = '';
			} catch {
				syncError = 'No se pudieron actualizar las partidas. Recarga la página.';
			} finally {
				refreshing = false;
			}
		}
		const channel = supabase.channel(`family-games:${data.familyId}`).on(
			'postgres_changes',
			{
				event: '*',
				schema: 'public',
				table: 'game_rooms',
				filter: `family_id=eq.${data.familyId}`
			},
			refresh
		);
		let active = true;
		void supabase.realtime
			.setAuth()
			.then(() => {
				if (!active) return;
				channel.subscribe((status) => {
					if (status === 'SUBSCRIBED') void refresh();
				});
			})
			.catch(() => {
				if (active) syncError = 'No se pudieron conectar las partidas. Recarga la página.';
			});
		const timer = setInterval(() => {
			if (document.visibilityState === 'visible') void refresh();
		}, 15_000);
		return () => {
			active = false;
			clearInterval(timer);
			void supabase.removeChannel(channel);
		};
	});
</script>

<svelte:head><title>Partidas familiares · MyFamily</title></svelte:head>

<div class="mx-auto max-w-4xl space-y-8 pb-10">
	<header>
		<h1 class="text-3xl font-bold">Juegos en familia</h1>
		<p class="mt-2 text-base-content/70">
			Invita a un familiar a tres en raya, Wordle compartido, reacción o acertar el color. Abandonar
			una partida en curso concede la victoria al otro jugador.
		</p>
	</header>
	{#if form?.error || syncError}<p class="alert alert-error" role="alert">
			{form?.error || syncError}
		</p>{/if}
	<section class="rounded-box border border-base-300 bg-base-100 p-5" aria-labelledby="create-game">
		<h2 id="create-game" class="text-xl font-semibold">Nueva partida</h2>
		{#if opponents.length === 0}
			<p class="mt-3">Invita a otro miembro a la familia para poder jugar.</p>
		{:else}
			<form
				method="POST"
				action="?/createRoom"
				class="mt-4 space-y-5"
				use:enhance={({ cancel }) => {
					if (busy) {
						cancel();
						return;
					}
					busy = true;
					return async ({ update }) => {
						try {
							await update();
						} catch {
							syncError = 'No se pudo crear la partida. Inténtalo de nuevo.';
						} finally {
							busy = false;
						}
					};
				}}
			>
				<label class="block space-y-2"
					><span>Juego</span><select name="gameType" class="select w-full" bind:value={gameType}
						>{#each FAMILY_GAME_TYPES as type (type)}<option value={type}
								>{FAMILY_GAME_NAMES[type]}</option
							>{/each}</select
					></label
				>
				<label class="block space-y-2"
					><span>Nombre de la partida</span><input
						name="name"
						class="input w-full"
						maxlength="100"
						value={FAMILY_GAME_NAMES[gameType]}
						required
					/></label
				>
				<fieldset class="min-w-0">
					<legend class="mb-3 font-semibold">Con quién quieres jugar</legend>
					<div class="flex flex-wrap gap-3">
						{#each opponents as member (member.user_id)}
							<label
								class="flex max-w-full min-w-0 cursor-pointer items-center gap-3 rounded-box border border-base-300 p-3 has-checked:border-primary has-checked:bg-primary/10"
							>
								<input
									type="radio"
									name="opponent"
									class="radio radio-sm"
									value={member.user_id ?? ''}
									bind:group={opponent}
									required
								/>
								{#if member.profile?.avatar_url}<img
										class="h-10 w-10 rounded-full object-cover"
										src={member.profile.avatar_url}
										alt=""
									/>{:else}<span
										class="flex h-10 w-10 items-center justify-center rounded-full bg-base-200"
										aria-hidden="true">{member.profile?.display_name?.charAt(0) || '?'}</span
									>{/if}
								<span class="min-w-0 break-words">{member.profile?.display_name || 'Familiar'}</span
								>
							</label>
						{/each}
					</div>
				</fieldset>
				<button class="btn btn-primary" disabled={busy || !opponent}
					>{busy ? 'Creando…' : 'Invitar a jugar'}</button
				>
			</form>
		{/if}
	</section>
	<section aria-labelledby="my-games">
		<h2 id="my-games" class="mb-4 text-xl font-semibold">Mis partidas recientes</h2>
		<div class="space-y-3">
			{#each data.rooms as room (room.id)}
				<a
					class="flex items-center justify-between gap-3 rounded-box border border-base-300 p-4 hover:bg-base-200"
					href={resolve(
						...([`/family/${data.familyId}/games/play/${room.id}`] as unknown as ['/'])
					)}
				>
					<span class="min-w-0 break-words"
						><span class="block font-medium">{room.name}</span><span
							class="text-sm text-base-content/70"
							>{FAMILY_GAME_NAMES[room.game_type as FamilyGameType] || 'Partida'}</span
						></span
					><span class="shrink-0 text-sm">{statusLabels[room.status]}</span>
				</a>
			{:else}<p class="rounded-box border border-dashed border-base-300 p-6">
					Aún no tienes partidas. Elige un familiar para empezar.
				</p>{/each}
		</div>
	</section>
</div>
