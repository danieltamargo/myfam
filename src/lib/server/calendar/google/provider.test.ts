import { describe, expect, it, vi } from 'vitest';
import {
	exchangeGoogleCode,
	googleAuthorizationUrl,
	googleEventBody,
	googleRequest,
	GoogleCalendarError,
	listGoogleEvents,
	listGoogleEventChanges,
	listOwnedGoogleCalendars,
	normalizeGoogleEvent,
	remoteGoogleEventId,
	GOOGLE_CALENDAR_SCOPES
} from './provider';

const config = {
	clientId: 'test-client',
	clientSecret: 'synthetic-client-secret',
	redirectUri: 'https://myfamily.example/calendar/google/callback'
};
describe('Google Calendar provider', () => {
	it('requests only owned events and calendar-list access with state and PKCE', () => {
		const url = new URL(googleAuthorizationUrl(config, 'nonce', 'verifier'));
		expect(url.searchParams.get('scope')).toBe(GOOGLE_CALENDAR_SCOPES.join(' '));
		expect(url.searchParams.get('state')).toBe('nonce');
		expect(url.searchParams.get('code_challenge_method')).toBe('S256');
		expect(url.searchParams.get('code_challenge')).not.toBe('verifier');
		expect(url.toString()).not.toContain(config.clientSecret);
	});
	it('rejects partial consent instead of treating connection as successful', async () => {
		const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(
				JSON.stringify({
					access_token: 'synthetic-access',
					refresh_token: 'synthetic-refresh',
					expires_in: 3600,
					scope: GOOGLE_CALENDAR_SCOPES[0]
				})
			)
		);
		await expect(exchangeGoogleCode(config, 'code', 'verifier', fetcher)).rejects.toMatchObject({
			reason: 'authorization'
		});
	});
	it('paginates expanded events using the same bounded window and includes cancelled exceptions', async () => {
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({ items: [{ id: 'instance-a', etag: 'etag-a' }], nextPageToken: 'second' })
				)
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ items: [{ id: 'cancelled-instance', status: 'cancelled' }] }))
			);
		const events = await listGoogleEvents(
			'synthetic-access',
			'owner/calendar',
			'2026-11-01T00:00:00Z',
			'2027-11-01T00:00:00Z',
			fetcher
		);
		expect(events.map((event) => event.id)).toEqual(['instance-a', 'cancelled-instance']);
		const second = new URL(String(fetcher.mock.calls[1][0]));
		expect(second.searchParams.get('singleEvents')).toBe('true');
		expect(second.searchParams.get('showDeleted')).toBe('true');
		expect(second.searchParams.get('timeMin')).toBe('2026-11-01T00:00:00Z');
		expect(second.searchParams.get('pageToken')).toBe('second');
	});
	it('excludes subscribed calendars that are not owned by the connecting user', async () => {
		const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(
				JSON.stringify({
					items: [
						{ id: 'owned', accessRole: 'owner', summary: 'Personal' },
						{ id: 'shared', accessRole: 'writer', summary: 'Office' }
					]
				})
			)
		);
		expect(
			(await listOwnedGoogleCalendars('synthetic-access', fetcher)).map((calendar) => calendar.id)
		).toEqual(['owned']);
	});
	it('preserves all-day dates across DST and treats cancelled occurrences as deletions', () => {
		const event = normalizeGoogleEvent(
			{ id: 'all-day', etag: 'v1', start: { date: '2026-10-25' }, end: { date: '2026-10-26' } },
			'Europe/Madrid'
		);
		expect(event).toMatchObject({
			allDay: true,
			startsAt: '2026-10-24T22:00:00.000Z',
			endsAt: '2026-10-25T23:00:00.000Z'
		});
		expect(googleEventBody(event!)).toMatchObject({
			start: { date: '2026-10-25' },
			end: { date: '2026-10-26' },
			visibility: 'private'
		});
		expect(
			normalizeGoogleEvent({ id: 'cancelled', etag: 'v2', status: 'cancelled' }, 'Europe/Madrid')
		).toBeNull();
	});
	it('returns a conflict for failed conditional writes without exposing provider response bodies', async () => {
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response('sensitive provider body', { status: 412 }));
		await expect(
			googleRequest(
				'https://www.googleapis.com/calendar/v3/calendars/primary/events/event',
				{ method: 'PATCH' },
				fetcher
			)
		).rejects.toEqual(new GoogleCalendarError(412, 'conflict'));
	});
	it('uses stable Google-compatible event ids for retry-safe inserts', () => {
		expect(remoteGoogleEventId('connection', 'event')).toMatch(/^[0-9a-f]{64}$/);
		expect(remoteGoogleEventId('connection', 'event')).toBe(
			remoteGoogleEventId('connection', 'event')
		);
		expect(remoteGoogleEventId('connection-2', 'event')).not.toBe(
			remoteGoogleEventId('connection', 'event')
		);
	});
});

