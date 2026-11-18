<script lang="ts">
	import { getLocale } from '$paraglide/runtime';
	import * as messages from '$paraglide/messages';
	import { resolve } from '$app/paths';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const canManage = $derived(
		data.collection.role === 'owner' || data.collection.role === 'manager'
	);
	const isOwner = $derived(data.collection.role === 'owner');
	const visibleMembers = $derived(
		data.members.filter((member) => member.status === 'active' || member.status === 'invited')
	);
	const transferableMembers = $derived(
		data.members.filter(
			(member) => member.status === 'active' && member.userId !== data.currentUserId
		)
	);

	function roleLabel(role: string): string {
		return (
			{
				owner: 'Propietario',
				manager: 'Gestor',
				contributor: 'Colaborador',
				viewer: 'Solo lectura'
			}[role] ?? role
		);
	}

	function canRevoke(role: string, userId: string): boolean {
		if (userId === data.currentUserId || role === 'owner') return false;
		return isOwner || (data.collection.role === 'manager' && role !== 'manager');
	}
</script>

<svelte:head>
	<title>{messages['details.settings_for']()} {data.collection.name} · MyFamily</title>
</svelte:head>

<div class="mx-auto max-w-5xl space-y-6 pb-12">
	<nav class="breadcrumbs text-sm text-base-content/60" aria-label="Ruta de navegación">
		<ul>
			<li>
				<a href={resolve(`/family/${data.family.id}/expenses` as '/')}
					>{messages['ui.expenses']()}</a
				>
			</li>
			<li>
				<a href={resolve(`/family/${data.family.id}/expenses/${data.collection.id}` as '/')}
					>{data.collection.name}</a
				>
			</li>
			<li>{messages['details.settings']()}</li>
		</ul>
	</nav>

	<header>
		<p class="text-sm font-semibold tracking-wide text-primary uppercase">
			{messages['screen.access_settings']()}
		</p>
		<h1 class="mt-1 text-3xl font-bold tracking-tight">
			{messages['screen.collection_settings']()}
		</h1>
		<p class="mt-2 text-base-content/60">
			{messages['screen.you_can_choose_who_has_access_to_expenses_for_each_collection']()}
		</p>
	</header>

	{#if form?.error}
		<div class="alert alert-error" role="alert"><span>{form.error}</span></div>
	{:else if form?.message}
		<div class="alert alert-success" role="status"><span>{form.message}</span></div>
	{/if}

	<section aria-labelledby="datos-coleccion" class="card bg-base-100 card-border">
		<div class="card-body gap-5">
			<div>
				<h2 id="datos-coleccion" class="card-title">{messages['screen.general_details']()}</h2>
				<p class="mt-1 text-sm text-base-content/60">
					{messages['screen.name_description_and_currency_for_the_collection']()}
				</p>
			</div>
			{#if canManage}
				<form method="POST" action="?/updateCollection" class="grid gap-4 md:grid-cols-6">
					<label class="form-control md:col-span-4" for="settings-collection-name">
						<span class="label-text mb-2 font-medium">{messages['ui.name']()}</span>
						<input
							id="settings-collection-name"
							class="input-bordered input"
							name="name"
							maxlength="80"
							value={data.collection.name}
							required
						/>
					</label>
					<label class="form-control md:col-span-2" for="settings-collection-currency">
						<span class="label-text mb-2 font-medium">{messages['ui.currency']()}</span>
						<select
							id="settings-collection-currency"
							class="select-bordered select"
							name="currency"
							value={data.collection.currency}
						>
							<option value="EUR">EUR</option><option value="USD">USD</option><option value="GBP"
								>GBP</option
							>
						</select>
					</label>
					<label class="form-control md:col-span-6" for="settings-collection-description">
						<span class="label-text mb-2 font-medium">{messages['ui.description']()}</span>
						<textarea
							id="settings-collection-description"
							class="textarea-bordered textarea min-h-24"
							name="description"
							maxlength="2000">{data.collection.description ?? ''}</textarea
						>
					</label>
					<div class="md:col-span-6 md:justify-self-end">
						<button class="btn btn-primary" type="submit">{messages['ui.save']()}</button>
					</div>
				</form>
			{:else}
				<dl class="grid gap-4 sm:grid-cols-2">
					<div>
						<dt class="text-xs text-base-content/50 uppercase">{messages['ui.name']()}</dt>
						<dd class="mt-1 font-medium">{data.collection.name}</dd>
					</div>
					<div>
						<dt class="text-xs text-base-content/50 uppercase">{messages['ui.currency']()}</dt>
						<dd class="mt-1 font-mono">{data.collection.currency}</dd>
					</div>
				</dl>
			{/if}
		</div>
	</section>

	<section aria-labelledby="calendar-association" class="card bg-base-100 card-border">
		<div class="card-body gap-4">
			<h2 id="calendar-association" class="card-title">{messages['screen.calendar_event']()}</h2>
			<p class="text-sm text-base-content/65">
				{messages['screen.you_can_link_this_collection_to_a_calendar_event_only_people_who_can']()}
			</p>
			{#if data.calendarEvent}
				<p class="font-medium">{messages['details.event_33']()} {data.calendarEvent.title}</p>
			{/if}
			{#if canManage && !data.collection.archivedAt}
				<form
					method="POST"
					action="?/setCalendarEvent"
					class="flex flex-col items-start gap-3 sm:flex-row sm:items-end"
				>
					<label class="form-control w-full sm:max-w-md" for="settings-calendar-event">
						<span class="mb-2 font-medium">{messages['details.linked_event']()}</span>
						<select id="settings-calendar-event" class="select w-full" name="calendar_event_id">
							<option value="__keep__">{messages['screen.keep_current_event']()}</option>
							<option value="">{messages['screen.no_event_remove_link']()}</option>
							{#each data.calendarEvents as event (event.id)}
								<option value={event.id}
									>{event.title} · {new Intl.DateTimeFormat(
										getLocale() === 'en' ? 'en-GB' : 'es-ES',
										{
											dateStyle: 'short',
											timeZone: event.timezone
										}
									).format(new Date(event.starts_at))}</option
								>
							{/each}
						</select>
					</label>
					<button type="submit" class="btn btn-primary"
						>{messages['details.save_event_link']()}</button
					>
				</form>
			{/if}
		</div>
	</section>

	<section aria-labelledby="participantes" class="card bg-base-100 card-border">
		<div class="card-body gap-5">
			<div class="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 id="participantes" class="card-title">{messages['ui.participants']()}</h2>
					<p class="mt-1 text-sm text-base-content/60">
						{messages['details.only_these_people_can_see_the_collection']()}
					</p>
				</div>
				<span class="badge badge-ghost">{visibleMembers.length}</span>
			</div>

			<div class="overflow-x-auto">
				<table class="table">
					<thead
						><tr
							><th>{messages['details.person']()}</th><th>{messages['details.status']()}</th><th
								>Rol</th
							><th><span class="sr-only">{messages['details.actions']()}</span></th></tr
						></thead
					>
					<tbody>
						{#each visibleMembers as member (member.userId)}
							<tr>
								<td>
									<div class="flex items-center gap-3">
										<div class="avatar avatar-placeholder">
											<div class="w-9 rounded-full bg-base-200 text-base-content">
												<span>{member.profile.displayName.slice(0, 1).toUpperCase()}</span>
											</div>
										</div>
										<div>
											<p class="font-medium">{member.profile.displayName}</p>
											{#if member.userId === data.currentUserId}<p
													class="text-xs text-base-content/50"
												>
													Tú
												</p>{/if}
										</div>
									</div>
								</td>
								<td
									><span
										class={`badge badge-sm ${member.status === 'active' ? 'badge-soft badge-success' : 'badge-soft badge-warning'}`}
										>{member.status === 'active' ? messages['feature.active']() : 'Invitado'}</span
									></td
								>
								<td>
									{#if isOwner && member.role !== 'owner' && member.status === 'active'}
										<form method="POST" action="?/changeRole" class="flex gap-2">
											<input type="hidden" name="collection_id" value={data.collection.id} />
											<input type="hidden" name="user_id" value={member.userId} />
											<select
												class="select-bordered select select-xs"
												name="role"
												value={member.role}
												aria-label={`Rol de ${member.profile.displayName}`}
											>
												<option value="manager">{messages['details.manager']()}</option><option
													value="contributor">{messages['details.contributor']()}</option
												><option value="viewer">{messages['details.view_only']()}</option>
											</select>
											<button class="btn btn-ghost btn-xs" type="submit"
												>{messages['details.change']()}</button
											>
										</form>
									{:else}<span class="text-sm">{roleLabel(member.role)}</span>{/if}
								</td>
								<td class="text-right">
									{#if canRevoke(member.role, member.userId)}
										<form method="POST" action="?/revokeMember">
											<input type="hidden" name="user_id" value={member.userId} />
											<button class="btn text-error btn-ghost btn-xs" type="submit"
												>{messages['details.revoke']()}</button
											>
										</form>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			{#if canManage && data.familyCandidates.length > 0}
				<form
					method="POST"
					action="?/inviteMember"
					class="grid gap-3 rounded-box bg-base-200 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
				>
					<input type="hidden" name="collection_id" value={data.collection.id} />
					<label class="form-control" for="invite-expense-member">
						<span class="label-text mb-2 font-medium">Miembro de la familia</span>
						<select
							id="invite-expense-member"
							class="select-bordered select bg-base-100"
							name="user_id"
							required
						>
							<option value="" disabled selected>Selecciona una persona</option>
							{#each data.familyCandidates as candidate (candidate.id)}<option value={candidate.id}
									>{candidate.displayName}</option
								>{/each}
						</select>
					</label>
					<label class="form-control" for="invite-expense-role">
						<span class="label-text mb-2 font-medium">Rol</span>
						<select id="invite-expense-role" class="select-bordered select bg-base-100" name="role">
							{#if isOwner}<option value="manager">{messages['details.manager']()}</option>{/if}
							<option value="contributor" selected>{messages['details.contributor']()}</option
							><option value="viewer">{messages['details.view_only']()}</option>
						</select>
					</label>
					<button class="btn btn-primary" type="submit">Invitar</button>
				</form>
			{/if}
		</div>
	</section>

	<section aria-labelledby="categorias" class="card bg-base-100 card-border">
		<div class="card-body gap-5">
			<div>
				<h2 id="categorias" class="card-title">Categorías</h2>
				<p class="mt-1 text-sm text-base-content/60">
					Las categorías domésticas iniciales se pueden ampliar o eliminar.
				</p>
			</div>
			<div class="flex flex-wrap gap-2">
				{#each data.categories as category (category.id)}
					<div class="join rounded-field border border-base-300">
						<span class="join-item inline-flex items-center gap-2 px-3 py-2 text-sm">
							<span class="size-2 rounded-full" style:background-color={category.color ?? '#64748B'}
							></span>{category.name}
						</span>
						{#if canManage}
							<form method="POST" action="?/deleteCategory" class="join-item">
								<input type="hidden" name="category_id" value={category.id} />
								<button
									class="btn rounded-none text-error btn-ghost btn-sm"
									type="submit"
									aria-label={`Eliminar ${category.name}`}>×</button
								>
							</form>
						{/if}
					</div>
				{/each}
			</div>
			{#if canManage}
				<form
					method="POST"
					action="?/createCategory"
					class="grid gap-3 rounded-box bg-base-200 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-end"
				>
					<label class="form-control" for="new-category-name"
						><span class="label-text mb-2 font-medium">Nueva categoría</span><input
							id="new-category-name"
							class="input-bordered input bg-base-100"
							name="name"
							maxlength="60"
							required
							placeholder="Mascotas"
						/></label
					>
					<label class="form-control" for="new-category-color"
						><span class="label-text mb-2 font-medium">Color</span><input
							id="new-category-color"
							class="input-bordered input h-12 w-24 bg-base-100 p-1"
							name="color"
							type="color"
							value="#2563EB"
						/></label
					>
					<button class="btn btn-primary" type="submit">{messages['ui.add']()}</button>
				</form>
			{/if}
		</div>
	</section>

	{#if isOwner && transferableMembers.length > 0}
		<section aria-labelledby="propiedad" class="card bg-base-100 card-border">
			<div class="card-body gap-4">
				<div>
					<h2 id="propiedad" class="card-title">Transferir propiedad</h2>
					<p class="mt-1 text-sm text-base-content/60">
						El nuevo propietario tendrá el control total y tú pasarás a ser gestor.
					</p>
				</div>
				<form method="POST" action="?/transferOwnership" class="flex flex-col gap-3 sm:flex-row">
					<select
						class="select-bordered select flex-1"
						name="user_id"
						aria-label="Nuevo propietario"
						required
					>
						<option value="" disabled selected>Selecciona un participante activo</option>
						{#each transferableMembers as member (member.userId)}<option value={member.userId}
								>{member.profile.displayName}</option
							>{/each}
					</select>
					<button class="btn btn-outline" type="submit">Transferir</button>
				</form>
			</div>
		</section>
	{/if}

	<section aria-labelledby="zona-riesgo" class="card border border-error/30 bg-error/5">
		<div class="card-body gap-4">
			<div>
				<h2 id="zona-riesgo" class="card-title text-error">Acciones sensibles</h2>
				<p class="mt-1 text-sm text-base-content/60">
					El historial se conserva al archivar o abandonar.
				</p>
			</div>
			<div class="flex flex-wrap gap-2">
				{#if canManage}
					{#if data.collection.archivedAt}
						<form method="POST" action="?/restoreCollection">
							<button class="btn btn-outline" type="submit">Reactivar colección</button>
						</form>
					{:else}
						<form method="POST" action="?/archiveCollection">
							<button class="btn btn-outline btn-error" type="submit">Archivar colección</button>
						</form>
					{/if}
				{/if}
				{#if !isOwner}
					<form method="POST" action="?/leaveCollection">
						<button class="btn btn-outline btn-error" type="submit">Abandonar colección</button>
					</form>
				{/if}
			</div>
		</div>
	</section>
</div>
