export interface CalendarAutoSyncState {
	syncing: boolean;
	message: string;
	errors: string[];
}

interface SyncResult {
	provider: 'google_calendar' | 'microsoft_calendar';
	status: 'synced' | 'recent' | 'busy' | 'unconfigured' | 'error';
	message?: string;
	conflicts?: number;
}

interface AutoSyncOptions {
	endpoint: string;
	invalidate: () => Promise<void>;
	onState: (state: CalendarAutoSyncState) => void;
	fetch?: typeof fetch;
	document?: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
	window?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
}

const activeMessage = 'Sincronización automática activa mientras el calendario esté abierto.';

function isSyncResult(value: unknown): value is SyncResult {
	if (!value || typeof value !== 'object') return false;
	const result = value as Record<string, unknown>;
	return (
		['google_calendar', 'microsoft_calendar'].includes(String(result.provider)) &&
		['synced', 'recent', 'busy', 'unconfigured', 'error'].includes(String(result.status)) &&
		(result.message === undefined || typeof result.message === 'string') &&
		(result.conflicts === undefined ||
			(typeof result.conflicts === 'number' &&
				Number.isInteger(result.conflicts) &&
				result.conflicts >= 0))
	);
}

export function startCalendarAutoSync(options: AutoSyncOptions): () => void {
	const fetcher = options.fetch ?? globalThis.fetch;
	const document = options.document ?? globalThis.document;
	const window = options.window ?? globalThis.window;
	let timer: ReturnType<typeof setInterval> | undefined;
	let controller: AbortController | undefined;
	let lastAttempt = -Infinity;
	let stopped = false;
	let inFlight = false;
	let refreshPending = false;

	function clearTimer() {
		clearInterval(timer);
		timer = undefined;
	}

	function stop() {
		stopped = true;
		clearTimer();
		controller?.abort();
		document.removeEventListener('visibilitychange', onVisibilityChange);
		window.removeEventListener('focus', onFocus);
	}

	async function attempt() {
		if (
			stopped ||
			inFlight ||
			document.visibilityState !== 'visible' ||
			Date.now() - lastAttempt < 60_000
		)
			return;
		inFlight = true;
		lastAttempt = Date.now();
		controller = new AbortController();
		const { signal } = controller;
		options.onState({
			syncing: true,
			message: 'Comprobando cambios en tus calendarios…',
			errors: []
		});
		try {
			const response = await fetcher(options.endpoint, {
				method: 'POST',
				credentials: 'same-origin',
				cache: 'no-store',
				redirect: 'error',
				headers: { 'Content-Type': 'application/json' },
				body: '{}',
				signal
			});
			if (stopped || signal.aborted) return;
			if (!response.ok) {
				if ([401, 403, 404].includes(response.status)) {
					options.onState({
						syncing: false,
						message: 'Sincronización automática detenida.',
						errors: ['Recarga el calendario para comprobar tu sesión y el acceso a esta familia.']
					});
					stop();
					return;
				}
				throw new Error('Calendar sync request failed');
			}
			const payload: unknown = await response.json();
			if (stopped || signal.aborted) return;
			if (
				!payload ||
				typeof payload !== 'object' ||
				!('changed' in payload) ||
				typeof payload.changed !== 'boolean' ||
				!('results' in payload) ||
				!Array.isArray(payload.results) ||
				!payload.results.every(isSyncResult)
			)
				throw new Error('Invalid calendar sync response');
			const results = payload.results as SyncResult[];
			const errors = results
				.filter((result) => result.status === 'error')
				.map(
					(result) =>
						`${result.provider === 'google_calendar' ? 'Google Calendar' : 'Outlook / Microsoft 365'}: ${result.message || 'No se pudo sincronizar. Se reintentará automáticamente.'}`
				);
			if (payload.changed || refreshPending) {
				refreshPending = true;
				try {
					await options.invalidate();
					refreshPending = false;
				} catch {
					errors.push(
						'Los calendarios se sincronizaron, pero no se pudo actualizar esta vista. Recarga el calendario.'
					);
				}
			}
			if (results.some((result) => result.status === 'error')) refreshPending = true;
			if (stopped || signal.aborted) return;
			options.onState({
				syncing: false,
				message: results.some((result) => (result.conflicts ?? 0) > 0)
					? 'Hay cambios en conflicto. Revisa las conexiones de calendario para resolverlos.'
					: activeMessage,
				errors
			});
		} catch {
			if (stopped || signal.aborted) return;
			refreshPending = true;
			options.onState({
				syncing: false,
				message: activeMessage,
				errors: [
					'No se pudo comprobar si hay cambios. Se reintentará automáticamente en dos minutos.'
				]
			});
		} finally {
			inFlight = false;
		}
	}

	function onFocus() {
		void attempt();
	}

	function onVisibilityChange() {
		clearTimer();
		if (document.visibilityState === 'visible') {
			timer = setInterval(onFocus, 120_000);
			void attempt();
		}
	}

	document.addEventListener('visibilitychange', onVisibilityChange);
	window.addEventListener('focus', onFocus);
	onVisibilityChange();
	return stop;
}
