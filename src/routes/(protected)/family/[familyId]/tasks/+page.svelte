<script lang="ts">
	import { getLocale } from '$paraglide/runtime';
	import * as messages from '$paraglide/messages';
	import MemberRadioFilter from '$lib/components/ui/MemberRadioFilter.svelte';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let showCreate = $state(false);
	let recurrence = $state('none');

	const views = [
		{ id: 'mine', label: 'Mías' },
		{ id: 'family', label: 'Familia' },
		{ id: 'overdue', label: 'Vencidas' },
		{ id: 'upcoming', label: 'Próximas' }
	] as const;

	const openCount = $derived(
		data.tasks.filter((task) => task.status === 'todo' || task.status === 'in_progress').length
	);
	const completedCount = $derived(data.tasks.filter((task) => task.status === 'completed').length);

	function formatDate(date: string | null): string {
		if (!date) return 'Sin fecha';
		return new Intl.DateTimeFormat(getLocale() === 'en' ? 'en-GB' : 'es-ES', {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			timeZone: 'UTC'
		}).format(new Date(`${date}T00:00:00Z`));
	}

	function priorityLabel(priority: string): string {
		return { low: 'Baja', normal: 'Normal', high: 'Alta', urgent: 'Urgente' }[priority] ?? priority;
	}

	function priorityClass(priority: string): string {
		return (
			{
				low: 'badge-ghost',
				normal: 'badge-info badge-soft',
				high: 'badge-warning badge-soft',
				urgent: 'badge-error badge-soft'
			}[priority] ?? 'badge-ghost'
		);
	}

	function statusLabel(status: string): string {
		return (
			{
				todo: 'Pendiente',
				in_progress: 'En curso',
				completed: 'Completada',
				cancelled: 'Cancelada'
			}[status] ?? status
		);
	}

	function memberName(id: string): string {
		return data.members.find((member) => member.id === id)?.displayName ?? 'Usuario';
	}
</script>

<svelte:head>
	<title>{messages['ui.family_tasks_myfamily']()}</title>
	<meta
		name="description"
		content="Organiza responsabilidades, responsables y vencimientos de tu familia."
	/>
</svelte:head>

