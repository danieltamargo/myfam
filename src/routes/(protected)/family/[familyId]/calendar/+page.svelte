<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { SvelteDate, SvelteURLSearchParams } from 'svelte/reactivity';
	import type { ActionData, PageData } from './$types';
	import type { CalendarEventRecord, CalendarOccurrence } from '$lib/server/calendar/queries';
	import GoogleCalendarConnections from '$lib/components/calendar/GoogleCalendarConnections.svelte';
	import MicrosoftCalendarConnections from '$lib/components/calendar/MicrosoftCalendarConnections.svelte';
	import CalendarAutoSync from '$lib/components/calendar/CalendarAutoSync.svelte';
	import MemberRadioFilter from '$lib/components/ui/MemberRadioFilter.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let allDay = $state(false);
	let recurrence = $state('none');
	let visibility = $state('family');
	let editSnapshot = $state.raw<CalendarEventRecord | null>(null);
	let editOccurrenceSnapshot = $state.raw<CalendarOccurrence | null>(null);

	const selectedEventId = $derived(page.url.searchParams.get('event'));
	const liveSelectedEvent = $derived(
		data.events.find((event) => event.id === selectedEventId) ?? null
	);
	const selectedEvent = $derived(
		liveSelectedEvent ?? (editSnapshot?.id === selectedEventId ? editSnapshot : null)
	);
	const editEvent = $derived(editSnapshot?.id === selectedEventId ? editSnapshot : selectedEvent);
	$effect(() => {
		if (editSnapshot && editSnapshot.id !== selectedEventId) {
			editSnapshot = null;
			editOccurrenceSnapshot = null;
		}
	});
	const selectedOccurrence = $derived(
		data.occurrences.find((occurrence) => occurrence.eventId === selectedEventId) ??
			(editSnapshot?.id === selectedEventId ? editOccurrenceSnapshot : null)
	);
	function originLabel(eventId: string): string {
		const origin = data.events.find((event) => event.id === eventId)?.origin;
		return origin === 'google' ? 'Google Calendar' : origin === 'outlook' ? 'Outlook' : 'MyFamily';
	}

	const gridDays = $derived(
		Array.from({ length: 42 }, (_, index) => {
			const date = new SvelteDate(data.query.from);
			date.setUTCDate(date.getUTCDate() + index);
			return date.toISOString().slice(0, 10);
		})
	);

	function dateKey(value: string, timezone: string): string {
		const parts = new Intl.DateTimeFormat('en-CA', {
			timeZone: timezone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		}).formatToParts(new Date(value));
		const part = (type: 'year' | 'month' | 'day') =>
			parts.find((candidate) => candidate.type === type)?.value ?? '';
		return `${part('year')}-${part('month')}-${part('day')}`;
	}

	function eventsForDay(day: string): CalendarOccurrence[] {
		return data.occurrences.filter(
			(occurrence) => dateKey(occurrence.start, occurrence.timezone) === day
		);
	}

	function formatDay(day: string, options: Intl.DateTimeFormatOptions): string {
		const [year, month, date] = day.split('-').map(Number);
		return new Intl.DateTimeFormat('es-ES', options).format(
			new Date(Date.UTC(year, month - 1, date))
		);
	}

	function formatEventTime(occurrence: CalendarOccurrence): string {
		if (occurrence.allDay) return 'Todo el día';
		const formatter = new Intl.DateTimeFormat('es-ES', {
			timeZone: occurrence.timezone,
			hour: '2-digit',
			minute: '2-digit'
		});
		return `${formatter.format(new Date(occurrence.start))}–${formatter.format(new Date(occurrence.end))}`;
	}

	function localInputValue(iso: string, timezone: string): string {
		const parts = new Intl.DateTimeFormat('en-CA', {
			timeZone: timezone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23'
		}).formatToParts(new Date(iso));
		const part = (type: 'year' | 'month' | 'day' | 'hour' | 'minute') =>
			parts.find((candidate) => candidate.type === type)?.value ?? '';
		return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
	}

	function localDateValue(iso: string, timezone: string): string {
		return localInputValue(iso, timezone).slice(0, 10);
	}

	function shiftAnchor(amount: number): string {
		const [year, month, day] = data.query.anchor.split('-').map(Number);
		const date = new SvelteDate(Date.UTC(year, month - 1, day));
		if (data.query.view === 'month') date.setUTCMonth(date.getUTCMonth() + amount, 1);
		else date.setUTCDate(date.getUTCDate() + amount * 30);
		return date.toISOString().slice(0, 10);
	}

	function calendarHref(overrides: Record<string, string | null>): string {
		const params = new SvelteURLSearchParams();
		params.set('view', data.query.view);
		params.set('date', data.query.anchor);
		if (data.query.participantId) params.set('participant', data.query.participantId);
		for (const [key, value] of Object.entries(overrides)) {
			if (value) params.set(key, value);
			else params.delete(key);
		}
		return `/family/${encodeURIComponent(data.family.id)}/calendar?${params.toString()}`;
	}

	function nextDate(day: string): string {
		const date = new SvelteDate(`${day}T00:00:00Z`);
		date.setUTCDate(date.getUTCDate() + 1);
		return date.toISOString().slice(0, 10);
	}

	function categoryName(categoryId: string | null): string | null {
		if (!categoryId) return null;
		const category = data.categories.find((candidate) => candidate.id === categoryId);
		return category ? `${category.icon ?? '🎁'} ${category.name}` : null;
	}

	function memberName(memberId: string): string {
		return data.members.find((member) => member.id === memberId)?.displayName ?? 'Miembro';
	}

	function eventDaySpan(occurrence: CalendarOccurrence): string {
		const start = dateKey(occurrence.start, occurrence.timezone);
		const end = dateKey(occurrence.end, occurrence.timezone);
		if (start === end) return formatDay(start, { weekday: 'long', day: 'numeric', month: 'long' });
		return `${formatDay(start, { day: 'numeric', month: 'short' })} → ${formatDay(end, { day: 'numeric', month: 'short' })}`;
	}

	function recurrenceLabel(event: CalendarEventRecord): string {
		if (event.recurrence_frequency === 'none') return 'No se repite';
		const labels = { daily: 'diaria', weekly: 'semanal', monthly: 'mensual' };
		return `Repetición ${labels[event.recurrence_frequency as keyof typeof labels] ?? event.recurrence_frequency}`;
	}
