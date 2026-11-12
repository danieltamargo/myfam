import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';
import type { MicrosoftCalendarConfig } from './config';
import type { MicrosoftEvent } from './provider';
import { MicrosoftCalendarError } from './provider';
import { encryptCalendarSecret } from '../google/crypto';
import {
	calendarTokenContext,
	autoSyncMicrosoftCalendar,
	resolveMicrosoftCalendarConflict,
	syncMicrosoftCalendar
} from './service';

const mocked = vi.hoisted(() => ({
	client: null as unknown as SupabaseClient<Database>,
	config: {} as MicrosoftCalendarConfig,
	events: [] as MicrosoftEvent[],
	request: vi.fn(),
	changes: vi.fn()
}));
vi.mock('./config', () => ({
	microsoftCalendarConfig: () => mocked.config,
	calendarServiceClient: () => mocked.client,
	microsoftCalendarConfigured: () => true
}));
vi.mock('./provider', async (original) => ({
	...(await original<typeof import('./provider')>()),
	listMicrosoftEvents: () => Promise.resolve(mocked.events),
	listMicrosoftEventChanges: mocked.changes,
	microsoftRequest: mocked.request
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
		provider: 'microsoft_calendar',
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
	return { client, rpc, writes };
}

beforeEach(() => {
	mocked.config = {
		clientId: 'client',
		clientSecret: 'synthetic-client-secret',
		redirectUri: 'https://example.test/calendar/microsoft/callback',
		keys: { activeId: 'test', keys: { test: Buffer.alloc(32, 1).toString('base64') } },
		databaseUrl: 'https://database.example.test',
		databaseSecret: 'synthetic-database-secret'
	};
	mocked.events = [];
	mocked.request.mockReset();
	mocked.changes.mockReset().mockImplementation(async () => ({
		events: mocked.events,
		cursor: {
			kind: 'microsoft-index',
			ids: mocked.events.map((event) => event.id),
			from: '2026-10-01T00:00:00Z',
			to: '2027-11-01T00:00:00Z'
		},
		full: true
	}));
});

describe('Microsoft Calendar synchronization orchestration', () => {
	it('skips recent automatic Outlook syncs before calling the provider', async () => {
		const { client, rpc } = fakeDatabase([], {
			metadata: { calendars: [], calendarId: 'owned', lastSyncedAt: new Date().toISOString() }
		});
		expect(await autoSyncMicrosoftCalendar(client, familyId, userId, connectionId)).toMatchObject({
			status: 'recent',
			changed: false
		});
		expect(rpc).not.toHaveBeenCalled();
		expect(mocked.changes).not.toHaveBeenCalled();
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
		expect(await syncMicrosoftCalendar(client, familyId, userId, connectionId)).toBe(0);
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
		expect(await syncMicrosoftCalendar(client, familyId, userId, connectionId)).toBe(1);
		expect(writes).toContainEqual({ conflict: 'local_deleted_remote_changed' });
		expect(mocked.request).not.toHaveBeenCalled();
	});

	it('restores a locally deleted event only after an explicit Microsoft choice', async () => {
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
		await resolveMicrosoftCalendarConflict(
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

	it('uses the freshly read Microsoft etag when explicitly confirming a local deletion', async () => {
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
			.mockResolvedValueOnce({ id: 'conflict-event', etag: 'current-microsoft-etag' })
			.mockResolvedValueOnce(undefined);
		await resolveMicrosoftCalendarConflict(
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
			headers: { 'If-Match': 'current-microsoft-etag' }
		});
		expect(writes).toContainEqual({ remote_deleted: true, conflict: null });
	});
	it('persists an If-Match race as a visible conflict instead of overwriting', async () => {
		const { client, writes } = fakeDatabase([
			{
				connection_id: connectionId,
				remote_event_id: 'race',
				local_event_id: eventId,
				direction: 'exported',
				remote_etag: 'old',
				local_version: 0,
				remote_deleted: false,
				conflict: null
			}
		]);
		mocked.events = [
			{
				id: 'race',
				etag: 'old',
				start: { dateTime: local.starts_at },
				end: { dateTime: local.ends_at }
			}
		];
		mocked.request.mockRejectedValueOnce(new MicrosoftCalendarError(412, 'conflict'));
		expect(await syncMicrosoftCalendar(client, familyId, userId, connectionId)).toBe(1);
		expect(writes).toContainEqual({ conflict: 'both_changed' });
	});
});
