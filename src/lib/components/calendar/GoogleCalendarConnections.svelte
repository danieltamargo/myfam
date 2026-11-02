<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { GoogleCalendarPanel } from '$lib/server/calendar/google/service';
	import type { CalendarEventRecord } from '$lib/server/calendar/queries';

	let {
		panel,
		events,
		currentUserId
	}: { panel: GoogleCalendarPanel; events: CalendarEventRecord[]; currentUserId: string } =
		$props();
	let busy = $state(false);
	let operationError = $state('');
	let selectedEventId = $state('');
	const exportableEvents = $derived(
		events.filter(
			(event) =>
				event.created_by === currentUserId &&
				event.origin === 'internal' &&
				event.recurrence_frequency === 'none' &&
				!panel.links.some((link) => link.local_event_id === event.id)
		)
	);
	const selectedEvent = $derived(exportableEvents.find((event) => event.id === selectedEventId));
	const submit: SubmitFunction = ({ cancel }) => {
		if (busy) {
			cancel();
			return;
		}
		busy = true;
		operationError = '';
		return async ({ update }) => {
			try {
				await update();
			} catch {
				operationError =
					'No se pudo confirmar la operación. Recarga el calendario antes de continuar.';
			} finally {
				busy = false;
			}
		};
	};
</script>

<section
	class="rounded-box border border-base-300 bg-base-100 p-4 sm:p-5"
	aria-labelledby="google-calendar-heading"
	aria-busy={busy}