</script>

<svelte:head>
	<title>Calendario · MyFamily</title>
	<meta name="description" content="Calendario compartido, privado y recurrente para tu familia." />
</svelte:head>

<div class="mx-auto max-w-7xl space-y-6 pb-16">
	<header
		class="flex flex-col gap-5 border-b border-base-200 pb-6 lg:flex-row lg:items-end lg:justify-between"
	>
		<div>
			<p class="mb-2 text-sm font-semibold tracking-wide text-primary uppercase">
				Tiempo compartido
			</p>
			<h1 class="text-3xl font-bold tracking-tight sm:text-4xl">Calendario familiar</h1>
			<p class="mt-2 max-w-2xl text-base-content/65">
				Organiza eventos, decide quién puede verlos y mantén cada cita en su zona horaria.
			</p>
		</div>
		<a class="btn btn-primary" href="#nuevo-evento">Nuevo evento</a>
	</header>

	{#if form?.error}
		<div class="alert alert-error" role="alert"><span>{form.error}</span></div>
	{:else if form?.message}
		<div class="alert alert-success" role="status"><span>{form.message}</span></div>
	{/if}

	<GoogleCalendarConnections
		panel={data.googleCalendar}
		events={data.events}
		currentUserId={data.currentUserId}
	/>
	<MicrosoftCalendarConnections
		panel={data.microsoftCalendar}
		events={data.events}
		currentUserId={data.currentUserId}
	/>
	<CalendarAutoSync
		familyId={data.family.id}
		enabled={Boolean(
			(data.googleCalendar.configured && data.googleCalendar.connection?.calendarId) ||
			(data.microsoftCalendar.configured && data.microsoftCalendar.connection?.calendarId)
		)}
		connectionKey={JSON.stringify([
			data.googleCalendar.connection?.id,
			data.googleCalendar.connection?.calendarId,
			data.microsoftCalendar.connection?.id,
			data.microsoftCalendar.connection?.calendarId
		])}
	/>

	<section
		class="rounded-box border border-base-300 bg-base-100 p-3 sm:p-4"
		aria-label="Controles del calendario"
	>
		<div class="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
			<div class="flex flex-wrap items-center gap-2">
				<a
					class="btn btn-square btn-ghost btn-sm"
					href={resolve(calendarHref({ date: shiftAnchor(-1), event: null }) as '/')}
					aria-label="Periodo anterior">←</a
				>
				<a
					class="btn btn-ghost btn-sm"
					href={resolve(
						calendarHref({ date: new Date().toISOString().slice(0, 10), event: null }) as '/'
					)}>Hoy</a
				>
				<a
					class="btn btn-square btn-ghost btn-sm"
					href={resolve(calendarHref({ date: shiftAnchor(1), event: null }) as '/')}
					aria-label="Periodo siguiente">→</a
				>
				<h2 class="ml-1 text-lg font-semibold capitalize">
					{formatDay(data.query.anchor, { month: 'long', year: 'numeric' })}
				</h2>
			</div>

			<form method="GET" class="flex flex-col gap-2 sm:flex-row sm:items-center">
				<input type="hidden" name="date" value={data.query.anchor} />
				<input type="hidden" name="view" value={data.query.view} />
				<div class="join" aria-label="Vista del calendario">
					<a
						class="btn join-item btn-sm {data.query.view === 'month' ? 'btn-active' : ''}"
						href={resolve(calendarHref({ view: 'month' }) as '/')}>Mes</a
					>
					<a
						class="btn join-item btn-sm {data.query.view === 'agenda' ? 'btn-active' : ''}"
						href={resolve(calendarHref({ view: 'agenda' }) as '/')}>Agenda</a
					>
				</div>
				<MemberRadioFilter
					name="participant"
					label="Filtrar por participante"
					members={data.members}
					value={data.query.participantId ?? ''}
					autoSubmit
				/>
			</form>
		</div>
	</section>

	{#if data.query.view === 'month'}
		<section
			aria-label="Vista mensual"
			class="overflow-hidden rounded-box border border-base-300 bg-base-100"
		>
			<div
				class="grid grid-cols-7 border-b border-base-300 bg-base-200/60 text-center text-xs font-semibold text-base-content/55 uppercase"
			>
				{#each ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as weekday (weekday)}
					<div class="px-1 py-3">{weekday}</div>
				{/each}
			</div>
			<div class="grid grid-cols-7">
				{#each gridDays as day (day)}
					{@const dayEvents = eventsForDay(day)}
					{@const inMonth = day.slice(0, 7) === data.query.anchor.slice(0, 7)}
					<div
						class="min-h-24 border-r border-b border-base-200 p-1 sm:min-h-32 sm:p-2 {inMonth
							? ''
							: 'bg-base-200/35 text-base-content/40'}"
					>
						<div class="mb-1 flex items-center justify-between">
							<span
								class="grid size-7 place-items-center rounded-full text-xs {day ===
								new Date().toISOString().slice(0, 10)
									? 'bg-primary font-bold text-primary-content'
									: 'font-semibold'}"
							>
								{Number(day.slice(-2))}
							</span>
						</div>
						<div class="space-y-1">
							{#each dayEvents.slice(0, 3) as occurrence (`${occurrence.eventId}-${occurrence.start}`)}
								<a
									href={resolve(calendarHref({ event: occurrence.eventId }) as '/')}
									class="block truncate rounded-md border-l-2 border-primary bg-primary/10 px-1.5 py-1 text-[11px] font-medium hover:bg-primary/20 focus-visible:outline-2 focus-visible:outline-primary sm:text-xs"
									title={`${occurrence.title} · ${formatEventTime(occurrence)} · ${originLabel(occurrence.eventId)}`}
								>
									<span class="hidden sm:inline"
										>{occurrence.allDay
											? ''
											: `${formatEventTime(occurrence).split('–')[0]} `}</span
									>{occurrence.title}
								</a>
							{/each}
							{#if dayEvents.length > 3}<span class="block px-1 text-[10px] text-base-content/50"
									>+{dayEvents.length - 3} más</span
								>{/if}
						</div>
					</div>
				{/each}
			</div>
		</section>
	{:else}
		<section aria-labelledby="agenda-heading" class="space-y-4">
			<div class="flex items-end justify-between gap-3">
				<div>
					<p class="text-xs font-semibold tracking-widest text-base-content/45 uppercase">
						Próximos 90 días
					</p>
					<h2 id="agenda-heading" class="mt-1 text-xl font-semibold">Agenda</h2>
				</div>
				<span class="badge badge-ghost">{data.occurrences.length}</span>
			</div>
			{#if data.occurrences.length === 0}
				<div class="rounded-box border border-dashed border-base-300 bg-base-100 p-10 text-center">
					<div class="text-4xl" aria-hidden="true">📭</div>
					<h3 class="mt-3 text-lg font-semibold">No hay eventos en este periodo</h3>
					<p class="mt-1 text-sm text-base-content/60">
						Prueba otro participante o añade la próxima cita familiar.
					</p>
				</div>
			{:else}
				<div class="space-y-2">
					{#each data.occurrences as occurrence (`${occurrence.eventId}-${occurrence.start}`)}
						<a
							href={resolve(calendarHref({ event: occurrence.eventId }) as '/')}
							class="flex gap-4 rounded-box border border-base-300 bg-base-100 p-4 transition hover:border-primary/40 hover:bg-base-200/40 focus-visible:outline-2 focus-visible:outline-primary"
						>
							<div class="w-14 shrink-0 text-center">
								<p class="text-xs font-semibold text-primary uppercase">
									{formatDay(dateKey(occurrence.start, occurrence.timezone), { month: 'short' })}
								</p>
								<p class="text-2xl font-bold">
									{Number(dateKey(occurrence.start, occurrence.timezone).slice(-2))}
								</p>
							</div>
							<div class="min-w-0 flex-1 border-l border-base-200 pl-4">
								<div class="flex flex-wrap items-center gap-2">
									<h3 class="truncate font-semibold">{occurrence.title}</h3>
									<span class="badge badge-ghost badge-sm">{originLabel(occurrence.eventId)}</span>
									{#if occurrence.visibility === 'selected_members'}<span
											class="badge badge-soft badge-sm">Privado</span
										>{/if}
								</div>
								<p class="mt-1 text-sm text-base-content/60">
									{formatEventTime(occurrence)} · {occurrence.timezone}
								</p>
							</div>
						</a>
					{/each}
				</div>
			{/if}
		</section>
	{/if}

	{#if selectedEvent && selectedOccurrence}
		<section
			id="detalle-evento"
			class="card bg-base-100 card-border"
			aria-labelledby="event-detail-title"
		>
			<div class="card-body gap-5">
				<div class="flex items-start justify-between gap-4">
					<div>
						<div class="mb-2 flex flex-wrap gap-2">
							<span class="badge badge-ghost">Origen: {originLabel(selectedEvent.id)}</span>
							<span class="badge badge-soft badge-primary"
								>{selectedOccurrence.allDay
									? 'Todo el día'
									: formatEventTime(selectedOccurrence)}</span
							>
							{#if selectedEvent.visibility === 'selected_members'}<span class="badge badge-soft"
									>Solo participantes</span
								>{/if}
						</div>
						<h2 id="event-detail-title" class="text-2xl font-bold">{selectedEvent.title}</h2>
						<p class="mt-1 text-base-content/60 capitalize">
							{eventDaySpan(selectedOccurrence)} · {selectedEvent.timezone}
						</p>
					</div>
					<a
						class="btn btn-circle btn-ghost btn-sm"
						href={resolve(calendarHref({ event: null }) as '/')}
						aria-label="Cerrar detalle">✕</a
					>
				</div>
				{#if selectedEvent.description}<p
						class="max-w-3xl text-sm leading-6 whitespace-pre-wrap text-base-content/75"
					>
						{selectedEvent.description}
					</p>{/if}
				<div class="flex flex-wrap gap-2 text-sm">
					<span class="badge badge-ghost">{recurrenceLabel(selectedEvent)}</span>
					{#if selectedEvent.reminderMinutes !== null}<span class="badge badge-ghost"
							>🔔 {selectedEvent.reminderMinutes} min antes</span
						>{/if}
					{#if categoryName(selectedEvent.wishlist_category_id)}<span class="badge badge-ghost"
							>{categoryName(selectedEvent.wishlist_category_id)}</span
						>{/if}
				</div>
				<div>
					<p class="mb-2 text-xs font-semibold tracking-wide text-base-content/45 uppercase">
						Participantes
					</p>
					<div class="flex flex-wrap gap-2">
						{#each selectedEvent.participantIds as participantId (participantId)}
							<span class="badge badge-outline">{memberName(participantId)}</span>
						{/each}
					</div>
				</div>

				{#if data.moduleAccess.some((access) => access.moduleId === 'expenses' && access.enabled)}
					<a
						class="btn btn-outline btn-sm"
						href={resolve(`/family/${data.family.id}/expenses?event=${selectedEvent.id}` as '/')}
						>Añadir gasto de este evento</a
					>
				{/if}
				{#if editSnapshot && !liveSelectedEvent}
					<p class="alert alert-warning" role="status">
						El evento ya no aparece en esta vista. Tu borrador se conserva; al guardar se comprobará
						si el evento sigue disponible y su versión.
					</p>
				{/if}
				{#if selectedEvent.canManage && editEvent}
					<details class="collapse-arrow collapse border border-base-300">
						<summary class="collapse-title font-semibold">Editar evento</summary>
						<div class="collapse-content">
							<form
								method="POST"
								action="?/updateEvent"
								class="grid gap-4 pt-2 md:grid-cols-6"
								oninput={() => {
									editSnapshot ??= selectedEvent;
									editOccurrenceSnapshot ??= selectedOccurrence;
								}}
							>
								<input type="hidden" name="event_id" value={editEvent.id} />
								<input type="hidden" name="version" value={editEvent.version} />
								<label class="form-control md:col-span-4"
									><span class="label-text mb-2 font-medium">Título</span><input
										class="input-bordered input"
										name="title"
										maxlength="160"
										required
										value={editEvent.title}
									/></label
								>
								<label class="form-control md:col-span-2"
									><span class="label-text mb-2 font-medium">Zona horaria</span><input
										class="input-bordered input"
										name="timezone"
										required
										value={editEvent.timezone}
									/></label
								>
								<label class="form-control md:col-span-3"
									><span class="label-text mb-2 font-medium">Inicio</span><input
										class="input-bordered input"
										name="start_local"
										type={editEvent.all_day ? 'date' : 'datetime-local'}
										required
										value={editEvent.all_day
											? localDateValue(editEvent.starts_at, editEvent.timezone)
											: localInputValue(editEvent.starts_at, editEvent.timezone)}
									/></label
								>
								<label class="form-control md:col-span-3"
									><span class="label-text mb-2 font-medium">Final</span><input
										class="input-bordered input"
										name="end_local"
										type={editEvent.all_day ? 'date' : 'datetime-local'}
										required
										value={editEvent.all_day
											? localDateValue(editEvent.ends_at, editEvent.timezone)
											: localInputValue(editEvent.ends_at, editEvent.timezone)}
									/></label
								>
								<label class="label cursor-pointer justify-start gap-3 md:col-span-2"
									><input
										class="checkbox checkbox-primary"
										type="checkbox"
										name="all_day"
										value="true"
										checked={editEvent.all_day}
									/><span class="label-text">Día completo</span></label
								>
								<label class="form-control md:col-span-2"
									><span class="label-text mb-2 font-medium">Visibilidad</span><select
										class="select-bordered select"
										name="visibility"
										><option value="family" selected={editEvent.visibility === 'family'}
											>Toda la familia</option
										><option
											value="selected_members"
											selected={editEvent.visibility === 'selected_members'}
											>Solo participantes</option
										></select
									></label
								>
								<label class="form-control md:col-span-2"
									><span class="label-text mb-2 font-medium">Recordatorio</span><select
										class="select-bordered select"
										name="reminder_minutes"
										><option value="">Sin recordatorio</option
										>{#each [0, 15, 30, 60, 1440, 10080] as minutes (minutes)}<option
												value={minutes}
												selected={editEvent.reminderMinutes === minutes}
												>{minutes === 0
													? 'Al empezar'
													: minutes < 60
														? `${minutes} minutos antes`
														: minutes === 60
															? '1 hora antes'
															: minutes === 1440
																? '1 día antes'
																: '1 semana antes'}</option
											>{/each}</select
									></label
								>
								<input
									type="hidden"
									name="recurrence_frequency"
									value={editEvent.recurrence_frequency}
								/>
								<input
									type="hidden"
									name="recurrence_interval"
									value={editEvent.recurrence_interval}
								/>
								{#if editEvent.recurrence_until}<input
										type="hidden"
										name="recurrence_until_local"
										value={localInputValue(editEvent.recurrence_until, editEvent.timezone)}
									/>{/if}
								{#if editEvent.recurrence_count}<input
										type="hidden"
										name="recurrence_count"
										value={editEvent.recurrence_count}
									/>{/if}
								<label class="form-control md:col-span-3"
									><span class="label-text mb-2 font-medium">Categoría Wishlist</span><select
										class="select-bordered select"
										name="wishlist_category_id"
										><option value="">Sin vínculo</option
										>{#each data.categories as category (category.id)}<option
												value={category.id}
												selected={editEvent.wishlist_category_id === category.id}
												>{category.icon ?? '🎁'} {category.name}</option
											>{/each}</select
									></label
								>
								<fieldset class="min-w-0 md:col-span-6">
									<legend class="mb-2 font-medium">Participantes</legend>
									<div class="flex flex-wrap gap-2">
										{#each data.members as member (member.id)}<label
												class="label max-w-full cursor-pointer gap-2 rounded-field border border-base-300 px-3 py-2 whitespace-normal"
												><input
													class="checkbox checkbox-sm"
													type="checkbox"
													name="participant_ids"
													value={member.id}
													checked={editEvent.participantIds.includes(member.id)}
												/><span class="label-text">{member.displayName}</span></label
											>{/each}
									</div>
								</fieldset>
								<label class="form-control md:col-span-6"
									><span class="label-text mb-2 font-medium">Descripción</span><textarea
										class="textarea-bordered textarea min-h-24"
										name="description"
										maxlength="4000">{editEvent.description ?? ''}</textarea
									></label
								>
								<div class="flex flex-wrap justify-between gap-3 md:col-span-6">
									<button class="btn btn-primary" type="submit">Guardar cambios</button>
								</div>
							</form>
							<form
								method="POST"
								action="?/deleteEvent"
								class="mt-3"
								onsubmit={(event) => {
									if (!confirm('¿Eliminar este evento y todas sus repeticiones?'))
										event.preventDefault();
								}}
							>
								<input type="hidden" name="event_id" value={selectedEvent.id} />
								<input type="hidden" name="version" value={selectedEvent.version} />
								<button class="btn btn-outline btn-sm btn-error" type="submit"
									>Eliminar evento</button
								>
							</form>
						</div>
					</details>
				{/if}
			</div>
		</section>
	{/if}

	<section id="nuevo-evento" class="card bg-base-100 card-border" aria-labelledby="new-event-title">
		<div class="card-body gap-6">
			<div>
				<p class="text-xs font-semibold tracking-widest text-primary uppercase">Nueva cita</p>
				<h2 id="new-event-title" class="mt-1 text-xl font-semibold">Añadir evento</h2>
				<p class="mt-1 text-sm text-base-content/60">
					La zona horaria conserva la hora local incluso al cambiar al horario de verano.
				</p>
			</div>
			<form
				method="POST"
				action="?/createEvent"
				class="grid grid-cols-1 gap-4 md:grid-cols-6 [&_.form-control]:min-w-0 [&_.input]:w-full [&_.select]:w-full"
			>
				<label class="form-control md:col-span-4" for="calendar-title"
					><span class="label-text mb-2 font-medium">Título</span><input
						id="calendar-title"
						class="input-bordered input"
						name="title"
						maxlength="160"
						required
						placeholder="Comida familiar"
					/></label
				>
				<label class="form-control md:col-span-2" for="calendar-timezone"
					><span class="label-text mb-2 font-medium">Zona horaria</span><input
						id="calendar-timezone"
						class="input-bordered input"
						name="timezone"
						required
						value="Europe/Madrid"
						autocomplete="off"
					/></label
				>
				<label class="label cursor-pointer justify-start gap-3 md:col-span-6"
					><input
						class="toggle toggle-primary"
						type="checkbox"
						name="all_day"
						value="true"
						bind:checked={allDay}
					/><span class="label-text font-medium">Evento de día completo</span></label
				>
				<label class="form-control md:col-span-3" for="calendar-start"
					><span class="label-text mb-2 font-medium">Inicio</span><input
						id="calendar-start"
						class="input-bordered input"
						name="start_local"
						type={allDay ? 'date' : 'datetime-local'}
						required
						value={allDay ? data.query.anchor : `${data.query.anchor}T09:00`}
					/></label
				>
				<label class="form-control md:col-span-3" for="calendar-end"
					><span class="label-text mb-2 font-medium">Final</span><input
						id="calendar-end"
						class="input-bordered input"
						name="end_local"
						type={allDay ? 'date' : 'datetime-local'}
						required
						value={allDay ? nextDate(data.query.anchor) : `${data.query.anchor}T10:00`}
					/></label
				>
				<label class="form-control md:col-span-2" for="calendar-visibility"
					><span class="label-text mb-2 font-medium">Visibilidad</span><select
						id="calendar-visibility"
						class="select-bordered select"
						name="visibility"
						bind:value={visibility}
						><option value="family">Toda la familia</option><option value="selected_members"
							>Solo participantes</option
						></select
					></label
				>
				<label class="form-control md:col-span-2" for="calendar-recurrence"
					><span class="label-text mb-2 font-medium">Repetición</span><select
						id="calendar-recurrence"
						class="select-bordered select"
						name="recurrence_frequency"
						bind:value={recurrence}
						><option value="none">No se repite</option><option value="daily">Diaria</option><option
							value="weekly">Semanal</option
						><option value="monthly">Mensual</option></select
					></label
				>
				<label class="form-control md:col-span-2" for="calendar-reminder"
					><span class="label-text mb-2 font-medium">Recordatorio</span><select
						id="calendar-reminder"
						class="select-bordered select"
						name="reminder_minutes"
						><option value="">Sin recordatorio</option><option value="0">Al empezar</option><option
							value="15">15 minutos antes</option
						><option value="30">30 minutos antes</option><option value="60">1 hora antes</option
						><option value="1440">1 día antes</option><option value="10080">1 semana antes</option
						></select
					></label
				>
				{#if recurrence !== 'none'}
					<label class="form-control md:col-span-2" for="calendar-interval"
						><span class="label-text mb-2 font-medium">Cada</span><input
							id="calendar-interval"
							class="input-bordered input"
							name="recurrence_interval"
							type="number"
							min="1"
							max="30"
							value="1"
							required
						/></label
					>
					<label class="form-control md:col-span-2" for="calendar-until"
						><span class="label-text mb-2 font-medium">Repetir hasta</span><input
							id="calendar-until"
							class="input-bordered input"
							name="recurrence_until_local"
							type="datetime-local"
							required
							value={`${data.query.anchor}T09:00`}
						/></label
					>
					<label class="form-control md:col-span-2" for="calendar-count"
						><span class="label-text mb-2 font-medium">Máximo de veces</span><input
							id="calendar-count"
							class="input-bordered input"
							name="recurrence_count"
							type="number"
							min="1"
							max="366"
							placeholder="Hasta 366"
						/></label
					>
				{:else}<input type="hidden" name="recurrence_interval" value="1" />{/if}
				<label class="form-control md:col-span-3" for="calendar-wishlist"
					><span class="label-text mb-2 font-medium"
						>Categoría Wishlist <span class="font-normal opacity-50">(opcional)</span></span
					><select id="calendar-wishlist" class="select-bordered select" name="wishlist_category_id"
						><option value="">Sin vínculo</option
						>{#each data.categories as category (category.id)}<option value={category.id}
								>{category.icon ?? '🎁'} {category.name}</option
							>{/each}</select
					></label
				>
				<fieldset class="min-w-0 md:col-span-6">
					<legend class="mb-2 font-medium">Participantes</legend>
					<div class="flex flex-wrap gap-2">
						{#each data.members as member (member.id)}<label
								class="label max-w-full cursor-pointer gap-2 rounded-field border border-base-300 px-3 py-2 whitespace-normal"
								><input
									class="checkbox checkbox-sm checkbox-primary"
									type="checkbox"
									name="participant_ids"
									value={member.id}
								/><span class="label-text">{member.displayName}</span></label
							>{/each}
					</div>
					{#if visibility === 'selected_members'}<p class="mt-2 text-xs text-base-content/55">
							Solo tú y las personas seleccionadas podréis ver el evento.
						</p>{/if}
				</fieldset>
				<label class="form-control md:col-span-6" for="calendar-description"
					><span class="label-text mb-2 font-medium"
						>Descripción <span class="font-normal opacity-50">(opcional)</span></span
					><textarea
						id="calendar-description"
						class="textarea-bordered textarea min-h-24"
						name="description"
						maxlength="4000"
						placeholder="Lugar, notas o información útil"
					></textarea></label
				>
				<div class="md:col-span-6 md:justify-self-end">
					<button class="btn btn-primary" type="submit">Crear evento</button>
				</div>
			</form>
		</div>
	</section>
</div>
