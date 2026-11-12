import type { GoogleEvent } from './google/provider';

export type CalendarSyncCursor =
	| { kind: 'google'; token: string; from: string; to: string }
	| { kind: 'microsoft-delta'; url: string; from: string; to: string; ids?: string[] }
	| { kind: 'microsoft-index'; ids: string[]; from: string; to: string };

export interface CalendarSyncBatch {
	events: GoogleEvent[];
	cursor: CalendarSyncCursor;
	full: boolean;
}

export interface CalendarSyncLink {
	remote_event_id: string;
	remote_etag: string;
	remote_deleted: boolean;
}
