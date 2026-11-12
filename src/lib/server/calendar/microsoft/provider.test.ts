import { describe, expect, it, vi } from 'vitest';
import {
	microsoftAuthorizationUrl,
	listMicrosoftEvents,
	listMicrosoftEventChanges,
	listOwnedMicrosoftCalendars,
	microsoftEventBody,
	microsoftRequest,
	normalizeMicrosoftEvent,
	exchangeMicrosoftCode,
	exportMicrosoftEvent
} from './provider';
const config = {
	clientId: 'synthetic-client',
	clientSecret: 'synthetic-secret',
	redirectUri: 'https://example.test/calendar/microsoft/callback'
};
const remote = {
	id: 'instance',
	'@odata.etag': 'etag-1',
	subject: 'Reunión',
	body: { contentType: 'text', content: 'Descripción' },
	start: { dateTime: '2026-11-01T10:00:00.0000000', timeZone: 'UTC' },
	end: { dateTime: '2026-11-01T11:00:00.0000000', timeZone: 'UTC' }
};
describe('Microsoft calendar provider', () => {
	it('requests delegated calendar access with PKCE without login identity scopes', () => {
		const url = new URL(microsoftAuthorizationUrl(config, 'nonce', 'verifier'));
		expect(url.origin).toBe('https://login.microsoftonline.com');
		expect(url.searchParams.get('scope')).toBe(
			'https://graph.microsoft.com/Calendars.ReadWrite offline_access'
		);
		expect(url.searchParams.get('code_challenge_method')).toBe('S256');
		expect(url.searchParams.get('state')).toBe('nonce');
	});
	it('normalizes UTC instances without attendees, preserving UTF-8', async () => {
		const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
			Response.json({ value: [remote] })
		);
		const values = await listMicrosoftEvents(
			'synthetic',
			'own',
			'2026-10-01T00:00:00Z',
			'2027-10-01T00:00:00Z',
			fetcher
		);
		expect(normalizeMicrosoftEvent(values[0], 'UTC')).toMatchObject({
			title: 'Reunión',
			description: 'Descripción',
			startsAt: '2026-11-01T10:00:00.000Z'
		});
		expect(fetcher.mock.calls[0][0]).toContain('/calendarView?');
	});
	it('rejects nextLink SSRF before sending a token to an external host', async () => {
		const fetcher = vi.fn(async () =>
			Response.json({ value: [], '@odata.nextLink': 'https://attacker.example/events' })
		);
		await expect(listMicrosoftEvents('synthetic', 'own', 'from', 'to', fetcher)).rejects.toThrow();
		expect(fetcher).toHaveBeenCalledTimes(1);
	});
	it('bounds pagination instead of accepting partial data', async () => {
		const fetcher = vi.fn(async () =>
			Response.json({
				value: [],
				'@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/calendars?page=next'
			})
		);
		await expect(listOwnedMicrosoftCalendars('synthetic', fetcher)).rejects.toThrow();
		expect(fetcher).toHaveBeenCalledTimes(20);
	});
	it('requires owner calendar capabilities and never stores owner account metadata', async () => {
		const fetcher = vi.fn(async () =>
			Response.json({
				value: [
					{ id: 'own', name: 'Personal', canEdit: true, canShare: true },
					{ id: 'shared', canEdit: true, canShare: false }
				]
			})
		);
		expect(await listOwnedMicrosoftCalendars('synthetic', fetcher)).toEqual([
			{ id: 'own', label: 'Personal', timezone: 'UTC' }
		]);
	});
	it('sends private events without attendees and propagates If-Match conflicts', async () => {
		expect(
			microsoftEventBody({
				title: 'Mío',
				description: null,
				startsAt: '2026-11-01T10:00:00Z',
				endsAt: '2026-11-01T11:00:00Z',
				timezone: 'UTC',
				allDay: false
			})
		).toMatchObject({ sensitivity: 'private', subject: 'Mío' });
		const fetcher = vi.fn(async () => new Response(null, { status: 412 }));
		await expect(
			microsoftRequest(
				'https://graph.microsoft.com/v1.0/me/events/id',
				{ method: 'PATCH', headers: { 'If-Match': 'old' } },
				fetcher
			)
		).rejects.toMatchObject({ status: 412, reason: 'conflict' });
	});
	it('rejects missing refresh grants and scopes before storing credentials', async () => {
		await expect(
			exchangeMicrosoftCode(config, 'code', 'verifier', async () =>
				Response.json({ access_token: 'synthetic', expires_in: 3600, scope: 'Calendars.ReadWrite' })
			)
		).rejects.toThrow();
	});
	it('recovers a created export by its stable extended property before another POST', async () => {
		const marker = {
			myfamilyConnectionId: 'connection',
			myfamilyEventId: 'event',
			myfamilyVersion: '1'
		};
		const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			Response.json({
				value: [
					{
						...remote,
						singleValueExtendedProperties: [
							{
								id: 'String {69074a38-9b73-4e7f-8a8f-d7ce2fd64e4d} Name MyFamilyCalendar',
								value: JSON.stringify(marker)
							}
						]
					}
				]
			})
		);
		try {
			const value = await exportMicrosoftEvent('synthetic', 'own', 'connection', 'event', 1, {
				title: 'Mío',
				description: null,
				startsAt: '2026-11-01T10:00:00Z',
				endsAt: '2026-11-01T11:00:00Z',
				timezone: 'UTC',
				allDay: false
			});
			expect(value.extendedProperties?.private).toEqual(marker);
			expect(fetcher).toHaveBeenCalledTimes(1);
		} finally {
			fetcher.mockRestore();
		}
	});
});

