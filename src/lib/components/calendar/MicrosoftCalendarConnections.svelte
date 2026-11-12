<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { MicrosoftCalendarPanel } from '$lib/server/calendar/microsoft/service';
	import type { CalendarEventRecord } from '$lib/server/calendar/queries';

	let {
		panel,
		events,
		currentUserId
	}: { panel: MicrosoftCalendarPanel; events: CalendarEventRecord[]; currentUserId: string } =
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
	aria-labelledby="microsoft-calendar-heading"
	aria-busy={busy}
>
	<h2 id="microsoft-calendar-heading" class="text-lg font-semibold">Tu Outlook / Microsoft 365</h2>
	<p class="mt-1 text-sm text-base-content/65">
		La conexión es independiente de cómo inicias sesión en MyFamily. Los eventos importados son
		privados hasta que tú cambies su audiencia.
	</p>
	{#if operationError}<p role="alert" class="mt-3 text-sm text-error">{operationError}</p>{/if}
	{#if !panel.configured}
		<p role="status" class="mt-3 text-sm text-base-content/65">
			La conexión con Outlook / Microsoft 365 todavía no está configurada en este servidor.
		</p>
	{:else if !panel.connection}
		<form method="POST" action="?/connectMicrosoft" class="mt-3">
			<button type="submit" class="btn btn-outline btn-sm" disabled={busy}
				>Conectar Outlook / Microsoft 365</button
			>
		</form>
	{:else}
		{@const connection = panel.connection}
		{#if !connection.calendarId}
			<form
				method="POST"
				action="?/selectMicrosoftCalendar"
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
				Se sincroniza al abrir el calendario y cada dos minutos mientras esté visible. La primera
				sincronización abarca desde hace 30 días hasta los próximos 365 días. Las series de
				Microsoft se muestran como citas individuales, incluidas sus excepciones.
			</p>
			{#if connection.lastSyncedAt}<p class="mt-1 text-xs text-base-content/55">
					Última sincronización: <time datetime={connection.lastSyncedAt}
						>{new Date(connection.lastSyncedAt).toLocaleString('es-ES')}</time
					>
				</p>{/if}
			<form method="POST" action="?/syncMicrosoft" use:enhance={submit} class="mt-3">
				<input type="hidden" name="connection_id" value={connection.id} />
				<button type="submit" class="btn btn-outline btn-sm" disabled={busy}
					>{busy ? 'Procesando…' : 'Sincronizar ahora'}</button
				>
			</form>
			<details class="mt-4">
				<summary class="cursor-pointer text-sm font-medium"
					>Enviar un evento de MyFamily a Microsoft</summary
				>
				<p class="mt-2 text-sm text-base-content/65">
					Solo se enviará el evento propio que elijas, sin participantes ni avisos a invitados. Su
					copia en Microsoft será privada. Después, los cambios y borrados se sincronizan en ambos
					sentidos al pulsar Sincronizar ahora.
				</p>
				{#if exportableEvents.length}
					<form
						method="POST"
						action="?/exportMicrosoft"
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
							>Enviar a Microsoft</button
						>
					</form>
				{:else}<p class="mt-2 text-sm text-base-content/55">
						No hay eventos propios sin recurrencia pendientes de conectar en este periodo.
					</p>{/if}
			</details>
			{#each panel.conflicts as conflict (conflict.remoteEventId)}
				<form
					method="POST"
					action="?/resolveMicrosoftConflict"
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
							? 'Lo eliminaste en MyFamily y cambió en Microsoft. Puedes recuperar la copia o confirmar su eliminación en Microsoft.'
							: 'Las dos versiones cambiaron. Revisa el evento en Microsoft antes de elegir cuál conservar.'}
					</p>
					<div class="mt-2 flex flex-wrap gap-2">
						<button
							type="submit"
							name="choice"
							value="google"
							class="btn btn-outline btn-sm"
							disabled={busy}
							>{conflict.localDeleted ? 'Recuperar desde Microsoft' : 'Conservar Microsoft'}</button
						>
						<button
							type="submit"
							name="choice"
							value="local"
							class="btn btn-outline btn-sm"
							disabled={busy}
							>{conflict.localDeleted
								? 'Confirmar eliminación en Microsoft'
								: 'Conservar MyFamily'}</button
						>
					</div>
				</form>
			{/each}
		{/if}
		<details class="mt-4 text-sm">
			<summary class="cursor-pointer font-medium">Desconectar Outlook / Microsoft 365</summary>
			<p class="mt-2 text-base-content/65">
				Elimina la conexión y las copias importadas en MyFamily. Para revocar el consentimiento,
				retira el permiso de MyFamily en tu cuenta Microsoft. Conserva tus eventos originales de
				Microsoft y los eventos que creaste en MyFamily.
			</p>
			<form method="POST" action="?/disconnectMicrosoft" use:enhance={submit} class="mt-2">
				<input type="hidden" name="connection_id" value={connection.id} />
				<button type="submit" class="btn btn-outline btn-sm btn-error" disabled={busy}
					>Desconectar de MyFamily</button
				>
			</form>
		</details>
	{/if}
</section>
