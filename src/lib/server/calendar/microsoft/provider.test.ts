import { describe, expect, it, vi } from 'vitest';
import {
	microsoftAuthorizationUrl,
	listMicrosoftEvents,
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