describe('Microsoft incremental synchronization', () => {
	const from = '2026-11-01T00:00:00Z';
	const to = '2027-11-01T00:00:00Z';
	const deltaUrl =
		'https://graph.microsoft.com/v1.0/me/calendarView/delta?$deltatoken=opaque%2Btoken';
	const cursor = { kind: 'microsoft-delta' as const, url: deltaUrl, ids: [remote.id], from, to };
	const link = {
		remote_event_id: remote.id,
		remote_etag: remote['@odata.etag'],
		remote_deleted: false
	};
	it('paginates primary delta without unsupported options and reads markers only for changed events', async () => {
		const next = 'https://graph.microsoft.com/v1.0/me/calendarView/delta?$skiptoken=opaque%2Btoken';
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(Response.json({ id: 'own' }))
			.mockResolvedValueOnce(
				Response.json({ value: [{ ...remote, '@odata.etag': 'changed' }], '@odata.nextLink': next })
			)
			.mockResolvedValueOnce(Response.json({ value: [], '@odata.deltaLink': deltaUrl }))
			.mockResolvedValueOnce(Response.json({ ...remote, '@odata.etag': 'changed' }));
		const result = await listMicrosoftEventChanges(
			'access',
			'own',
			from,
			to,
			null,
			[link],
			fetcher
		);
		expect(result).toMatchObject({
			full: true,
			cursor: { kind: 'microsoft-delta', url: deltaUrl }
		});
		expect(result.events[0].etag).toBe('changed');
		const initial = new URL(String(fetcher.mock.calls[1][0]));
		expect(initial.pathname).toBe('/v1.0/me/calendarView/delta');
		expect(initial.searchParams.get('startDateTime')).toBe(from);
		expect(initial.searchParams.has('$expand')).toBe(false);
		expect(initial.searchParams.has('$select')).toBe(false);
		expect(fetcher.mock.calls[2][0]).toBe(next);
		expect(new URL(String(fetcher.mock.calls[3][0])).searchParams.get('$expand')).toContain(
			'singleValueExtendedProperties'
		);
	});
	it('keeps opaque delta URLs intact and avoids fetching unchanged event bodies', async () => {
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(Response.json({ id: 'own' }))
			.mockResolvedValueOnce(Response.json({ value: [remote], '@odata.deltaLink': deltaUrl }));
		expect(
			await listMicrosoftEventChanges('access', 'own', from, to, cursor, [link], fetcher)
		).toMatchObject({ events: [], full: false });
		expect(fetcher.mock.calls[1][0]).toBe(deltaUrl);
		expect(fetcher).toHaveBeenCalledTimes(2);
	});
	it('rechecks tombstones so a moved event is retained while a missing event is deleted', async () => {
		const removed = { id: 'gone', '@removed': { reason: 'deleted' } };
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(Response.json({ id: 'own' }))
			.mockResolvedValueOnce(
				Response.json({
					value: [{ id: remote.id, '@removed': { reason: 'deleted' } }, removed],
					'@odata.deltaLink': deltaUrl
				})
			)
			.mockResolvedValueOnce(Response.json(remote))
			.mockResolvedValueOnce(new Response(null, { status: 404 }));
		const result = await listMicrosoftEventChanges(
			'access',
			'own',
			from,
			to,
			cursor,
			[link, { ...link, remote_event_id: 'gone' }],
			fetcher
		);
		expect(result.events).toEqual([
			expect.objectContaining({ id: remote.id, status: 'confirmed' }),
			{ id: 'gone', etag: link.remote_etag, status: 'cancelled' }
		]);
	});
	it('uses a lightweight secondary index and requests details only for changed, new, or missing IDs', async () => {
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(Response.json({ id: 'primary' }))
			.mockResolvedValueOnce(
				Response.json({
					value: [
						remote,
						{ id: 'new', '@odata.etag': 'new-v1' },
						{ id: 'changed', '@odata.etag': 'changed-v2' }
					]
				})
			)
			.mockResolvedValueOnce(Response.json({ ...remote, id: 'new', '@odata.etag': 'new-v1' }))
			.mockResolvedValueOnce(
				Response.json({ ...remote, id: 'changed', '@odata.etag': 'changed-v2' })
			)
			.mockResolvedValueOnce(new Response(null, { status: 404 }));
		const previous = {
			kind: 'microsoft-index' as const,
			ids: [remote.id, 'changed', 'gone'],
			from,
			to
		};
		const result = await listMicrosoftEventChanges(
			'access',
			'secondary',
			from,
			to,
			previous,
			[link, { ...link, remote_event_id: 'changed' }, { ...link, remote_event_id: 'gone' }],
			fetcher
		);
		expect(result.events.map((event) => event.id)).toEqual(['new', 'changed', 'gone']);
		expect(result.cursor).toMatchObject({
			kind: 'microsoft-index',
			ids: [remote.id, 'new', 'changed']
		});
		expect(result.full).toBe(false);
		const index = new URL(String(fetcher.mock.calls[1][0]));
		expect(index.pathname).toBe('/v1.0/me/calendars/secondary/calendarView');
		expect(index.searchParams.get('$select')).toBe('id,changeKey,isCancelled');
		expect(index.searchParams.has('$expand')).toBe(false);
		expect(fetcher).toHaveBeenCalledTimes(5);
	});
	it('recovers expired delta cursors and renews a rolling primary window', async () => {
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(Response.json({ id: 'own' }))
			.mockResolvedValueOnce(new Response(null, { status: 410 }))
			.mockResolvedValueOnce(Response.json({ value: [], '@odata.deltaLink': deltaUrl }));
		expect(
			await listMicrosoftEventChanges('access', 'own', from, to, cursor, [], fetcher)
		).toMatchObject({ full: true });
		expect(new URL(String(fetcher.mock.calls[2][0])).searchParams.get('startDateTime')).toBe(from);
		const rolling = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(Response.json({ id: 'own' }))
			.mockResolvedValueOnce(Response.json({ value: [], '@odata.deltaLink': deltaUrl }));
		await listMicrosoftEventChanges(
			'access',
			'own',
			from,
			'2027-11-02T00:00:00Z',
			cursor,
			[],
			rolling
		);
		expect(new URL(String(rolling.mock.calls[1][0])).searchParams.get('endDateTime')).toBe(
			'2027-11-02T00:00:00Z'
		);
	});
	it('keeps checking secondary links after they leave the window across several rounds', async () => {
		const first = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(Response.json({ id: 'primary' }))
			.mockResolvedValueOnce(Response.json({ value: [] }))
			.mockResolvedValueOnce(Response.json({ id: remote.id, '@odata.etag': 'moved-v2' }))
			.mockResolvedValueOnce(
				Response.json({
					...remote,
					'@odata.etag': 'moved-v2',
					start: { dateTime: '2028-01-01T10:00:00', timeZone: 'UTC' },
					end: { dateTime: '2028-01-01T11:00:00', timeZone: 'UTC' }
				})
			);
		const result = await listMicrosoftEventChanges(
			'access',
			'secondary',
			from,
			to,
			{ kind: 'microsoft-index', ids: [remote.id], from, to },
			[link],
			first
		);
		expect(result.cursor).toMatchObject({ ids: [] });
		expect(result.events[0].etag).toBe('moved-v2');
		const updatedLink = { ...link, remote_etag: 'moved-v2' };
		const second = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(Response.json({ id: 'primary' }))
			.mockResolvedValueOnce(Response.json({ value: [] }))
			.mockResolvedValueOnce(new Response(null, { status: 304 }));
		const unchanged = await listMicrosoftEventChanges(
			'access',
			'secondary',
			from,
			to,
			result.cursor,
			[updatedLink],
			second
		);
		expect(unchanged.events).toEqual([]);
		expect(new Headers(second.mock.calls[2][1]?.headers).get('If-None-Match')).toBe('moved-v2');
		const third = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(Response.json({ id: 'primary' }))
			.mockResolvedValueOnce(Response.json({ value: [] }))
			.mockResolvedValueOnce(new Response(null, { status: 404 }));
		const deleted = await listMicrosoftEventChanges(
			'access',
			'secondary',
			from,
			to,
			unchanged.cursor,
			[updatedLink],
			third
		);
		expect(deleted.events).toEqual([{ id: remote.id, etag: 'moved-v2', status: 'cancelled' }]);
	});
	it.each(['primary', 'secondary'])(
		'tracks newly exported outside-window links in %s calendars',
		async (kind) => {
			const exported = { ...link, remote_event_id: 'exported-outside' };
			const primary = kind === 'primary';
			const previous = primary
				? cursor
				: { kind: 'microsoft-index' as const, ids: [remote.id], from, to };
			const first = vi
				.fn<typeof fetch>()
				.mockResolvedValueOnce(Response.json({ id: primary ? 'own' : 'other' }))
				.mockResolvedValueOnce(
					Response.json({
						value: primary ? [] : [remote],
						...(primary ? { '@odata.deltaLink': deltaUrl } : {})
					})
				)
				.mockResolvedValueOnce(new Response(null, { status: 304 }));
			const result = await listMicrosoftEventChanges(
				'access',
				'own',
				from,
				to,
				previous,
				[link, exported],
				first
			);
			expect(result.events).toEqual([]);
			expect(first).toHaveBeenCalledTimes(3);
			expect(String(first.mock.calls[2][0])).toContain('/events/exported-outside?');
			expect(new Headers(first.mock.calls[2][1]?.headers).get('If-None-Match')).toBe(
				link.remote_etag
			);
			const second = vi
				.fn<typeof fetch>()
				.mockResolvedValueOnce(Response.json({ id: primary ? 'own' : 'other' }))
				.mockResolvedValueOnce(
					Response.json({
						value: primary ? [] : [remote],
						...(primary ? { '@odata.deltaLink': deltaUrl } : {})
					})
				)
				.mockResolvedValueOnce(new Response(null, { status: 404 }));
			expect(
				(
					await listMicrosoftEventChanges(
						'access',
						'own',
						from,
						to,
						result.cursor,
						[link, exported],
						second
					)
				).events
			).toEqual([
				{ id: exported.remote_event_id, etag: exported.remote_etag, status: 'cancelled' }
			]);
			expect(second).toHaveBeenCalledTimes(3);
		}
	);
	it('initializes window membership once for a legacy delta cursor', async () => {
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(Response.json({ id: 'own' }))
			.mockResolvedValueOnce(Response.json({ value: [remote], '@odata.deltaLink': deltaUrl }));
		const result = await listMicrosoftEventChanges(
			'access',
			'own',
			from,
			to,
			{ kind: 'microsoft-delta', url: deltaUrl, from, to },
			[link],
			fetcher
		);
		expect(result).toMatchObject({ full: true, cursor: { ids: [remote.id] }, events: [] });
		expect(new URL(String(fetcher.mock.calls[1][0])).searchParams.get('startDateTime')).toBe(from);
	});
	it('tracks a primary event after a delta tombstone moves it outside the window', async () => {
		const first = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(Response.json({ id: 'own' }))
			.mockResolvedValueOnce(
				Response.json({
					value: [{ id: remote.id, '@removed': { reason: 'deleted' } }],
					'@odata.deltaLink': deltaUrl
				})
			)
			.mockResolvedValueOnce(
				Response.json({
					...remote,
					'@odata.etag': 'moved-v2',
					start: { dateTime: '2028-01-01T10:00:00', timeZone: 'UTC' },
					end: { dateTime: '2028-01-01T11:00:00', timeZone: 'UTC' }
				})
			);
		const moved = await listMicrosoftEventChanges('access', 'own', from, to, cursor, [link], first);
		expect(moved.cursor).toMatchObject({ ids: [] });
		const second = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(Response.json({ id: 'own' }))
			.mockResolvedValueOnce(Response.json({ value: [], '@odata.deltaLink': deltaUrl }))
			.mockResolvedValueOnce(new Response(null, { status: 404 }));
		const result = await listMicrosoftEventChanges(
			'access',
			'own',
			from,
			to,
			moved.cursor,
			[{ ...link, remote_etag: 'moved-v2' }],
			second
		);
		expect(result.events).toEqual([{ id: remote.id, etag: 'moved-v2', status: 'cancelled' }]);
	});
	it('keeps outside-window checks compact even when Graph returns 200 for an unchanged ETag', async () => {
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(Response.json({ id: 'primary' }))
			.mockResolvedValueOnce(Response.json({ value: [] }))
			.mockResolvedValueOnce(Response.json({ id: remote.id, '@odata.etag': link.remote_etag }));
		const result = await listMicrosoftEventChanges(
			'access',
			'secondary',
			from,
			to,
			{ kind: 'microsoft-index', ids: [], from, to },
			[link],
			fetcher
		);
		expect(result.events).toEqual([]);
		expect(fetcher).toHaveBeenCalledTimes(3);
		const check = new URL(String(fetcher.mock.calls[2][0]));
		expect(check.searchParams.get('$select')).toBe('id,changeKey,isCancelled');
		expect(check.searchParams.has('$expand')).toBe(false);
	});
	it.each([
		'https://attacker.example/v1.0/me/calendarView/delta',
		'https://graph.microsoft.com/v1.0/users/other/calendarView/delta',
		'https://graph.microsoft.com/v1.0/me/messages',
		'https://graph.microsoft.com/v1.0/me/calendars/other/calendarView'
	])('rejects unsafe delta destinations before sending credentials: %s', async (url) => {
		const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ id: 'own' }));
		await expect(
			listMicrosoftEventChanges('access', 'own', from, to, { ...cursor, url }, [], fetcher)
		).rejects.toThrow();
		expect(fetcher).toHaveBeenCalledTimes(1);
	});
	it('rejects secondary pagination that changes the selected calendar', async () => {
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(Response.json({ id: 'primary' }))
			.mockResolvedValueOnce(
				Response.json({
					value: [],
					'@odata.nextLink':
						'https://graph.microsoft.com/v1.0/me/calendars/other/calendarView?$skiptoken=next'
				})
			);
		await expect(
			listMicrosoftEventChanges('access', 'secondary', from, to, null, [], fetcher)
		).rejects.toThrow();
		expect(fetcher).toHaveBeenCalledTimes(2);
	});
	it.each([
		{ value: [] },
		{ value: 'bad', '@odata.deltaLink': deltaUrl },
		{ value: [{ id: 'missing-etag' }], '@odata.deltaLink': deltaUrl },
		{ value: [{ id: remote.id, '@removed': 'invalid' }], '@odata.deltaLink': deltaUrl },
		{ value: [{ ...remote, isCancelled: 'false' }], '@odata.deltaLink': deltaUrl }
	])('rejects malformed or incomplete delta responses', async (body) => {
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(Response.json({ id: 'own' }))
			.mockResolvedValueOnce(Response.json(body));
		await expect(
			listMicrosoftEventChanges('access', 'own', from, to, cursor, [], fetcher)
		).rejects.toMatchObject({ status: 502 });
	});
	it('fails the batch on detail authorization errors', async () => {
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(Response.json({ id: 'own' }))
			.mockResolvedValueOnce(Response.json({ value: [remote], '@odata.deltaLink': deltaUrl }))
			.mockResolvedValueOnce(new Response(null, { status: 403 }));
		await expect(
			listMicrosoftEventChanges('access', 'own', from, to, cursor, [], fetcher)
		).rejects.toMatchObject({ status: 403 });
	});
	it('fails rather than advancing a cursor after the delta page limit', async () => {
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(Response.json({ id: 'own' }))
			.mockImplementation(async () => Response.json({ value: [], '@odata.nextLink': deltaUrl }));
		await expect(
			listMicrosoftEventChanges('access', 'own', from, to, cursor, [], fetcher)
		).rejects.toMatchObject({ reason: 'limit' });
		expect(fetcher).toHaveBeenCalledTimes(21);
	});
});
