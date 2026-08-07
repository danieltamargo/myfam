<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PlannerSnapshot } from '$lib/server/planner/queries';

	interface Props {
		familyId: string;
		familyName: string;
		planner: PlannerSnapshot;
		showFamilyName?: boolean;
	}

	let { familyId, familyName, planner, showFamilyName = false }: Props = $props();

	const eventDate = new Intl.DateTimeFormat('es-ES', {
		timeZone: 'Europe/Madrid',
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		hour: '2-digit',
		minute: '2-digit'
	});
	const allDayDate = new Intl.DateTimeFormat('es-ES', {
		timeZone: 'Europe/Madrid',
		weekday: 'short',
		day: 'numeric',
		month: 'short'
	});
	const taskDate = new Intl.DateTimeFormat('es-ES', {
		timeZone: 'UTC',
		day: 'numeric',
		month: 'short'
	});

	const quickActions = $derived(
		[
			{ id: 'gift', label: 'Nuevo regalo', icon: '🎁', path: 'wishlist', show: true },
			{
				id: 'expense',
				label: 'Añadir gasto',
				icon: '💶',
				path: 'expenses',
				show: planner.modules.expenses
			},
			{
				id: 'task',
				label: 'Nueva tarea',
				icon: '✅',
				path: 'tasks',
				show: planner.modules.tasks
			},
			{
				id: 'event',
				label: 'Nuevo evento',
				icon: '📅',
				path: 'calendar',
				show: planner.modules.calendar
			},
			{
				id: 'list',
				label: 'Nueva lista',
				icon: '🛒',
				path: 'lists',
				show: planner.modules.lists
			}
		].filter((action) => action.show)
	);
	const hasPlanningBlocks = $derived(
		planner.modules.calendar ||
			planner.modules.tasks ||
			planner.modules.lists ||
			planner.modules.expenses
	);

	function formatEvent(value: string, allDay: boolean): string {
		return (allDay ? allDayDate : eventDate).format(new Date(value));
	}

	function formatTask(value: string): string {
		return taskDate.format(new Date(`${value}T00:00:00Z`));
	}

	function formatCurrency(value: number, currency: string): string {
		return new Intl.NumberFormat('es-ES', {
			style: 'currency',
			currency,
			maximumFractionDigits: 2
		}).format(value);
	}
</script>

