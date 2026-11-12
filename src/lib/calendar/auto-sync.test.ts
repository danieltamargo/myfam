import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startCalendarAutoSync, type CalendarAutoSyncState } from './auto-sync';

class CalendarDocument extends EventTarget {
	visibilityState: DocumentVisibilityState = 'visible';

	setVisibility(value: DocumentVisibilityState) {
		this.visibilityState = value;
		this.dispatchEvent(new Event('visibilitychange'));
	}
}

function response(results = [{ provider: 'google_calendar', status: 'synced' }]) {
	return Response.json({ results, changed: true });
}

function setup({ hidden = false } = {}) {
	const document = new CalendarDocument();
	if (hidden) document.visibilityState = 'hidden';
	const window = new EventTarget();
	const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response());
	const invalidate = vi.fn<() => Promise<void>>().mockResolvedValue();
	const states: CalendarAutoSyncState[] = [];
	const start = () =>
		startCalendarAutoSync({
			endpoint: '/family/family-1/calendar/sync',
			document,
			window,
			fetch: fetcher,
			invalidate,
			onState: (state) => states.push(state)
		});
	return { document, window, fetcher, invalidate, states, start };
}

describe('startCalendarAutoSync', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-11-09T10:00:00Z'));
	});

	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	it('comprueba los calendarios al abrirlos sin esperar a la respuesta', async () => {
		const { start, fetcher, invalidate, states } = setup();
		const stop = start();
		expect(typeof stop).toBe('function');
		expect(states[0].syncing).toBe(true);
		expect(fetcher).toHaveBeenCalledWith('/family/family-1/calendar/sync', {
			method: 'POST',
			credentials: 'same-origin',
			cache: 'no-store',
			redirect: 'error',
			headers: { 'Content-Type': 'application/json' },
			body: '{}',
			signal: expect.any(AbortSignal)
		});
		await vi.advanceTimersByTimeAsync(0);
		expect(invalidate).toHaveBeenCalledOnce();
		expect(states.at(-1)).toMatchObject({ syncing: false, errors: [] });
		stop();
	});

	it('repite la comprobación cada dos minutos', async () => {
		const { start, fetcher } = setup();
		const stop = start();
		await vi.advanceTimersByTimeAsync(119_999);
		expect(fetcher).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(1);
		expect(fetcher).toHaveBeenCalledTimes(2);
		stop();
	});

	it('omite los intentos de foco y visibilidad durante el primer minuto', async () => {
		const { start, fetcher, window, document } = setup();
		const stop = start();
		await vi.advanceTimersByTimeAsync(59_999);
		window.dispatchEvent(new Event('focus'));
		document.setVisibility('hidden');
		document.setVisibility('visible');
		expect(fetcher).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(1);
		window.dispatchEvent(new Event('focus'));
		await vi.advanceTimersByTimeAsync(0);
		expect(fetcher).toHaveBeenCalledTimes(2);
		stop();
	});

	it('pausa el temporizador cuando se oculta y comprueba los cambios al volver', async () => {
		const { start, fetcher, window, document } = setup();
		const stop = start();
		await vi.advanceTimersByTimeAsync(0);
		document.setVisibility('hidden');
		expect(vi.getTimerCount()).toBe(0);
		await vi.advanceTimersByTimeAsync(240_000);
		window.dispatchEvent(new Event('focus'));
		expect(fetcher).toHaveBeenCalledOnce();
		document.setVisibility('visible');
		await vi.advanceTimersByTimeAsync(0);
		expect(fetcher).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(120_000);
		expect(fetcher).toHaveBeenCalledTimes(3);
		stop();
	});

	it('espera a que una pestaña inicialmente oculta sea visible', async () => {
		const { start, fetcher, document } = setup({ hidden: true });
		const stop = start();
		await vi.advanceTimersByTimeAsync(240_000);
		expect(fetcher).not.toHaveBeenCalled();
		document.setVisibility('visible');
		await vi.advanceTimersByTimeAsync(0);
		expect(fetcher).toHaveBeenCalledOnce();
		stop();
	});

	it('evita peticiones solapadas hasta completar también la actualización de la vista', async () => {
		const { start, fetcher, invalidate, window } = setup();
		let finishFetch!: (value: Response) => void;
		let finishInvalidate!: () => void;
		fetcher.mockImplementation(() => new Promise((resolve) => (finishFetch = resolve)));
		invalidate.mockImplementation(() => new Promise((resolve) => (finishInvalidate = resolve)));
		const stop = start();
		await vi.advanceTimersByTimeAsync(240_000);
		window.dispatchEvent(new Event('focus'));
		expect(fetcher).toHaveBeenCalledOnce();
		finishFetch(response());
		await vi.advanceTimersByTimeAsync(120_000);
		expect(fetcher).toHaveBeenCalledOnce();
		finishInvalidate();
		await vi.advanceTimersByTimeAsync(0);
		window.dispatchEvent(new Event('focus'));
		expect(fetcher).toHaveBeenCalledTimes(2);
		stop();
	});

	it('aborta e ignora respuestas antiguas al salir o cambiar la conexión', async () => {
		const { start, fetcher, invalidate, states, window, document } = setup();
		let finishFetch!: (value: Response) => void;
		fetcher.mockImplementation(() => new Promise((resolve) => (finishFetch = resolve)));
		const stop = start();
		const signal = fetcher.mock.calls[0][1]?.signal;
		stop();
		expect(signal?.aborted).toBe(true);
		expect(vi.getTimerCount()).toBe(0);
		finishFetch(response());
		await vi.advanceTimersByTimeAsync(240_000);
		window.dispatchEvent(new Event('focus'));
		document.setVisibility('visible');
		expect(fetcher).toHaveBeenCalledOnce();
		expect(invalidate).not.toHaveBeenCalled();
		expect(states).toHaveLength(1);
	});

	it('actualiza los resultados correctos y muestra el error del otro proveedor', async () => {
		const { start, fetcher, invalidate, states } = setup();
		fetcher.mockResolvedValue(
			Response.json({
				changed: false,
				results: [
					{ provider: 'google_calendar', status: 'synced', conflicts: 1 },
					{ provider: 'microsoft_calendar', status: 'error', message: 'Vuelve a conectar Outlook.' }
				]
			})
		);
		const stop = start();
		await vi.advanceTimersByTimeAsync(0);
		expect(invalidate).not.toHaveBeenCalled();
		expect(states.at(-1)?.errors).toEqual(['Outlook / Microsoft 365: Vuelve a conectar Outlook.']);
		expect(states.at(-1)?.message).toContain('conflicto');
		stop();
	});

	it('mantiene los datos cargados si todos los proveedores están recientes u ocupados', async () => {
		const { start, fetcher, invalidate } = setup();
		fetcher.mockResolvedValue(
			Response.json({
				changed: false,
				results: [
					{ provider: 'google_calendar', status: 'recent' },
					{ provider: 'microsoft_calendar', status: 'busy' }
				]
			})
		);
		const stop = start();
		await vi.advanceTimersByTimeAsync(0);
		expect(invalidate).not.toHaveBeenCalled();
		stop();
	});

	it('conserva la vista si una sincronización no trae cambios ni conflictos', async () => {
		const { start, fetcher, invalidate } = setup();
		fetcher.mockResolvedValue(
			Response.json({
				changed: false,
				results: [{ provider: 'google_calendar', status: 'synced' }]
			})
		);
		const stop = start();
		await vi.advanceTimersByTimeAsync(0);
		expect(invalidate).not.toHaveBeenCalled();
		stop();
	});

	it('rechaza las respuestas que no indican si hubo cambios', async () => {
		const { start, fetcher, invalidate, states } = setup();
		fetcher.mockResolvedValue(
			Response.json({ results: [{ provider: 'google_calendar', status: 'synced' }] })
		);
		const stop = start();
		await vi.advanceTimersByTimeAsync(0);
		expect(invalidate).not.toHaveBeenCalled();
		expect(states.at(-1)?.errors[0]).toContain('Se reintentará');
		stop();
	});

	it('muestra fallos de actualización sin rechazos sin gestionar', async () => {
		const { start, invalidate, states } = setup();
		invalidate.mockRejectedValue(new Error('Refresh failed'));
		const stop = start();
		await vi.advanceTimersByTimeAsync(0);
		expect(states.at(-1)?.errors[0]).toContain('no se pudo actualizar esta vista');
		stop();
	});

	it('muestra fallos de red y vuelve a intentarlo a los dos minutos', async () => {
		const { start, fetcher, states } = setup();
		fetcher.mockRejectedValueOnce(new Error('Network failed'));
		const stop = start();
		await vi.advanceTimersByTimeAsync(0);
		expect(states.at(-1)?.errors[0]).toContain('Se reintentará');
		await vi.advanceTimersByTimeAsync(120_000);
		expect(fetcher).toHaveBeenCalledTimes(2);
		expect(states.at(-1)?.errors).toEqual([]);
		stop();
	});
	it('recupera la vista tras una respuesta perdida aunque el siguiente intento no traiga cambios', async () => {
		const { start, fetcher, invalidate } = setup();
		fetcher.mockRejectedValueOnce(new Error('Response lost')).mockResolvedValueOnce(
			Response.json({
				changed: false,
				results: [{ provider: 'google_calendar', status: 'recent' }]
			})
		);
		const stop = start();
		await vi.advanceTimersByTimeAsync(0);
		expect(invalidate).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(120_000);
		expect(invalidate).toHaveBeenCalledOnce();
		stop();
	});

	it.each([401, 403, 404])('detiene los reintentos tras un error HTTP %s', async (status) => {
		const { start, fetcher, states, window, document } = setup();
		fetcher.mockResolvedValue(Response.json({ error: 'Access denied' }, { status }));
		start();
		await vi.advanceTimersByTimeAsync(240_000);
		window.dispatchEvent(new Event('focus'));
		document.setVisibility('visible');
		expect(fetcher).toHaveBeenCalledOnce();
		expect(vi.getTimerCount()).toBe(0);
		expect(states.at(-1)?.message).toContain('detenida');
	});
});
