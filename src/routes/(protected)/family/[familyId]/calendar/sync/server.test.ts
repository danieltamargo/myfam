import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './+server';

const mocked = vi.hoisted(() => ({
	guard: vi.fn(),
	googlePanel: vi.fn(),
	microsoftPanel: vi.fn(),
	googleSync: vi.fn(),
	microsoftSync: vi.fn()
}));
vi.mock('$lib/server/modules/availability', () => ({ requireModuleAvailable: mocked.guard }));
vi.mock('$lib/server/calendar/google/service', () => ({
	loadGoogleCalendarPanel: mocked.googlePanel,
	autoSyncGoogleCalendar: mocked.googleSync
}));
vi.mock('$lib/server/calendar/microsoft/service', () => ({
	loadMicrosoftCalendarPanel: mocked.microsoftPanel,
	autoSyncMicrosoftCalendar: mocked.microsoftSync
}));

function event(origin = 'https://example.test', signedIn = true) {
	return {
		request: new Request('https://example.test/family/family/calendar/sync', {
			method: 'POST',
			headers: { Origin: origin }
		}),
		url: new URL('https://example.test/family/family/calendar/sync'),
		params: { familyId: 'family' },
		locals: {
			supabase: {},
			safeGetSession: async () => ({ user: signedIn ? { id: 'user' } : null })
		}
	};
}

beforeEach(() => {
	vi.resetAllMocks();
	mocked.googlePanel.mockResolvedValue({
		configured: true,
		connection: { id: 'google', calendarId: 'owned' }
	});
	mocked.microsoftPanel.mockResolvedValue({
		configured: true,
		connection: { id: 'microsoft', calendarId: 'owned' }
	});
	mocked.googleSync.mockResolvedValue({ status: 'synced', conflicts: 0, changed: true });
	mocked.microsoftSync.mockResolvedValue({ status: 'recent', conflicts: 0, changed: false });
});

describe('background calendar sync endpoint', () => {
	it('rejects cross-origin requests before accessing calendars', async () => {
		const response = await POST(event('https://other.test') as never);
		expect(response.status).toBe(403);
		expect(mocked.googlePanel).not.toHaveBeenCalled();
	});
	it('requires a verified application identity', async () => {
		const response = await POST(event('https://example.test', false) as never);
		expect(response.status).toBe(401);
		expect(mocked.googleSync).not.toHaveBeenCalled();
	});
	it('checks family module access before loading or syncing connections', async () => {
		mocked.guard.mockRejectedValueOnce({ status: 404 });
		await expect(POST(event() as never)).rejects.toMatchObject({ status: 404 });
		expect(mocked.googlePanel).not.toHaveBeenCalled();
	});
	it('synchronizes only the current user connections and returns no private cursor', async () => {
		const response = await POST(event() as never);
		expect(mocked.googleSync).toHaveBeenCalledWith({}, 'family', 'user', 'google');
		expect(mocked.microsoftSync).toHaveBeenCalledWith({}, 'family', 'user', 'microsoft');
		expect(await response.json()).toEqual({
			changed: true,
			results: [
				{ provider: 'google_calendar', status: 'synced', conflicts: 0, changed: true },
				{ provider: 'microsoft_calendar', status: 'recent', conflicts: 0, changed: false }
			]
		});
		expect(response.headers.get('cache-control')).toBe('no-store');
	});
	it('keeps the other provider working and reports an explicit partial failure', async () => {
		mocked.googleSync.mockRejectedValueOnce(new Error('private provider detail'));
		const response = await POST(event() as never);
		const body = await response.json();
		expect(body.results[0]).toMatchObject({ status: 'error', message: expect.any(String) });
		expect(JSON.stringify(body)).not.toContain('private provider detail');
		expect(mocked.microsoftSync).toHaveBeenCalledOnce();
	});
	it('does not call an unconfigured provider or a connection without a selected calendar', async () => {
		mocked.googlePanel.mockResolvedValueOnce({ configured: false, connection: null });
		mocked.microsoftPanel.mockResolvedValueOnce({
			configured: true,
			connection: { id: 'microsoft' }
		});
		const response = await POST(event() as never);
		expect((await response.json()).changed).toBe(false);
		expect(mocked.googleSync).not.toHaveBeenCalled();
		expect(mocked.microsoftSync).not.toHaveBeenCalled();
	});
});
