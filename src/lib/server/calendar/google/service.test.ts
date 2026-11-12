import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';
import type { GoogleCalendarConfig } from './config';
import type { GoogleEvent } from './provider';
import { encryptCalendarSecret } from './crypto';
import { GoogleCalendarError, remoteGoogleEventId } from './provider';
import {
	calendarTokenContext,
	autoSyncGoogleCalendar,
	exportGoogleCalendarEvent,
	googleSyncDecision,
	resolveGoogleCalendarConflict,
	syncGoogleCalendar
} from './service';

const mocked = vi.hoisted(() => ({
	client: null as unknown as SupabaseClient<Database>,
	config: {} as GoogleCalendarConfig,
	events: [] as GoogleEvent[],
	request: vi.fn(),
	changes: vi.fn()
}));
vi.mock('./config', () => ({
	googleCalendarConfig: () => mocked.config,
	calendarServiceClient: () => mocked.client,
	googleCalendarConfigured: () => true
}));
vi.mock('./provider', async (original) => ({
	...(await original<typeof import('./provider')>()),
	listGoogleEvents: () => Promise.resolve(mocked.events),
	listGoogleEventChanges: mocked.changes,
	googleRequest: mocked.request
}));

const userId = '31000000-0000-4000-8000-000000000003';
const familyId = '31000000-1000-4000-8000-000000000001';
const connectionId = '31000000-2000-4000-8000-000000000001';
const eventId = '31000000-4000-4000-8000-000000000001';
const local = {
	id: eventId,
	family_id: familyId,
	created_by: userId,
	title: 'My appointment',
	description: null,
	starts_at: '2026-11-01T10:00:00Z',
	ends_at: '2026-11-01T11:00:00Z',
	timezone: 'UTC',
	all_day: false,
	recurrence_frequency: 'none',
	version: 1
};

function fakeDatabase(links: object[] = [], overrides: Record<string, unknown> = {}) {
	const writes: unknown[] = [];
	const context = calendarTokenContext({ id: connectionId, user_id: userId, family_id: familyId });
	const connection = {
		id: connectionId,
		user_id: userId,
		family_id: familyId,
		provider: 'google_calendar',
		sync_lease_id: 'lease',
		access_token: encryptCalendarSecret(
			'synthetic-access',
			`${context}:access`,
			mocked.config.keys
		),
		refresh_token: encryptCalendarSecret(
			'synthetic-refresh',
			`${context}:refresh`,
			mocked.config.keys
		),
		expires_at: new Date(Date.now() + 3600_000).toISOString(),
		metadata: { calendars: [], calendarId: 'owned', calendarLabel: 'Personal', timezone: 'UTC' },
		...overrides
	};
	function query(data: unknown) {
		const result = { data, error: null };
		const builder = {
			select: vi.fn(() => builder),
			limit: vi.fn(async () => ({ data: [], error: null })),
			eq: vi.fn(() => builder),
			gt: vi.fn(() => builder),
			order: vi.fn(() => builder),
			delete: vi.fn(() => builder),
			is: vi.fn(() => builder),
			update: vi.fn((value: unknown) => {
				writes.push(value);
				return builder;
			}),
			maybeSingle: vi.fn(async () => result),
			range: vi.fn(async () => result),
			then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve)
		};
		return builder;
	}
	const rpc = vi.fn(async (name: string) => ({
		data:
			name === 'acquire_google_calendar_sync'
				? 'lease'
				: name === 'apply_google_calendar_event'
					? 'applied'
					: undefined,
		error: null
	}));
	const client = {
		from: vi.fn((table: string) =>
			query(
				table === 'external_connections'
					? connection
					: table === 'calendar_external_event_links'
						? links
						: table === 'calendar_events'
							? local
							: { user_id: userId }
			)
		),
		rpc
	} as unknown as SupabaseClient<Database>;
	mocked.client = client;
	return { client, rpc, writes, connection };
}

beforeEach(() => {
	mocked.config = {
		clientId: 'client',
		clientSecret: 'synthetic-client-secret',
		redirectUri: 'https://example.test/calendar/google/callback',
		keys: { activeId: 'test', keys: { test: Buffer.alloc(32, 1).toString('base64') } },
		databaseUrl: 'https://database.example.test',
		databaseSecret: 'synthetic-database-secret'
	};
	mocked.events = [];
	mocked.request.mockReset();
	mocked.changes.mockReset().mockImplementation(async () => ({
		events: mocked.events,
		cursor: {
			kind: 'google',
			token: 'next-cursor',
			from: '2026-10-01T00:00:00Z',
			to: '2027-11-01T00:00:00Z'
		},
		full: true
	}));
});

