import { connect } from 'node:net';

export const MAX_SCANNED_UPLOAD_BYTES = 15 * 1024 * 1024;

export class AntivirusError extends Error {
	readonly status: number;
	constructor(status: number, message: string) {
		super(message);
		this.status = status;
		this.name = 'AntivirusError';
	}
}

export interface AntivirusConnection {
	host: string;
	port: number;
	timeoutMs: number;
}

function scannerConfiguration(): AntivirusConnection {
	const port = Number(process.env.CLAMAV_PORT || '3310');
	const timeoutMs = Number(process.env.CLAMAV_TIMEOUT_MS || '35000');
	if (
		!Number.isSafeInteger(port) ||
		port < 1 ||
		port > 65535 ||
		!Number.isSafeInteger(timeoutMs) ||
		timeoutMs < 1000 ||
		timeoutMs > 60_000
	)
		throw new AntivirusError(
			503,
			'El análisis de seguridad no está disponible. Inténtalo más tarde.'
		);
	return { host: process.env.CLAMAV_HOST || '127.0.0.1', port, timeoutMs };
}

export async function scanUploadBytes(
	bytes: Uint8Array,
	options = scannerConfiguration()
): Promise<void> {
	if (!bytes.byteLength || bytes.byteLength > MAX_SCANNED_UPLOAD_BYTES)
		throw new AntivirusError(413, 'El archivo supera el límite de análisis de seguridad.');
	await new Promise<void>((resolve, reject) => {
		const socket = connect({ host: options.host, port: options.port });
		let settled = false;
		let response = Buffer.alloc(0);
		let offset = 0;
		const finish = (error?: AntivirusError) => {
			if (settled) return;
			settled = true;
			clearTimeout(deadline);
			socket.destroy();
			if (error) reject(error);
			else resolve();
		};
		const unavailable = () =>
			finish(
				new AntivirusError(
					503,
					'No se pudo completar el análisis de seguridad. Inténtalo más tarde.'
				)
			);
		const deadline = setTimeout(unavailable, options.timeoutMs);
		function sendChunks() {
			while (!settled && offset < bytes.byteLength) {
				const end = Math.min(offset + 64 * 1024, bytes.byteLength);
				const header = Buffer.alloc(4);
				header.writeUInt32BE(end - offset);
				const frame = Buffer.concat([header, bytes.subarray(offset, end)]);
				offset = end;
				if (!socket.write(frame)) {
					socket.once('drain', sendChunks);
					return;
				}
			}
			if (!settled) socket.write(Buffer.alloc(4));
		}
		socket.once('connect', () => {
			socket.write('zINSTREAM\0');
			sendChunks();
		});
		socket.on('error', unavailable);
		socket.on('close', () => {
			if (!settled) unavailable();
		});
		socket.on('data', (chunk: Buffer) => {
			if (response.length + chunk.length > 4096) {
				unavailable();
				return;
			}
			response = Buffer.concat([response, chunk]);
			const terminator = response.indexOf(0);
			if (terminator < 0) return;
			if (terminator !== response.length - 1) {
				unavailable();
				return;
			}
			const verdict = response.subarray(0, terminator).toString('utf8');
			if (verdict === 'stream: OK') finish();
			else if (/^stream: .+ FOUND$/.test(verdict))
				finish(
					new AntivirusError(422, 'El archivo ha sido rechazado por el análisis de seguridad.')
				);
			else unavailable();
		});
	});
}