>
	<h2 id="google-calendar-heading" class="text-lg font-semibold">Tu Google Calendar</h2>
	<p class="mt-1 text-sm text-base-content/65">
		La conexión es independiente de cómo inicias sesión en MyFamily. Los eventos importados son
		privados hasta que tú cambies su audiencia.
	</p>
	{#if operationError}<p role="alert" class="mt-3 text-sm text-error">{operationError}</p>{/if}
	{#if !panel.configured}
		<p role="status" class="mt-3 text-sm text-base-content/65">
			La conexión con Google Calendar todavía no está configurada en este servidor.
		</p>
	{:else if !panel.connection}
		<form method="POST" action="?/connectGoogle" class="mt-3">
			<button type="submit" class="btn btn-outline btn-sm" disabled={busy}
				>Conectar Google Calendar</button
			>
		</form>
	{:else}
		{@const connection = panel.connection}
		{#if !connection.calendarId}
			<form
				method="POST"
				action="?/selectGoogleCalendar"
				use:enhance={submit}
				class="mt-3 flex flex-wrap items-end gap-2"
			>
				<input type="hidden" name="connection_id" value={connection.id} />
				<label class="form-control"
					><span class="mb-1 text-sm font-medium">Calendario propio</span>
					<select class="select" name="calendar_id" required disabled={busy}>
						{#each connection.calendars as calendar (calendar.id)}<option value={calendar.id}
								>{calendar.label}</option
							>{/each}
					</select>
				</label>
				<button type="submit" class="btn btn-sm btn-primary" disabled={busy}
					>Usar este calendario</button
				>
			</form>
		{:else}
			<p class="mt-3 font-medium">{connection.calendarLabel}</p>
			<p class="mt-1 text-sm text-base-content/65">
				Sincronización manual: desde hace 30 días hasta los próximos 365 días. Las series de Google
				se muestran como citas individuales, incluidas sus excepciones.
			</p>
			{#if connection.lastSyncedAt}<p class="mt-1 text-xs text-base-content/55">
					Última sincronización: <time datetime={connection.lastSyncedAt}
						>{new Date(connection.lastSyncedAt).toLocaleString('es-ES')}</time
					>
				</p>{/if}
			<form method="POST" action="?/syncGoogle" use:enhance={submit} class="mt-3">
				<input type="hidden" name="connection_id" value={connection.id} />
				<button type="submit" class="btn btn-outline btn-sm" disabled={busy}
					>{busy ? 'Procesando…' : 'Sincronizar ahora'}</button
				>
			</form>
			<details class="mt-4">
				<summary class="cursor-pointer text-sm font-medium"
					>Enviar un evento de MyFamily a Google</summary
				>
				<p class="mt-2 text-sm text-base-content/65">
					Solo se enviará el evento propio que elijas, sin participantes ni avisos a invitados. Su
					copia en Google será privada. Después, los cambios y borrados se sincronizan en ambos
					sentidos al pulsar Sincronizar ahora.
				</p>
				{#if exportableEvents.length}
					<form
						method="POST"
						action="?/exportGoogle"
						use:enhance={submit}
						class="mt-3 flex flex-wrap items-end gap-2"
					>
						<input type="hidden" name="connection_id" value={connection.id} />
						<input type="hidden" name="version" value={selectedEvent?.version ?? ''} />
						<label class="form-control"
							><span class="mb-1 text-sm font-medium">Evento de este periodo</span>
							<select
								name="event_id"
								class="select"
								bind:value={selectedEventId}
								disabled={busy}
								required
							>
								<option value="">Selecciona un evento</option>
								{#each exportableEvents as event (event.id)}<option value={event.id}
										>{event.title}</option
									>{/each}
							</select>
						</label>
						<button type="submit" class="btn btn-outline btn-sm" disabled={busy || !selectedEvent}
							>Enviar a Google</button
						>
					</form>
				{:else}<p class="mt-2 text-sm text-base-content/55">
						No hay eventos propios sin recurrencia pendientes de conectar en este periodo.
					</p>{/if}
			</details>
			{#each panel.conflicts as conflict (conflict.remoteEventId)}
				<form
					method="POST"
					action="?/resolveGoogleConflict"
					use:enhance={submit}
					class="mt-4 rounded-box border border-warning p-3"
				>
					<input type="hidden" name="connection_id" value={connection.id} />
					<input type="hidden" name="remote_event_id" value={conflict.remoteEventId} />
					<input type="hidden" name="event_id" value={conflict.eventId} />
					<input type="hidden" name="version" value={conflict.version} />
					<input type="hidden" name="local_deleted" value={String(conflict.localDeleted)} />
					<p class="font-medium">Conflicto: {conflict.title}</p>
					<p class="mt-1 text-sm text-base-content/65">
						{conflict.localDeleted
							? 'Lo eliminaste en MyFamily y cambió en Google. Puedes recuperar la copia o confirmar su eliminación en Google.'
							: 'Las dos versiones cambiaron. Revisa el evento en Google antes de elegir cuál conservar.'}
					</p>
					<div class="mt-2 flex flex-wrap gap-2">
						<button
							type="submit"
							name="choice"
							value="google"
							class="btn btn-outline btn-sm"
							disabled={busy}
							>{conflict.localDeleted ? 'Recuperar desde Google' : 'Conservar Google'}</button
						>
						<button
							type="submit"
							name="choice"
							value="local"
							class="btn btn-outline btn-sm"
							disabled={busy}
							>{conflict.localDeleted
								? 'Confirmar eliminación en Google'
								: 'Conservar MyFamily'}</button
						>
					</div>
				</form>
			{/each}
		{/if}
		<details class="mt-4 text-sm">
			<summary class="cursor-pointer font-medium">Desconectar Google Calendar</summary>
			<p class="mt-2 text-base-content/65">
				Revoca el acceso y elimina las copias importadas en MyFamily. Conserva tus eventos
				originales de Google y los eventos que creaste en MyFamily.
			</p>
			<form method="POST" action="?/disconnectGoogle" use:enhance={submit} class="mt-2">
				<input type="hidden" name="connection_id" value={connection.id} />
				<button type="submit" class="btn btn-outline btn-sm btn-error" disabled={busy}
					>Desconectar y revocar acceso</button
				>
			</form>
		</details>
	{/if}
</section>
