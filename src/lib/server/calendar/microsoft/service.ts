import { createCalendarService } from '../external-service';
import * as provider from './provider';
import * as config from './config';
const service = createCalendarService({
	provider: 'microsoft_calendar',
	label: 'Outlook Calendar',
	context: 'microsoft-calendar',
	config: config.microsoftCalendarConfig,
	configured: config.microsoftCalendarConfigured,
	serviceClient: config.calendarServiceClient,
	request: provider.microsoftRequest,
	eventBody: provider.microsoftEventBody,
	eventUrl: provider.microsoftEventUrl,
	listEvents: provider.listMicrosoftEvents,
	listChanges: provider.listMicrosoftEventChanges,
	normalizeEvent: provider.normalizeMicrosoftEvent,
	refreshTokens: provider.refreshMicrosoftTokens,
	exportEvent: provider.exportMicrosoftEvent
});
export const requireCalendarMembership = service.requireCalendarMembership;
export const loadMicrosoftCalendarPanel = service.loadPanel;
export const calendarTokenContext = service.tokenContext;
export const selectMicrosoftCalendar = service.selectCalendar;
export const syncMicrosoftCalendar = service.syncCalendar;
export const autoSyncMicrosoftCalendar = service.autoSyncCalendar;
export const exportMicrosoftCalendarEvent = service.exportEvent;
export const resolveMicrosoftCalendarConflict = service.resolveConflict;
export const disconnectMicrosoftCalendar = service.disconnect;
export type MicrosoftCalendarPanel = Awaited<ReturnType<typeof loadMicrosoftCalendarPanel>>;