<div class="mx-auto w-full max-w-6xl space-y-6 px-3 py-4 sm:px-5 sm:py-7">
	<header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div class="max-w-2xl">
			<p class="mb-1 text-sm font-semibold tracking-wide text-primary uppercase">
				{messages['screen.family_tasks']()}
			</p>
			<h1 class="text-3xl font-bold tracking-tight sm:text-4xl">{messages['ui.family_tasks']()}</h1>
			<p class="mt-2 text-sm text-base-content/65 sm:text-base">
				{messages['screen.share_household_tasks_and_see_what_s_left_to_do']()}
			</p>
		</div>
		<button
			class="btn btn-primary sm:self-center"
			type="button"
			onclick={() => (showCreate = !showCreate)}
		>
			{showCreate ? 'Cerrar formulario' : '+ Nueva tarea'}
		</button>
	</header>

	<form method="GET" class="rounded-box border border-base-300 bg-base-100 p-3 sm:p-4">
		<input type="hidden" name="view" value={data.view} />
		<MemberRadioFilter
			name="member"
			label="Responsable"
			members={data.members}
			value={data.selectedMember}
			autoSubmit
		/>
	</form>

	{#if form?.error}
		<div role="alert" class="alert alert-soft alert-error">
			<span>{form.error}</span>
		</div>
	{:else if form?.message}
		<div role="status" class="alert alert-soft alert-success">
			<span>{form.message}</span>
		</div>
	{/if}

	<section aria-label="Resumen de tareas" class="grid grid-cols-2 gap-3 sm:grid-cols-4">
		<div class="rounded-box border border-base-300 bg-base-100 p-4">
			<p class="text-2xl font-bold">{openCount}</p>
			<p class="text-xs text-base-content/55">{messages['screen.open_in_this_view']()}</p>
		</div>
		<div class="rounded-box border border-base-300 bg-base-100 p-4">
			<p class="text-2xl font-bold">{completedCount}</p>
			<p class="text-xs text-base-content/55">{messages['screen.completed']()}</p>
		</div>
		<div class="rounded-box border border-base-300 bg-base-100 p-4">
			<p class="text-2xl font-bold">{data.groups.length}</p>
			<p class="text-xs text-base-content/55">{messages['screen.active_groups']()}</p>
		</div>
		<div class="rounded-box border border-base-300 bg-base-100 p-4">
			<p class="text-2xl font-bold">{data.members.length}</p>
			<p class="text-xs text-base-content/55">{messages['details.people']()}</p>
		</div>
	</section>

	{#if showCreate}
		<section id="nueva-tarea" class="rounded-box border border-base-300 bg-base-100 p-4 sm:p-6">
			<div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h2 class="text-xl font-bold">{messages['ui.new_task']()}</h2>
					<p class="text-sm text-base-content/55">
						{messages['screen.assign_people_and_set_due_dates_in_one_place']()}
					</p>
				</div>
				<form method="POST" action="?/createGroup" use:enhance class="join w-full sm:w-auto">
					<label class="sr-only" for="group-name">{messages['ui.new_group']()}</label>
					<input
						id="group-name"
						name="name"
						class="input join-item min-w-0 flex-1 sm:w-40"
						placeholder={messages['ui.new_group']()}
						maxlength="80"
						required
					/>
					<button class="btn join-item" type="submit">{messages['ui.create_group']()}</button>
				</form>
			</div>

			<form method="POST" action="?/createTask" use:enhance class="space-y-5">
				<div class="grid gap-4 md:grid-cols-2">
					<label class="form-control md:col-span-2">
						<span class="label-text mb-1 font-medium">{messages['ui.title']()}</span>
						<input class="input w-full" name="title" maxlength="160" required />
					</label>
					<label class="form-control md:col-span-2">
						<span class="label-text mb-1 font-medium">{messages['ui.description']()}</span>
						<textarea class="textarea min-h-24 w-full" name="description" maxlength="4000"
						></textarea>
					</label>
					<label class="form-control">
						<span class="label-text mb-1 font-medium">{messages['details.group']()}</span>
						<select class="select w-full" name="group_id">
							<option value="">{messages['ui.no_group']()}</option>
							{#each data.groups as group (group.id)}
								<option value={group.id}>{group.name}</option>
							{/each}
						</select>
					</label>
					<label class="form-control">
						<span class="label-text mb-1 font-medium">{messages['ui.priority']()}</span>
						<select class="select w-full" name="priority">
							<option value="normal">Normal</option>
							<option value="low">{messages['ui.low']()}</option>
							<option value="high">{messages['ui.high']()}</option>
							<option value="urgent">{messages['ui.urgent']()}</option>
						</select>
					</label>
					<label class="form-control">
						<span class="label-text mb-1 font-medium">{messages['screen.due_date']()}</span>
						<input class="input w-full" name="due_on" type="date" />
					</label>
					<label class="form-control">
						<span class="label-text mb-1 font-medium">{messages['ui.repeat']()}</span>
						<select class="select w-full" name="recurrence_frequency" bind:value={recurrence}>
							<option value="none">{messages['ui.does_not_repeat']()}</option>
							<option value="daily">{messages['ui.daily']()}</option>
							<option value="weekly">{messages['ui.weekly']()}</option>
							<option value="monthly">{messages['ui.monthly']()}</option>
						</select>
					</label>
					{#if recurrence !== 'none'}
						<label class="form-control">
							<span class="label-text mb-1 font-medium">{messages['ui.every']()}</span>
							<input
								class="input w-full"
								name="recurrence_interval"
								type="number"
								min="1"
								max="30"
								value="1"
								required
							/>
						</label>
						<label class="form-control">
							<span class="label-text mb-1 font-medium">{messages['ui.repeat_until']()}</span>
							<input class="input w-full" name="recurrence_until" type="date" required />
						</label>
					{:else}
						<input type="hidden" name="recurrence_interval" value="1" />
					{/if}
				</div>

				<div class="grid gap-5 lg:grid-cols-2">
					<fieldset>
						<legend class="mb-2 font-medium">{messages['screen.assigned_to']()}</legend>
						<div class="grid gap-2 sm:grid-cols-2">
							{#each data.members as member (member.id)}
								<label
									class="flex min-h-11 cursor-pointer items-center gap-3 rounded-field border border-base-300 px-3 py-2"
								>
									<input
										class="checkbox checkbox-sm checkbox-primary"
										type="checkbox"
										name="assignee_ids"
										value={member.id}
									/>
									<span class="truncate text-sm">{member.displayName}</span>
								</label>
							{/each}
						</div>
					</fieldset>
					<fieldset>
						<legend class="mb-2 font-medium">{messages['details.mentions']()}</legend>
						<div class="grid gap-2 sm:grid-cols-2">
							{#each data.members as member (member.id)}
								<label
									class="flex min-h-11 cursor-pointer items-center gap-3 rounded-field border border-base-300 px-3 py-2"
								>
									<input
										class="checkbox checkbox-sm checkbox-secondary"
										type="checkbox"
										name="mention_ids"
										value={member.id}
									/>
									<span class="truncate text-sm">{member.displayName}</span>
								</label>
							{/each}
						</div>
					</fieldset>
				</div>
				<div class="flex justify-end">
					<button class="btn w-full btn-primary sm:w-auto" type="submit"
						>{messages['ui.create_task']()}</button
					>
				</div>
			</form>
		</section>
	{/if}

	<nav aria-label="Vistas de tareas" class="tabs-box tabs w-full overflow-x-auto sm:w-fit">
		{#each views as view (view.id)}
			<a
				class="tab whitespace-nowrap {data.view === view.id ? 'tab-active' : ''}"
				href={resolve(
					`/family/${data.familyId}/tasks?view=${view.id}&member=${data.selectedMember}`
				)}
			>
				{view.label}
			</a>
		{/each}
	</nav>

	<section aria-labelledby="task-list-title" class="space-y-3">
		<div class="flex items-center justify-between gap-3">
			<h2 id="task-list-title" class="text-xl font-bold">
				{views.find((view) => view.id === data.view)?.label}
			</h2>
			<span class="text-sm text-base-content/50"
				>{data.tasks.length} {messages['details.tasks']()}</span
			>
		</div>

		{#if data.tasks.length === 0}
			<div
				class="rounded-box border border-dashed border-base-300 bg-base-100 px-5 py-12 text-center"
			>
				<p class="text-3xl" aria-hidden="true">✓</p>
				<h3 class="mt-2 font-semibold">{messages['ui.all_clear']()}</h3>
				<p class="mt-1 text-sm text-base-content/55">
					{messages['screen.no_tasks_match_this_view']()}
				</p>
			</div>
		{:else}
			{#each data.tasks as task (task.id)}
				<article
					class="rounded-box border border-base-300 bg-base-100 p-4 transition-colors hover:border-primary/40 sm:p-5"
				>
					<div class="flex items-start gap-3 sm:gap-4">
						{#if task.canManage && task.status !== 'completed' && task.status !== 'cancelled'}
							<form method="POST" action="?/setStatus" use:enhance>
								<input type="hidden" name="task_id" value={task.id} />
								<input type="hidden" name="version" value={task.version} />
								<input type="hidden" name="status" value="completed" />
								<button
									class="btn mt-0.5 btn-circle btn-ghost btn-sm"
									type="submit"
									aria-label={`Completar ${task.title}`}
								>
									<span class="h-5 w-5 rounded-full border-2 border-base-content/35"></span>
								</button>
							</form>
						{:else}
							<span
								class="mt-2 h-5 w-5 shrink-0 rounded-full bg-success text-center text-xs leading-5 text-success-content"
								>✓</span
							>
						{/if}

						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-2">
								<h3
									class="min-w-0 text-base font-semibold {task.status === 'completed'
										? 'line-through opacity-55'
										: ''}"
								>
									{task.title}
								</h3>
								<span class="badge badge-sm {priorityClass(task.priority)}"
									>{priorityLabel(task.priority)}</span
								>
								<span class="badge badge-ghost badge-sm">{statusLabel(task.status)}</span>
							</div>
							{#if task.description}
								<p class="mt-1 line-clamp-2 text-sm text-base-content/65">{task.description}</p>
							{/if}
							<div
								class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-base-content/55"
							>
								<span
									class={task.due_on &&
									task.due_on < new Date().toISOString().slice(0, 10) &&
									task.status !== 'completed'
										? 'font-semibold text-error'
										: ''}
								>
									📅 {formatDate(task.due_on)}
								</span>
								{#if task.groupName}<span>⌁ {task.groupName}</span>{/if}
								{#if task.recurrence_frequency !== 'none'}<span
										>↻ {task.recurrence_frequency === 'daily'
											? 'Diaria'
											: task.recurrence_frequency === 'weekly'
												? 'Semanal'
												: 'Mensual'}</span
									>{/if}
								<span>{messages['details.created_by_98']()} {task.creatorName}</span>
							</div>
							{#if task.assigneeIds.length > 0}
								<div
									class="mt-3 flex flex-wrap gap-1.5"
									aria-label={messages['screen.assigned_to']()}
								>
									{#each task.assigneeIds as assigneeId (assigneeId)}
										<span class="badge badge-outline badge-sm">{memberName(assigneeId)}</span>
									{/each}
								</div>
							{/if}
						</div>
						{#if task.canManage && task.status === 'todo'}
							<form method="POST" action="?/setStatus" use:enhance class="shrink-0">
								<input type="hidden" name="task_id" value={task.id} />
								<input type="hidden" name="version" value={task.version} />
								<input type="hidden" name="status" value="in_progress" />
								<button class="btn hidden btn-ghost btn-sm sm:inline-flex" type="submit"
									>{messages['ui.get_started']()}</button
								>
							</form>
						{/if}
					</div>
				</article>
			{/each}
		{/if}
	</section>
</div>
