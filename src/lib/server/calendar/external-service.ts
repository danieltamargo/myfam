import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json, Tables } from '$lib/types/database';
import { CalendarCommandError } from './commands';
import { decryptCalendarSecret, encryptCalendarSecret } from './google/crypto';
import { GoogleCalendarError, remoteGoogleEventId } from './google/provider';
import type { GoogleCalendarOption, GoogleEvent, GoogleEventInput } from './google/provider';
import type * as GoogleProvider from './google/provider';
import type * as GoogleConfig from './google/config';
import type { CalendarSyncBatch, CalendarSyncCursor, CalendarSyncLink } from './sync-types';

export interface CalendarSyncOutcome {
	status: 'synced' | 'recent' | 'busy';
	conflicts: number;
	changed: boolean;
}

interface CalendarAdapter {
	provider: 'google_calendar' | 'microsoft_calendar';
	label: string;
	context: 'google-calendar' | 'microsoft-calendar';
	config: typeof GoogleConfig.googleCalendarConfig;
	configured: typeof GoogleConfig.googleCalendarConfigured;
	serviceClient: typeof GoogleConfig.calendarServiceClient;
	request: typeof GoogleProvider.googleRequest;
	eventBody: typeof GoogleProvider.googleEventBody;
	eventUrl: typeof GoogleProvider.googleEventUrl;
	listEvents: typeof GoogleProvider.listGoogleEvents;
	listChanges: (
		token: string,
		calendarId: string,
		from: string,
		to: string,
		cursor: CalendarSyncCursor | null,
		links: CalendarSyncLink[]
	) => Promise<CalendarSyncBatch>;
	normalizeEvent: typeof GoogleProvider.normalizeGoogleEvent;
	refreshTokens: typeof GoogleProvider.refreshGoogleTokens;
	revokeToken?: typeof GoogleProvider.revokeGoogleToken;
	exportEvent?: (
		token: string,
		calendarId: string,
		connectionId: string,
		eventId: string,
		version: number,
		event: GoogleEventInput
	) => Promise<GoogleEvent>;
}
export function createCalendarService(adapter: CalendarAdapter) {
	const {
		config: googleCalendarConfig,
		configured: googleCalendarConfigured,
		serviceClient: calendarServiceClient,
		request: googleRequest,
		eventBody: googleEventBody,
		eventUrl: googleEventUrl,
		normalizeEvent: normalizeGoogleEvent,
		refreshTokens: refreshGoogleTokens,
		revokeToken: revokeGoogleToken
	} = adapter;
	type Client = SupabaseClient<Database>;
	type Connection = Tables<'external_connections'>;
	type Link = Tables<'calendar_external_event_links'>;
	type LocalEvent = Tables<'calendar_events'>;
	interface ConnectionMetadata {
		calendars: GoogleCalendarOption[];
		calendarId?: string;
		calendarLabel?: string;
		timezone?: string;
		lastSyncedAt?: string;
	}

	function metadata(connection: Pick<Connection, 'metadata'>): ConnectionMetadata {
		const value = connection.metadata;
		if (!value || typeof value !== 'object' || Array.isArray(value)) return { calendars: [] };
		const raw = value as Record<string, Json | undefined>;
		const calendars = Array.isArray(raw.calendars)
			? raw.calendars.flatMap((item) => {
					if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
					return typeof item.id === 'string' &&
						typeof item.label === 'string' &&
						typeof item.timezone === 'string'
						? [{ id: item.id, label: item.label, timezone: item.timezone }]
						: [];
				})
			: [];
		return {
			calendars,
			calendarId: typeof raw.calendarId === 'string' ? raw.calendarId : undefined,
			calendarLabel: typeof raw.calendarLabel === 'string' ? raw.calendarLabel : undefined,
			timezone: typeof raw.timezone === 'string' ? raw.timezone : undefined,
			lastSyncedAt: typeof raw.lastSyncedAt === 'string' ? raw.lastSyncedAt : undefined
		};
	}

	function recentlySynced(connection: Connection): boolean {
		const latest = Math.max(
			Date.parse(connection.sync_attempted_at ?? '') || 0,
			Date.parse(metadata(connection).lastSyncedAt ?? '') || 0
		);
		return latest > Date.now() - 60_000;
	}

	function syncCursor(connection: Connection): CalendarSyncCursor | null {
		const cursor = connection.sync_cursor;
		if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) return null;
		if (typeof cursor.from !== 'string' || typeof cursor.to !== 'string') return null;
		if (cursor.kind === 'google' && typeof cursor.token === 'string')
			return cursor as unknown as CalendarSyncCursor;
		if (cursor.kind === 'microsoft-delta' && typeof cursor.url === 'string')
			return cursor as unknown as CalendarSyncCursor;
		if (
			cursor.kind === 'microsoft-index' &&
			Array.isArray(cursor.ids) &&
			cursor.ids.every((id) => typeof id === 'string')
		)
			return cursor as unknown as CalendarSyncCursor;
		return null;
	}

	async function requireCalendarMembership(supabase: Client, familyId: string, userId: string) {
		const { data, error } = await supabase
			.from('family_members')
			.select('user_id')
			.eq('family_id', familyId)
			.eq('user_id', userId)
			.maybeSingle();
		if (error) throw new CalendarCommandError(500, 'No se pudo comprobar la familia.');
		if (!data) throw new CalendarCommandError(403, 'No tienes acceso a esta familia.');
	}

	async function loadGoogleCalendarPanel(supabase: Client, familyId: string, userId: string) {
		const { data, error } = await supabase
			.from('external_connections')
			.select('id, metadata')
			.eq('family_id', familyId)
			.eq('user_id', userId)
			.eq('provider', adapter.provider)
			.maybeSingle();
		if (error) throw new CalendarCommandError(500, 'No se pudo cargar la conexión de calendario.');
		const { data: links, error: linkError } = data
			? await supabase
					.from('calendar_external_event_links')
					.select('remote_event_id, local_event_id, direction, conflict')
					.eq('connection_id', data.id)
			: { data: [], error: null };
		if (linkError)
			throw new CalendarCommandError(500, 'No se pudo cargar el estado de sincronización.');
		const conflictedIds = (links ?? [])
			.filter((link) => link.conflict && link.local_event_id)
			.map((link) => link.local_event_id!);
		const conflictEvents = conflictedIds.length
			? await supabase
					.from('calendar_events')
					.select('id, title, version')
					.eq('family_id', familyId)
					.eq('created_by', userId)
					.in('id', conflictedIds)
			: { data: [], error: null };
		if (conflictEvents.error)
			throw new CalendarCommandError(500, 'No se pudieron cargar los conflictos.');
		return {
			configured: googleCalendarConfigured(),
			connection: data ? { id: data.id, ...metadata(data) } : null,
			links: links ?? [],
			conflicts: (links ?? []).flatMap((link) => {
				const event = conflictEvents.data?.find(
					(candidate) => candidate.id === link.local_event_id
				);
				return link.conflict && (event || !link.local_event_id)
					? [
							{
								remoteEventId: link.remote_event_id,
								eventId: event?.id ?? '',
								title: event?.title ?? 'Evento eliminado en MyFamily',
								version: event?.version ?? 0,
								localDeleted: !link.local_event_id
							}
						]
					: [];
			})
		};
	}

	function assertDatabase(error: { message: string } | null) {
		if (error) throw new CalendarCommandError(500, 'No se pudo guardar el estado del calendario.');
	}

	async function ownedConnection(
		service: Client,
		familyId: string,
		userId: string,
		connectionId: string
	): Promise<Connection> {
		const { data, error } = await service
			.from('external_connections')
			.select('*')
			.eq('id', connectionId)
			.eq('family_id', familyId)
			.eq('user_id', userId)
			.eq('provider', adapter.provider)
			.maybeSingle();
		assertDatabase(error);
		if (!data) throw new CalendarCommandError(404, 'La conexión ya no está disponible.');
		return data;
	}

	function calendarTokenContext(
		connection: Pick<Connection, 'id' | 'user_id' | 'family_id'>
	): string {
		return `${adapter.context}:${connection.user_id}:${connection.family_id}:${connection.id}`;
	}

	async function withConnection<T>(
		supabase: Client,
		familyId: string,
		userId: string,
		connectionId: string,
		operation: (
			service: Client,
			connection: Connection,
			lease: string,
			accessToken: string
		) => Promise<T>,
		refreshAccess = true,
		cooldown?: { recent: T; busy: T }
	): Promise<T> {
		await requireCalendarMembership(supabase, familyId, userId);
		const config = googleCalendarConfig();
		const service = calendarServiceClient(config);
		let connection = await ownedConnection(service, familyId, userId, connectionId);
		if (cooldown && recentlySynced(connection)) return cooldown.recent;
		const { data: lease, error } = await service.rpc('acquire_google_calendar_sync', {
			p_connection_id: connectionId,
			p_user_id: userId
		});
		if (cooldown && error && ['40001', 'PT409'].includes(error.code)) return cooldown.busy;
		if (error || !lease)
			throw new CalendarCommandError(
				409,
				'El calendario ya se está sincronizando. Inténtalo más tarde.'
			);
		try {
			connection = await ownedConnection(service, familyId, userId, connectionId);
			if (connection.sync_lease_id !== lease)
				throw new CalendarCommandError(409, 'La conexión cambió mientras se sincronizaba.');
			if (cooldown && recentlySynced(connection)) return cooldown.recent;
			if (cooldown) {
				const attempted = await service
					.from('external_connections')
					.update({ sync_attempted_at: new Date().toISOString() })
					.eq('id', connectionId)
					.eq('sync_lease_id', lease)
					.select('id')
					.maybeSingle();
				assertDatabase(attempted.error);
				if (!attempted.data)
					throw new CalendarCommandError(409, 'La conexión cambió mientras se sincronizaba.');
			}
			const context = calendarTokenContext(connection);
			if (!connection.access_token || !connection.refresh_token)
				throw new CalendarCommandError(401, `Vuelve a conectar ${adapter.label}.`);
			let access = decryptCalendarSecret(connection.access_token, `${context}:access`, config.keys);
			let refresh = decryptCalendarSecret(
				connection.refresh_token,
				`${context}:refresh`,
				config.keys
			);
			let expiresAt = connection.expires_at;
			const expiry = expiresAt
				? Date.parse(/([zZ]|[+-]\d{2}:\d{2})$/.test(expiresAt) ? expiresAt : `${expiresAt}Z`)
				: 0;
			if (refreshAccess && (!Number.isFinite(expiry) || expiry <= Date.now() + 60_000)) {
				const refreshed = await refreshGoogleTokens(config, refresh);
				access = refreshed.access_token;
				refresh = refreshed.refresh_token || refresh;
				expiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
			}
			const saved = await service
				.from('external_connections')
				.update({
					access_token: encryptCalendarSecret(access, `${context}:access`, config.keys),
					refresh_token: encryptCalendarSecret(refresh, `${context}:refresh`, config.keys),
					expires_at: expiresAt
				})
				.eq('id', connectionId)
				.eq('sync_lease_id', lease)
				.select('id')
				.maybeSingle();
			assertDatabase(saved.error);
			if (!saved.data)
				throw new CalendarCommandError(409, 'La conexión cambió mientras se sincronizaba.');
			return await operation(service, { ...connection, refresh_token: refresh }, lease, access);
		} catch (caught) {
			if (caught instanceof CalendarCommandError) throw caught;
			if (caught instanceof GoogleCalendarError && caught.reason === 'conflict')
				throw new CalendarCommandError(
					409,
					`${adapter.label} cambió el evento. Sincroniza de nuevo para revisar el conflicto.`
				);
			if (caught instanceof GoogleCalendarError && [400, 401, 403].includes(caught.status))
				throw new CalendarCommandError(
					401,
					`${adapter.label} no permite acceder al calendario. Desconecta y vuelve a autorizarlo.`
				);
			throw new CalendarCommandError(
				502,
				`No se pudo completar la operación con ${adapter.label}. Inténtalo de nuevo.`
			);
		} finally {
			const released = await service
				.from('external_connections')
				.update({ sync_lease_id: null, sync_lease_until: null })
				.eq('id', connectionId)
				.eq('sync_lease_id', lease);
			if (released.error) console.error('Calendar synchronization lease could not be released');
		}
	}

	async function selectGoogleCalendar(
		supabase: Client,
		familyId: string,
		userId: string,
		connectionId: string,
		calendarId: string
	) {
		return withConnection(
			supabase,
			familyId,
			userId,
			connectionId,
			async (service, connection, lease) => {
				const current = metadata(connection);
				const selected = current.calendars.find((calendar) => calendar.id === calendarId);
				if (!selected || current.calendarId)
					throw new CalendarCommandError(
						400,
						'Selecciona un calendario propio. Para cambiarlo, desconecta la conexión actual.'
					);
				const result = await service
					.from('external_connections')
					.update({
						metadata: {
							...current,
							calendarId,
							calendarLabel: selected.label,
							timezone: selected.timezone
						} as unknown as Json
					})
					.eq('id', connectionId)
					.eq('sync_lease_id', lease);
				assertDatabase(result.error);
			}
		);
	}

	async function loadLinks(service: Client, connectionId: string) {
		const links: Link[] = [];
		for (let offset = 0; ; offset += 500) {
			const result = await service
				.from('calendar_external_event_links')
				.select('*')
				.eq('connection_id', connectionId)
				.order('remote_event_id')
				.range(offset, offset + 499);
			assertDatabase(result.error);
			links.push(...(result.data ?? []));
			if ((result.data ?? []).length < 500) return links;
		}
	}

	async function renewSyncLease(service: Client, connectionId: string, lease: string) {
		const result = await service
			.from('external_connections')
			.update({ sync_lease_until: new Date(Date.now() + 600_000).toISOString() })
			.eq('id', connectionId)
			.eq('sync_lease_id', lease)
			.gt('sync_lease_until', new Date().toISOString())
			.select('id')
			.maybeSingle();
		assertDatabase(result.error);
		if (!result.data)
			throw new CalendarCommandError(409, 'La sincronización caducó. Vuelve a intentarlo.');
	}

	function localInput(event: LocalEvent): GoogleEventInput {
		return {
			title: event.title,
			description: event.description,
			startsAt: event.starts_at,
			endsAt: event.ends_at,
			timezone: event.timezone,
			allDay: event.all_day
		};
	}

	async function localEvent(service: Client, connection: Connection, eventId: string | null) {
		if (!eventId) return null;
		const result = await service
			.from('calendar_events')
			.select('*')
			.eq('id', eventId)
			.eq('created_by', connection.user_id!)
			.eq('family_id', connection.family_id!)
			.maybeSingle();
		assertDatabase(result.error);
		return result.data;
	}

	async function recordExport(
		service: Client,
		connection: Connection,
		lease: string,
		event: LocalEvent,
		remote: GoogleEvent,
		syncedVersion = event.version
	) {
		if (!remote.id || !remote.etag) throw new GoogleCalendarError(502);
		const result = await service.rpc('record_google_calendar_export', {
			p_connection_id: connection.id,
			p_lease_id: lease,
			p_remote_event_id: remote.id,
			p_etag: remote.etag,
			p_local_event_id: event.id,
			p_local_version: syncedVersion
		});
		assertDatabase(result.error);
	}

	async function pullEvent(
		service: Client,
		connection: Connection,
		lease: string,
		remote: GoogleEvent,
		timezone: string,
		force = false,
		expectedVersion?: number
	) {
		const event = normalizeGoogleEvent(remote, timezone);
		const result = await service.rpc('apply_google_calendar_event', {
			p_connection_id: connection.id,
			p_lease_id: lease,
			p_remote_event_id: remote.id,
			p_etag: remote.etag || 'deleted',
			p_event: event as unknown as Json,
			p_force: force,
			p_expected_version: expectedVersion
		});
		assertDatabase(result.error);
		return result.data;
	}

	function googleSyncDecision(
		localVersion: number,
		syncedVersion: number,
		remoteEtag: string,
		syncedEtag: string
	) {
		if (localVersion !== syncedVersion && remoteEtag !== syncedEtag) return 'conflict';
		if (localVersion !== syncedVersion) return 'push';
		if (remoteEtag !== syncedEtag) return 'pull';
		return 'unchanged';
	}

	async function runCalendarSync(
		supabase: Client,
		familyId: string,
		userId: string,
		connectionId: string,
		automatic = false
	): Promise<CalendarSyncOutcome> {
		return withConnection<CalendarSyncOutcome>(
			supabase,
			familyId,
			userId,
			connectionId,
			async (service, connection, lease, token) => {
				const selected = metadata(connection);
				if (!selected.calendarId)
					throw new CalendarCommandError(400, 'Selecciona primero un calendario propio.');
				const links = await loadLinks(service, connectionId);
				const today = new Date();
				today.setUTCHours(0, 0, 0, 0);
				const from = new Date(today.getTime() - 30 * 86400_000).toISOString();
				const to = new Date(today.getTime() + 366 * 86400_000).toISOString();
				const batch = await adapter.listChanges(
					token,
					selected.calendarId,
					from,
					to,
					syncCursor(connection),
					links
				);
				const remotes = batch.events;
				const byRemoteId = new Map(remotes.map((event) => [event.id, event]));
				const linkedIds = new Set(links.map((link) => link.remote_event_id));
				let conflicts = 0;
				let changed = false;
				for (const link of links) {
					try {
						if (link.remote_deleted) continue;
						const local = await localEvent(service, connection, link.local_event_id);
						let remote = byRemoteId.get(link.remote_event_id);
						if ((!batch.full || adapter.provider === 'microsoft_calendar') && !remote) {
							if (link.conflict) {
								conflicts++;
								continue;
							}
							if (local && local.version === link.local_version) continue;
						}
						await renewSyncLease(service, connectionId, lease);
						if (!remote) {
							try {
								remote = await googleRequest<GoogleEvent>(
									googleEventUrl(selected.calendarId, link.remote_event_id),
									{ headers: { Authorization: `Bearer ${token}` } }
								);
							} catch (caught) {
								if (caught instanceof GoogleCalendarError && [404, 410].includes(caught.status))
									remote = { id: link.remote_event_id, etag: 'deleted', status: 'cancelled' };
								else throw caught;
							}
						}
						if (remote.status === 'cancelled') remote = { ...remote, etag: 'deleted' };
						if (!local) {
							if (
								remote.status !== 'cancelled' &&
								(remote.etag !== link.remote_etag || link.conflict)
							) {
								const result = await service
									.from('calendar_external_event_links')
									.update({ conflict: 'local_deleted_remote_changed' })
									.eq('connection_id', connectionId)
									.eq('remote_event_id', link.remote_event_id);
								assertDatabase(result.error);
								changed = true;
								conflicts++;
								continue;
							}
							if (remote.status !== 'cancelled')
								await googleRequest<void>(
									googleEventUrl(selected.calendarId, link.remote_event_id),
									{
										method: 'DELETE',
										headers: { Authorization: `Bearer ${token}`, 'If-Match': link.remote_etag }
									}
								);
							const result = await service
								.from('calendar_external_event_links')
								.update({ remote_deleted: true, conflict: null })
								.eq('connection_id', connectionId)
								.eq('remote_event_id', link.remote_event_id);
							assertDatabase(result.error);
							changed = true;
							continue;
						}
						const decision = googleSyncDecision(
							local.version,
							link.local_version,
							remote.etag,
							link.remote_etag
						);
						if (decision === 'conflict' || link.conflict) {
							const result = await service
								.from('calendar_external_event_links')
								.update({ conflict: 'both_changed' })
								.eq('connection_id', connectionId)
								.eq('remote_event_id', remote.id);
							assertDatabase(result.error);
							changed = true;
							conflicts++;
							continue;
						}
						if (decision === 'push') {
							const updated = await googleRequest<GoogleEvent>(
								googleEventUrl(selected.calendarId, remote.id),
								{
									method: 'PATCH',
									headers: {
										Authorization: `Bearer ${token}`,
										'If-Match': link.remote_etag,
										'Content-Type': 'application/json'
									},
									body: JSON.stringify(googleEventBody(localInput(local)))
								}
							);
							await recordExport(service, connection, lease, local, updated);
							changed = true;
						} else if (decision === 'pull') {
							changed = true;
							if (
								(await pullEvent(
									service,
									connection,
									lease,
									remote,
									selected.timezone || 'UTC'
								)) === 'conflict'
							)
								conflicts++;
						}
					} catch (caught) {
						if (!(caught instanceof GoogleCalendarError) || caught.reason !== 'conflict')
							throw caught;
						const saved = await service
							.from('calendar_external_event_links')
							.update({ conflict: 'both_changed' })
							.eq('connection_id', connectionId)
							.eq('remote_event_id', link.remote_event_id);
						assertDatabase(saved.error);
						changed = true;
						conflicts++;
					}
				}
				for (const remote of remotes)
					if (!linkedIds.has(remote.id) && remote.status !== 'cancelled') {
						const eventWindow = normalizeGoogleEvent(remote, selected.timezone || 'UTC');
						if (!eventWindow || eventWindow.endsAt <= from || eventWindow.startsAt >= to) continue;
						await renewSyncLease(service, connectionId, lease);
						const originalId = remote.extendedProperties?.private?.myfamilyEventId;
						const original =
							remote.extendedProperties?.private?.myfamilyConnectionId === connection.id &&
							originalId
								? await localEvent(service, connection, originalId)
								: null;
						if (original) {
							const exportedVersion = Number(remote.extendedProperties?.private?.myfamilyVersion);
							if (
								!Number.isSafeInteger(exportedVersion) ||
								exportedVersion < 1 ||
								exportedVersion > original.version
							)
								throw new CalendarCommandError(
									409,
									'Un evento exportado necesita revisión. Vuelve a enviarlo desde MyFamily.'
								);
							await recordExport(service, connection, lease, original, remote, exportedVersion);
						} else await pullEvent(service, connection, lease, remote, selected.timezone || 'UTC');
						changed = true;
					}
				const result = await service
					.from('external_connections')
					.update({
						metadata: { ...selected, lastSyncedAt: new Date().toISOString() } as unknown as Json,
						sync_cursor: batch.cursor as unknown as Json
					})
					.eq('id', connectionId)
					.eq('sync_lease_id', lease)
					.gt('sync_lease_until', new Date().toISOString())
					.select('id')
					.maybeSingle();
				assertDatabase(result.error);
				if (!result.data)
					throw new CalendarCommandError(409, 'La sincronización caducó. Vuelve a intentarlo.');
				return { status: 'synced', conflicts, changed };
			},
			true,
			automatic
				? {
						recent: { status: 'recent', conflicts: 0, changed: false },
						busy: { status: 'busy', conflicts: 0, changed: false }
					}
				: undefined
		);
	}

	async function syncGoogleCalendar(
		supabase: Client,
		familyId: string,
		userId: string,
		connectionId: string
	) {
		return (await runCalendarSync(supabase, familyId, userId, connectionId)).conflicts;
	}

	async function exportGoogleCalendarEvent(
		supabase: Client,
		familyId: string,
		userId: string,
		connectionId: string,
		eventId: string,
		version: number
	) {
		return withConnection(
			supabase,
			familyId,
			userId,
			connectionId,
			async (service, connection, lease, token) => {
				const selected = metadata(connection);
				const event = await localEvent(service, connection, eventId);
				if (
					!selected.calendarId ||
					!event ||
					event.recurrence_frequency !== 'none' ||
					event.version !== version
				)
					throw new CalendarCommandError(
						409,
						'Selecciona un evento interno propio sin recurrencia y actualizado.'
					);
				const imported = await service
					.from('calendar_external_event_links')
					.select('connection_id')
					.eq('local_event_id', eventId)
					.eq('direction', 'imported')
					.limit(1);
				assertDatabase(imported.error);
				if (imported.data?.length)
					throw new CalendarCommandError(409, 'Solo puedes exportar eventos creados en MyFamily.');
				const links = await loadLinks(service, connectionId);
				if (links.some((link) => link.local_event_id === eventId))
					throw new CalendarCommandError(
						409,
						'Este evento ya está conectado. Usa Sincronizar ahora.'
					);
				if (adapter.exportEvent) {
					await renewSyncLease(service, connectionId, lease);
					const remote = await adapter.exportEvent(
						token,
						selected.calendarId,
						connectionId,
						eventId,
						event.version,
						localInput(event)
					);
					const exportedVersion = Number(remote.extendedProperties?.private?.myfamilyVersion);
					if (
						!Number.isSafeInteger(exportedVersion) ||
						exportedVersion < 1 ||
						exportedVersion > event.version
					)
						throw new CalendarCommandError(409, 'El evento exportado necesita revisión.');
					await recordExport(service, connection, lease, event, remote, exportedVersion);
					return;
				}
				const remoteId = remoteGoogleEventId(connectionId, eventId);
				let remote: GoogleEvent;
				try {
					await renewSyncLease(service, connectionId, lease);
					remote = await googleRequest<GoogleEvent>(googleEventUrl(selected.calendarId), {
						method: 'POST',
						headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
						body: JSON.stringify({
							...googleEventBody(localInput(event)),
							id: remoteId,
							extendedProperties: {
								private: {
									myfamilyEventId: event.id,
									myfamilyConnectionId: connection.id,
									myfamilyVersion: String(event.version)
								}
							}
						})
					});
				} catch (caught) {
					if (!(caught instanceof GoogleCalendarError) || caught.status !== 409) throw caught;
					remote = await googleRequest<GoogleEvent>(googleEventUrl(selected.calendarId, remoteId), {
						headers: { Authorization: `Bearer ${token}` }
					});
					if (
						remote.extendedProperties?.private?.myfamilyEventId !== eventId ||
						remote.extendedProperties.private.myfamilyConnectionId !== connectionId
					)
						throw new GoogleCalendarError(409, 'conflict');
					if (remote.extendedProperties.private.myfamilyVersion !== String(event.version)) {
						await renewSyncLease(service, connectionId, lease);
						remote = await googleRequest<GoogleEvent>(
							googleEventUrl(selected.calendarId, remoteId),
							{
								method: 'PATCH',
								headers: {
									Authorization: `Bearer ${token}`,
									'If-Match': remote.etag,
									'Content-Type': 'application/json'
								},
								body: JSON.stringify({
									...googleEventBody(localInput(event)),
									extendedProperties: {
										private: {
											myfamilyEventId: event.id,
											myfamilyConnectionId: connection.id,
											myfamilyVersion: String(event.version)
										}
									}
								})
							}
						);
					}
				}
				await recordExport(service, connection, lease, event, remote);
			}
		);
	}

	async function resolveGoogleCalendarConflict(
		supabase: Client,
		familyId: string,
		userId: string,
		connectionId: string,
		remoteId: string,
		version: number,
		choice: 'google' | 'local'
	) {
		return withConnection(
			supabase,
			familyId,
			userId,
			connectionId,
			async (service, connection, lease, token) => {
				const selected = metadata(connection);
				const link = (await loadLinks(service, connectionId)).find(
					(candidate) => candidate.remote_event_id === remoteId
				);
				const local = link ? await localEvent(service, connection, link.local_event_id) : null;
				if (!selected.calendarId || !link?.conflict || (local && local.version !== version))
					throw new CalendarCommandError(409, 'El conflicto cambió. Recarga el calendario.');
				let remote: GoogleEvent;
				try {
					remote = await googleRequest<GoogleEvent>(googleEventUrl(selected.calendarId, remoteId), {
						headers: { Authorization: `Bearer ${token}` }
					});
				} catch (caught) {
					if (caught instanceof GoogleCalendarError && [404, 410].includes(caught.status))
						remote = { id: remoteId, etag: 'deleted', status: 'cancelled' };
					else throw caught;
				}
				if (!local) {
					await renewSyncLease(service, connectionId, lease);
					if (choice === 'google' && remote.status !== 'cancelled') {
						const removed = await service
							.from('calendar_external_event_links')
							.delete()
							.eq('connection_id', connectionId)
							.eq('remote_event_id', remoteId)
							.is('local_event_id', null);
						assertDatabase(removed.error);
						await pullEvent(service, connection, lease, remote, selected.timezone || 'UTC');
					} else {
						if (remote.status !== 'cancelled')
							await googleRequest<void>(googleEventUrl(selected.calendarId, remoteId), {
								method: 'DELETE',
								headers: { Authorization: `Bearer ${token}`, 'If-Match': remote.etag }
							});
						const saved = await service
							.from('calendar_external_event_links')
							.update({ remote_deleted: true, conflict: null })
							.eq('connection_id', connectionId)
							.eq('remote_event_id', remoteId);
						assertDatabase(saved.error);
					}
					return;
				}
				if (choice === 'google') {
					if (
						(await pullEvent(
							service,
							connection,
							lease,
							remote,
							selected.timezone || 'UTC',
							true,
							version
						)) === 'conflict'
					)
						throw new CalendarCommandError(409, 'El evento local cambió. Recarga el calendario.');
				} else {
					if (remote.status === 'cancelled')
						throw new CalendarCommandError(
							409,
							`${adapter.label} eliminó el evento. Conserva la eliminación y exporta una copia nueva si la necesitas.`
						);
					await renewSyncLease(service, connectionId, lease);
					const updated = await googleRequest<GoogleEvent>(
						googleEventUrl(selected.calendarId, remoteId),
						{
							method: 'PATCH',
							headers: {
								Authorization: `Bearer ${token}`,
								'If-Match': remote.etag,
								'Content-Type': 'application/json'
							},
							body: JSON.stringify(googleEventBody(localInput(local)))
						}
					);
					await recordExport(service, connection, lease, local, updated);
				}
			}
		);
	}

	async function disconnectGoogleCalendar(
		supabase: Client,
		familyId: string,
		userId: string,
		connectionId: string
	) {
		return withConnection(
			supabase,
			familyId,
			userId,
			connectionId,
			async (service, connection, lease) => {
				await renewSyncLease(service, connectionId, lease);
				if (revokeGoogleToken) await revokeGoogleToken(connection.refresh_token!);
				const result = await service
					.from('external_connections')
					.delete()
					.eq('id', connectionId)
					.eq('user_id', userId)
					.eq('sync_lease_id', lease);
				assertDatabase(result.error);
			},
			false
		);
	}

	return {
		requireCalendarMembership,
		loadPanel: loadGoogleCalendarPanel,
		tokenContext: calendarTokenContext,
		selectCalendar: selectGoogleCalendar,
		syncCalendar: syncGoogleCalendar,
		autoSyncCalendar: (supabase: Client, familyId: string, userId: string, connectionId: string) =>
			runCalendarSync(supabase, familyId, userId, connectionId, true),
		exportEvent: exportGoogleCalendarEvent,
		resolveConflict: resolveGoogleCalendarConflict,
		disconnect: disconnectGoogleCalendar,
		syncDecision: googleSyncDecision
	};
}