describe('Google Calendar synchronization orchestration', () => {
	it('skips recent automatic syncs before acquiring a lease or calling Google', async () => {
		const { client, rpc } = fakeDatabase([], { sync_attempted_at: new Date().toISOString() });
		expect(await autoSyncGoogleCalendar(client, familyId, userId, connectionId)).toMatchObject({
			status: 'recent'
		});
		expect(rpc).not.toHaveBeenCalled();
		expect(mocked.changes).not.toHaveBeenCalled();
	});
	it('treats the project lease conflict as busy instead of a provider failure', async () => {
		const { client, rpc } = fakeDatabase();
		rpc.mockResolvedValueOnce({ data: null, error: { code: 'PT409' } } as never);
		expect(await autoSyncGoogleCalendar(client, familyId, userId, connectionId)).toMatchObject({
			status: 'busy',
			changed: false
		});
		expect(mocked.changes).not.toHaveBeenCalled();
	});
	it('applies a remote tombstone even if the provider repeats the previous etag', async () => {
		const { client, rpc } = fakeDatabase([
			{
				remote_event_id: 'deleted',
				local_event_id: eventId,
				local_version: 1,
				remote_etag: 'same',
				remote_deleted: false,
				conflict: null
			}
		]);
		mocked.changes.mockResolvedValueOnce({
			events: [{ id: 'deleted', etag: 'same', status: 'cancelled' }],
			cursor: { kind: 'google', token: 'next', from: '', to: '' },
			full: false
		});
		expect(await autoSyncGoogleCalendar(client, familyId, userId, connectionId)).toMatchObject({
			status: 'synced',
			changed: true
		});
		expect(rpc).toHaveBeenCalledWith(
			'apply_google_calendar_event',
			expect.objectContaining({ p_event: null, p_etag: 'deleted' })
		);
	});
	it('rechecks the cooldown under the lease to prevent races between tabs', async () => {
		const { client, rpc, connection } = fakeDatabase([], { sync_attempted_at: null });
		rpc.mockImplementationOnce(async () => {
			Object.assign(connection, { sync_attempted_at: new Date().toISOString() });
			return { data: 'lease', error: null };
		});
		expect(await autoSyncGoogleCalendar(client, familyId, userId, connectionId)).toMatchObject({
			status: 'recent'
		});
		expect(mocked.changes).not.toHaveBeenCalled();
	});
	it('does not fetch or rewrite unchanged linked events for an empty incremental batch', async () => {
		const { client, rpc } = fakeDatabase([
			{
				remote_event_id: 'unchanged',
				local_event_id: eventId,
				local_version: 1,
				remote_etag: 'same',
				remote_deleted: false,
				conflict: null
			}
		]);
		mocked.changes.mockResolvedValueOnce({
			events: [],
			cursor: { kind: 'google', token: 'next', from: '', to: '' },
			full: false
		});
		expect(await autoSyncGoogleCalendar(client, familyId, userId, connectionId)).toMatchObject({
			changed: false
		});
		expect(mocked.request).not.toHaveBeenCalled();
		expect(rpc).not.toHaveBeenCalledWith('apply_google_calendar_event', expect.anything());
	});
	it('saves the cursor only after the complete sync and never after a provider failure', async () => {
		const { client, writes } = fakeDatabase();
		mocked.changes.mockRejectedValueOnce(new GoogleCalendarError(503));
		await expect(
			autoSyncGoogleCalendar(client, familyId, userId, connectionId)
		).rejects.toMatchObject({ status: 502 });
		expect(
			writes.some((write) => write && typeof write === 'object' && 'sync_attempted_at' in write)
		).toBe(true);
		expect(
			writes.some((write) => write && typeof write === 'object' && 'sync_cursor' in write)
		).toBe(false);
	});
	it('imports through the service RPC and never returns tokens or provider attendee data', async () => {
		const { client, rpc, writes } = fakeDatabase();
		mocked.events = [
			{
				id: 'external-instance',
				etag: 'etag-1',
				summary: 'Private appointment',
				start: { dateTime: local.starts_at },
				end: { dateTime: local.ends_at }
			}
		];
		expect(await syncGoogleCalendar(client, familyId, userId, connectionId)).toBe(0);
		expect(rpc).toHaveBeenCalledWith(
			'apply_google_calendar_event',
			expect.objectContaining({
				p_connection_id: connectionId,
				p_remote_event_id: 'external-instance',
				p_event: expect.objectContaining({ title: 'Private appointment', allDay: false })
			})
		);
		expect(JSON.stringify(writes)).not.toContain('synthetic-access');
		expect(JSON.stringify(writes)).not.toContain('synthetic-refresh');
	});
	it('recovers a retried export after Google already created the deterministic id', async () => {
		const { client, rpc } = fakeDatabase();
		const remoteId = remoteGoogleEventId(connectionId, eventId);
		mocked.request.mockRejectedValueOnce(new GoogleCalendarError(409)).mockResolvedValueOnce({
			id: remoteId,
			etag: 'etag-existing',
			extendedProperties: {
				private: {
					myfamilyEventId: eventId,
					myfamilyConnectionId: connectionId,
					myfamilyVersion: '1'
				}
			}
		});
		await exportGoogleCalendarEvent(client, familyId, userId, connectionId, eventId, 1);
		expect(mocked.request).toHaveBeenCalledTimes(2);
		expect(mocked.request.mock.calls[0][1].method).toBe('POST');
		expect(mocked.request.mock.calls[1][0]).toContain(remoteId);
		expect(rpc).toHaveBeenCalledWith(
			'record_google_calendar_export',
			expect.objectContaining({
				p_remote_event_id: remoteId,
				p_local_event_id: eventId,
				p_local_version: 1
			})
		);
	});
	it('stops before any local overwrite when both sides changed', () => {
		expect(googleSyncDecision(2, 1, 'remote-new', 'remote-old')).toBe('conflict');
		expect(googleSyncDecision(2, 1, 'same', 'same')).toBe('push');
		expect(googleSyncDecision(1, 1, 'remote-new', 'remote-old')).toBe('pull');
		expect(googleSyncDecision(1, 1, 'same', 'same')).toBe('unchanged');
	});
	it('persists a resolvable conflict instead of deleting a remotely changed event after local deletion', async () => {
		const { client, writes } = fakeDatabase([
			{
				connection_id: connectionId,
				remote_event_id: 'remote-deleted-locally',
				local_event_id: null,
				direction: 'imported',
				remote_etag: 'old-etag',
				local_version: 1,
				remote_deleted: false,
				conflict: null
			}
		]);
		mocked.events = [
			{
				id: 'remote-deleted-locally',
				etag: 'new-etag',
				summary: 'Remote changed',
				start: { dateTime: local.starts_at },
				end: { dateTime: local.ends_at }
			}
		];
		expect(await syncGoogleCalendar(client, familyId, userId, connectionId)).toBe(1);
		expect(writes).toContainEqual({ conflict: 'local_deleted_remote_changed' });
		expect(mocked.request).not.toHaveBeenCalled();
	});

	it('restores a locally deleted event only after an explicit Google choice', async () => {
		const { client, rpc } = fakeDatabase([
			{
				connection_id: connectionId,
				remote_event_id: 'conflict-event',
				local_event_id: null,
				direction: 'imported',
				remote_etag: 'old',
				local_version: 1,
				remote_deleted: false,
				conflict: 'local_deleted_remote_changed'
			}
		]);
		mocked.request.mockResolvedValue({
			id: 'conflict-event',
			etag: 'new',
			start: { dateTime: local.starts_at },
			end: { dateTime: local.ends_at }
		});
		await resolveGoogleCalendarConflict(
			client,
			familyId,
			userId,
			connectionId,
			'conflict-event',
			0,
			'google'
		);
		expect(rpc).toHaveBeenCalledWith(
			'apply_google_calendar_event',
			expect.objectContaining({
				p_remote_event_id: 'conflict-event',
				p_event: expect.objectContaining({ allDay: false })
			})
		);
	});

	it('uses the freshly read Google etag when explicitly confirming a local deletion', async () => {
		const { client, writes } = fakeDatabase([
			{
				connection_id: connectionId,
				remote_event_id: 'conflict-event',
				local_event_id: null,
				direction: 'imported',
				remote_etag: 'old',
				local_version: 1,
				remote_deleted: false,
				conflict: 'local_deleted_remote_changed'
			}
		]);
		mocked.request
			.mockResolvedValueOnce({ id: 'conflict-event', etag: 'current-google-etag' })
			.mockResolvedValueOnce(undefined);
		await resolveGoogleCalendarConflict(
			client,
			familyId,
			userId,
			connectionId,
			'conflict-event',
			0,
			'local'
		);
		expect(mocked.request.mock.calls[1][1]).toMatchObject({
			method: 'DELETE',
			headers: { 'If-Match': 'current-google-etag' }
		});
		expect(writes).toContainEqual({ remote_deleted: true, conflict: null });
	});
});
