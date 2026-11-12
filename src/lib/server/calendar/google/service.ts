import { createCalendarService } from '../external-service';
import * as provider from './provider';
import * as config from './config';
const service = createCalendarService({
	provider: 'google_calendar',
	label: 'Google Calendar',
	context: 'google-calendar',
	config: config.googleCalendarConfig,
	configured: config.googleCalendarConfigured,
	serviceClient: config.calendarServiceClient,
	request: provider.googleRequest,
	eventBody: provider.googleEventBody,
	eventUrl: provider.googleEventUrl,
	listEvents: provider.listGoogleEvents,
	listChanges: provider.listGoogleEventChanges,
	normalizeEvent: provider.normalizeGoogleEvent,
	refreshTokens: provider.refreshGoogleTokens,
	revokeToken: provider.revokeGoogleToken
});
export const requireCalendarMembership = service.requireCalendarMembership;
export const loadGoogleCalendarPanel = service.loadPanel;
export const calendarTokenContext = service.tokenContext;
export const selectGoogleCalendar = service.selectCalendar;
export const syncGoogleCalendar = service.syncCalendar;
export const autoSyncGoogleCalendar = service.autoSyncCalendar;
export const exportGoogleCalendarEvent = service.exportEvent;
export const resolveGoogleCalendarConflict = service.resolveConflict;
export const disconnectGoogleCalendar = service.disconnect;
export const googleSyncDecision = service.syncDecision;
export type GoogleCalendarPanel = Awaited<ReturnType<typeof loadGoogleCalendarPanel>>;