describe('Google incremental synchronization', () => {
	const from = '2026-11-01T00:00:00Z';
	const to = '2027-11-01T00:00:00Z';
	const cursor = { kind: 'google' as const, token: 'old', from, to };
	it('records the token only after every bounded initial page', async () => {
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				Response.json({ items: [{ id: 'one', etag: '1' }], nextPageToken: 'page-2' })
			)
			.mockResolvedValueOnce(
				Response.json({ items: [{ id: 'two', etag: '2' }], nextSyncToken: 'next' })
			);
		const result = await listGoogleEventChanges('access', 'own', from, to, null, [], fetcher);
		expect(result).toMatchObject({
			full: true,
			cursor: { kind: 'google', token: 'next', from, to }
		});
		expect(result.events.map((event) => event.id)).toEqual(['one', 'two']);
		for (const [url] of fetcher.mock.calls) {
			const params = new URL(String(url)).searchParams;
			expect(params.get('timeMin')).toBe(from);
			expect(params.get('timeMax')).toBe(to);
		}
	});
	it('uses the same token on every delta page without incompatible time filters', async () => {
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(Response.json({ items: [], nextPageToken: 'page-2' }))
			.mockResolvedValueOnce(
				Response.json({ items: [{ id: 'gone', status: 'cancelled' }], nextSyncToken: 'next' })
			);
		const result = await listGoogleEventChanges('access', 'own', from, to, cursor, [], fetcher);
		expect(result.full).toBe(false);
		expect(result.events[0].status).toBe('cancelled');
		for (const [url] of fetcher.mock.calls) {
			const params = new URL(String(url)).searchParams;
			expect(params.get('syncToken')).toBe('old');
			expect(params.has('timeMin')).toBe(false);
			expect(params.has('timeMax')).toBe(false);
		}
	});
	it('fetches only the newly entered horizon and deduplicates changed events', async () => {
		const nextTo = '2027-11-02T00:00:00Z';
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				Response.json({ items: [{ id: 'one', etag: '1' }], nextSyncToken: 'next' })
			)
			.mockResolvedValueOnce(
				Response.json({ items: [{ id: 'one', etag: '2' }], nextSyncToken: 'boundary' })
			);
		const result = await listGoogleEventChanges('access', 'own', from, nextTo, cursor, [], fetcher);
		expect(result.events).toEqual([{ id: 'one', etag: '2' }]);
		expect(result.cursor).toMatchObject({ token: 'next', from, to: nextTo });
		const boundary = new URL(String(fetcher.mock.calls[1][0]));
		expect(boundary.searchParams.get('timeMin')).toBe(to);
		expect(boundary.searchParams.get('timeMax')).toBe(nextTo);
	});
	it('recovers expired tokens with a bounded full refresh', async () => {
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(new Response(null, { status: 410 }))
			.mockResolvedValueOnce(Response.json({ items: [], nextSyncToken: 'replacement' }));
		const result = await listGoogleEventChanges('access', 'own', from, to, cursor, [], fetcher);
		expect(result).toMatchObject({ full: true, cursor: { token: 'replacement' } });
		expect(new URL(String(fetcher.mock.calls[1][0])).searchParams.get('timeMin')).toBe(from);
	});
	it.each([
		{ items: [] },
		{ items: 'invalid', nextSyncToken: 'next' },
		{ items: [{ id: 'one' }], nextSyncToken: 'next' }
	])('rejects incomplete or malformed successful responses', async (body) => {
		await expect(
			listGoogleEventChanges('access', 'own', from, to, cursor, [], async () => Response.json(body))
		).rejects.toMatchObject({ status: 502 });
	});
	it('does not recover unrelated errors or silently return partial pagination', async () => {
		const failure = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }));
		await expect(
			listGoogleEventChanges('access', 'own', from, to, cursor, [], failure)
		).rejects.toMatchObject({ status: 503 });
		expect(failure).toHaveBeenCalledTimes(1);
		const pages = vi
			.fn<typeof fetch>()
			.mockImplementation(async () => Response.json({ items: [], nextPageToken: 'more' }));
		await expect(
			listGoogleEventChanges('access', 'own', from, to, cursor, [], pages)
		).rejects.toMatchObject({ reason: 'limit' });
		expect(pages).toHaveBeenCalledTimes(20);
	});
});
