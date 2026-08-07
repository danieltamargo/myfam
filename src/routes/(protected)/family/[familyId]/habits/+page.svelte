<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let showCreate = $state(false);
	let visibility = $state('private');

	function formatDay(date: string): { weekday: string; day: string } {
		const value = new Date(`${date}T00:00:00Z`);
		return {
			weekday: new Intl.DateTimeFormat('es-ES', { weekday: 'short', timeZone: 'UTC' }).format(
				value
			),
			day: new Intl.DateTimeFormat('es-ES', { day: 'numeric', timeZone: 'UTC' }).format(value)
		};
	}

	function memberName(id: string): string {
		return data.members.find((member) => member.id === id)?.displayName ?? 'Usuario';
	}
</script>

<svelte:head>
	<title>Hábitos · MyFamily</title>
	<meta
		name="description"
		content="Registra rutinas personales y compártelas solo con quien elijas."
	/>
</svelte:head>

<div class="mx-auto w-full max-w-6xl space-y-7 px-3 py-4 sm:px-5 sm:py-7">
	<header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div class="max-w-2xl">
			<p class="mb-1 text-sm font-semibold tracking-wide text-primary uppercase">A tu ritmo</p>
			<h1 class="text-3xl font-bold tracking-tight sm:text-4xl">Hábitos</h1>
			<p class="mt-2 text-sm text-base-content/65 sm:text-base">
				Un registro diario privado por defecto. Sin puntos, rankings ni comparaciones.
			</p>
		</div>
		<button
			class="btn btn-primary sm:self-center"
			type="button"
			onclick={() => (showCreate = !showCreate)}
		>
			{showCreate ? 'Cerrar formulario' : '+ Nuevo hábito'}
		</button>
	</header>

	{#if form?.error}
		<div role="alert" class="alert alert-soft alert-error"><span>{form.error}</span></div>
	{:else if form?.message}
		<div role="status" class="alert alert-soft alert-success"><span>{form.message}</span></div>
	{/if}

	{#if showCreate}
		<section
			id="new-habit"
			class="rounded-box border border-base-300 bg-base-100 p-4 sm:p-6"
			aria-labelledby="new-habit-title"
		>
			<div class="mb-5">
				<h2 id="new-habit-title" class="text-xl font-bold">Nuevo hábito</h2>
				<p class="text-sm text-base-content/55">Solo tú podrás marcar o archivar este registro.</p>
			</div>
			<form method="POST" action="?/createHabit" use:enhance class="space-y-5">
				<div class="grid gap-4 md:grid-cols-2">
					<label class="form-control md:col-span-2">
						<span class="label-text mb-1 font-medium">Nombre</span>
						<input
							class="input w-full"
							name="title"
							maxlength="120"
							placeholder="Leer veinte minutos"
							required
						/>
					</label>
					<label class="form-control md:col-span-2">
						<span class="label-text mb-1 font-medium">Descripción opcional</span>
						<textarea class="textarea min-h-24 w-full" name="description" maxlength="2000"
						></textarea>
					</label>
					<label class="form-control">
						<span class="label-text mb-1 font-medium">Empieza el</span>
						<input class="input w-full" name="start_on" type="date" value={data.days[6]} required />
					</label>
					<label class="form-control">
						<span class="label-text mb-1 font-medium">Privacidad</span>
						<select class="select w-full" name="visibility" bind:value={visibility}>
							<option value="private">Solo yo</option>
							<option value="selected_members">Personas seleccionadas</option>
						</select>
					</label>
				</div>
				{#if visibility === 'selected_members'}
					<fieldset>
						<legend class="mb-2 font-medium">¿Quién puede verlo?</legend>
						<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
							{#each data.members.filter((member) => member.id !== data.currentUserId) as member (member.id)}
								<label
									class="flex min-h-11 cursor-pointer items-center gap-3 rounded-field border border-base-300 px-3 py-2"
								>
									<input
										class="checkbox checkbox-sm checkbox-primary"
										type="checkbox"
										name="member_ids"
										value={member.id}
									/>
									<span class="truncate text-sm">{member.displayName}</span>
								</label>
							{/each}
						</div>
					</fieldset>
				{/if}
				<div class="flex justify-end">
					<button class="btn w-full btn-primary sm:w-auto" type="submit">Crear hábito</button>
				</div>
			</form>
		</section>
	{/if}

	<section aria-labelledby="habit-list-title" class="space-y-4">
		<div class="flex items-end justify-between gap-3">
			<div>
				<h2 id="habit-list-title" class="text-xl font-bold">Últimos siete días</h2>
				<p class="text-sm text-base-content/50">Marca solo tu propio avance diario.</p>
			</div>
			<span class="badge badge-ghost">{data.habits.length} activos</span>
		</div>

		{#if data.habits.length === 0}
			<div
				class="rounded-box border border-dashed border-base-300 bg-base-100 px-5 py-12 text-center"
			>
				<p class="text-3xl" aria-hidden="true">○</p>
				<h3 class="mt-2 font-semibold">Un espacio tranquilo para empezar</h3>
				<p class="mt-1 text-sm text-base-content/55">
					Crea un hábito; será privado mientras no elijas compartirlo.
				</p>
			</div>
		{:else}
			<div class="space-y-4">
				{#each data.habits as habit (habit.id)}
					<article class="rounded-box border border-base-300 bg-base-100 p-4 sm:p-5">
						<div class="flex flex-col gap-5 lg:flex-row lg:items-center">
							<div class="min-w-0 lg:w-72 lg:shrink-0">
								<div class="flex flex-wrap items-center gap-2">
									<h3 class="text-lg font-bold">{habit.title}</h3>
									<span
										class="badge badge-sm {habit.visibility === 'private'
											? 'badge-neutral'
											: 'badge-soft badge-primary'}"
									>
										{habit.visibility === 'private' ? '🔒 Solo yo' : '◉ Compartido'}
									</span>
								</div>
								{#if habit.description}<p class="mt-1 text-sm text-base-content/60">
										{habit.description}
									</p>{/if}
								<p class="mt-2 text-xs text-base-content/45">Creado por {habit.creatorName}</p>
								{#if habit.selectedMemberIds.length > 0}
									<p class="mt-1 text-xs text-base-content/50">
										Visible para {habit.selectedMemberIds.map(memberName).join(', ')}
									</p>
								{/if}
							</div>

							<div
								class="grid flex-1 grid-cols-7 gap-1.5"
								aria-label={`Registro de ${habit.title}`}
							>
								{#each data.days as day (day)}
									{@const completed = habit.completedDates.includes(day)}
									{@const available = day >= habit.start_on}
									<div class="text-center">
										<p class="mb-1 text-[0.65rem] font-semibold text-base-content/45 uppercase">
											{formatDay(day).weekday}
										</p>
										{#if habit.canManage && available}
											<form method="POST" action="?/setCompletion" use:enhance>
												<input type="hidden" name="habit_id" value={habit.id} />
												<input type="hidden" name="completed_on" value={day} />
												<input
													type="hidden"
													name="completed"
													value={completed ? 'false' : 'true'}
												/>
												<button
													class="btn h-11 min-h-11 w-full px-0 {completed
														? 'btn-primary'
														: 'bg-base-200 btn-ghost'}"
													type="submit"
													aria-label={`${completed ? 'Desmarcar' : 'Marcar'} ${habit.title} el ${day}`}
													aria-pressed={completed}
												>
													{completed ? '✓' : formatDay(day).day}
												</button>
											</form>
										{:else}
											<div
												class="flex h-11 items-center justify-center rounded-field bg-base-200 text-sm {completed
													? 'font-bold text-success'
													: 'text-base-content/35'}"
												aria-label={completed ? `Completado el ${day}` : `Sin completar el ${day}`}
											>
												{completed ? '✓' : formatDay(day).day}
											</div>
										{/if}
									</div>
								{/each}
							</div>

							{#if habit.canManage}
								<form method="POST" action="?/archiveHabit" use:enhance class="lg:shrink-0">
									<input type="hidden" name="habit_id" value={habit.id} />
									<button class="btn w-full btn-ghost btn-sm lg:w-auto" type="submit"
										>Archivar</button
									>
								</form>
							{/if}
						</div>
					</article>
				{/each}
			</div>
		{/if}
	</section>
</div>