<section aria-label={`Planner de ${familyName}`} class="space-y-5">
	{#if showFamilyName}
		<div class="flex flex-wrap items-end justify-between gap-3">
			<div>
				<p class="text-xs font-semibold tracking-[0.18em] text-primary uppercase">Familia activa</p>
				<h2 class="mt-1 text-2xl font-bold">{familyName}</h2>
			</div>
			<a
				class="btn btn-ghost btn-sm"
				href={resolve(`/family/${encodeURIComponent(familyId)}/planner`)}
			>
				Abrir planner <span aria-hidden="true">→</span>
			</a>
		</div>
	{/if}

	<div>
		<h3 class="mb-2 text-sm font-semibold text-base-content/70">Acciones rápidas</h3>
		<nav aria-label="Acciones rápidas" class="flex gap-2 overflow-x-auto pb-1">
			{#each quickActions as action (action.id)}
				<a
					class="btn min-h-11 shrink-0 btn-outline btn-sm"
					href={resolve(`/family/${encodeURIComponent(familyId)}/${action.path}`)}
				>
					<span aria-hidden="true">{action.icon}</span>
					{action.label}
				</a>
			{/each}
		</nav>
	</div>

	{#if !hasPlanningBlocks}
		<div class="alert alert-soft alert-info" role="status">
			<span aria-hidden="true">🧭</span>
			<div>
				<p class="font-semibold">El planner está listo</p>
				<p class="text-sm">Los próximos módulos habilitados aparecerán aquí automáticamente.</p>
			</div>
		</div>
	{:else}
		<div
			class="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.8fr)]"
		>
			<div class="min-w-0 space-y-4">
				{#if planner.modules.tasks}
					<section
						aria-labelledby="planner-tasks-title"
						class="card border border-base-300 bg-base-100"
					>
						<div class="card-body gap-4 p-4 sm:p-5">
							<div class="flex items-center justify-between gap-3">
								<div>
									<p class="text-xs font-semibold tracking-wider text-error uppercase">Prioridad</p>
									<h3 id="planner-tasks-title" class="text-xl font-bold">Tareas pendientes</h3>
								</div>
								<a
									class="btn btn-ghost btn-xs"
									href={resolve(`/family/${encodeURIComponent(familyId)}/tasks?view=upcoming`)}
									>Ver todas</a
								>
							</div>
							<ul class="divide-y divide-base-300">
								{#each planner.tasks as task (task.id)}
									<li class="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
										<span
											aria-hidden="true"
											class={`size-2.5 shrink-0 rounded-full ${task.isOverdue ? 'bg-error' : 'bg-primary'}`}
										></span>
										<div class="min-w-0 flex-1">
											<p class="truncate font-medium">{task.title}</p>
											<p
												class={`text-xs ${task.isOverdue ? 'font-semibold text-error' : 'text-base-content/60'}`}
											>
												{task.isOverdue ? 'Vencida' : 'Próxima'} · {formatTask(task.dueOn)}
											</p>
										</div>
										{#if task.priority === 'urgent' || task.priority === 'high'}
											<span
												class={`badge badge-sm ${task.priority === 'urgent' ? 'badge-error' : 'badge-warning'}`}
											>
												{task.priority === 'urgent' ? 'Urgente' : 'Alta'}
											</span>
										{/if}
									</li>
								{:else}
									<li class="py-4 text-sm text-base-content/60">
										Nada vence en los próximos 14 días.
									</li>
								{/each}
							</ul>
						</div>
					</section>
				{/if}

				{#if planner.modules.calendar}
					<section
						aria-labelledby="planner-events-title"
						class="card border border-base-300 bg-base-100"
					>
						<div class="card-body gap-4 p-4 sm:p-5">
							<div class="flex items-center justify-between gap-3">
								<div>
									<p class="text-xs font-semibold tracking-wider text-primary uppercase">
										Próximos 14 días
									</p>
									<h3 id="planner-events-title" class="text-xl font-bold">Agenda familiar</h3>
								</div>
								<a
									class="btn btn-ghost btn-xs"
									href={resolve(`/family/${encodeURIComponent(familyId)}/calendar`)}>Calendario</a
								>
							</div>
							<ol class="space-y-2">
								{#each planner.events as event (`${event.id}-${event.startsAt}`)}
									<li>
										<a
											class="flex min-h-12 items-center gap-3 rounded-box bg-base-200 px-3 py-2 transition-colors hover:bg-base-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
											href={resolve(
												`/family/${encodeURIComponent(familyId)}/calendar?event=${encodeURIComponent(event.id)}`
											)}
										>
											<span aria-hidden="true" class="text-xl">📅</span>
											<span class="min-w-0 flex-1">
												<span class="block truncate font-medium">{event.title}</span>
												<span class="block text-xs text-base-content/60"
													>{formatEvent(event.startsAt, event.allDay)}</span
												>
											</span>
										</a>
									</li>
								{:else}
									<li class="py-4 text-sm text-base-content/60">No hay eventos próximos.</li>
								{/each}
							</ol>
						</div>
					</section>
				{/if}
			</div>

			<aside class="min-w-0 space-y-4" aria-label="Resumen familiar">
				{#if planner.modules.lists}
					<section
						aria-labelledby="planner-lists-title"
						class="card border border-base-300 bg-base-100"
					>
						<div class="card-body gap-3 p-4 sm:p-5">
							<div class="flex items-center justify-between gap-3">
								<h3 id="planner-lists-title" class="text-lg font-bold">Listas activas</h3>
								<a
									class="btn btn-ghost btn-xs"
									href={resolve(`/family/${encodeURIComponent(familyId)}/lists`)}>Ver listas</a
								>
							</div>
							<ul class="space-y-2">
								{#each planner.lists as list (list.id)}
									<li>
										<a
											class="block rounded-box bg-base-200 p-3 hover:bg-base-300"
											href={resolve(
												`/family/${encodeURIComponent(familyId)}/lists?list=${encodeURIComponent(list.id)}`
											)}
										>
											<span class="block truncate font-medium">{list.title}</span>
											<span class="mt-1 block text-xs text-base-content/60">
												{list.completedItems} de {list.totalItems} completados
											</span>
										</a>
									</li>
								{:else}
									<li class="py-3 text-sm text-base-content/60">Todavía no hay listas activas.</li>
								{/each}
							</ul>
						</div>
					</section>
				{/if}

				{#if planner.modules.expenses}
					<section
						aria-labelledby="planner-expenses-title"
						class="card border border-base-300 bg-base-100"
					>
						<div class="card-body gap-3 p-4 sm:p-5">
							<div class="flex items-center justify-between gap-3">
								<div>
									<p class="text-xs font-semibold tracking-wider text-secondary uppercase">
										Este mes
									</p>
									<h3 id="planner-expenses-title" class="text-lg font-bold">Gastos accesibles</h3>
								</div>
								<a
									class="btn btn-ghost btn-xs"
									href={resolve(`/family/${encodeURIComponent(familyId)}/expenses`)}>Detalle</a
								>
							</div>
							<div class="space-y-2">
								{#each planner.expenses as expense (expense.currency)}
									<div class="rounded-box bg-base-200 p-3">
										<p class="text-2xl font-bold tabular-nums">
											{formatCurrency(expense.total, expense.currency)}
										</p>
										<p class="text-xs text-base-content/60">
											{expense.collectionCount}
											{expense.collectionCount === 1
												? 'colección accesible'
												: 'colecciones accesibles'}
										</p>
									</div>
								{:else}
									<p class="py-3 text-sm text-base-content/60">
										No tienes colecciones activas accesibles.
									</p>
								{/each}
							</div>
						</div>
					</section>
				{/if}
			</aside>
		</div>
	{/if}
</section>
