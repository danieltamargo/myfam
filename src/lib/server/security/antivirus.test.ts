import { createServer, type Socket } from 'node:net';
import { once } from 'node:events';
import { describe, expect, it } from 'vitest';
import { scanUploadBytes } from './antivirus';

async function scanner(
	reply: (socket: Socket, input: Buffer) => void,
	test: (port: number) => Promise<void>
) {
	const sockets = new Set<Socket>();
	const server = createServer((socket) => {
		sockets.add(socket);
		socket.on('error', () => {});
		let input = Buffer.alloc(0);
		socket.on('data', (chunk) => {
			input = Buffer.concat([input, chunk]);
			reply(socket, input);
		});
	});
	server.listen(0, '127.0.0.1');
	await once(server, 'listening');
	const address = server.address();
	try {
		await test(typeof address === 'object' && address ? address.port : 0);
	} finally {
		for (const socket of sockets) socket.destroy();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
}

describe('ClamAV INSTREAM boundary', () => {
	it('frames the exact bytes and accepts only the complete clean verdict', async () => {
		const bytes = Buffer.alloc(140_000, 7);
		await scanner(
			(socket, input) => {
				if (input.length < bytes.length + 10 + 16) return;
				expect(input.subarray(0, 10).toString()).toBe('zINSTREAM\0');
				let offset = 10;
				const chunks = [];
				while (input.readUInt32BE(offset)) {
					const length = input.readUInt32BE(offset);
					offset += 4;
					chunks.push(input.subarray(offset, offset + length));
					offset += length;
				}
				expect(Buffer.concat(chunks)).toEqual(bytes);
				socket.write('stream: ');
				socket.end('OK\0');
			},
			async (port) => scanUploadBytes(bytes, { host: '127.0.0.1', port, timeoutMs: 1000 })
		);
	});
	it.each([
		['stream: Eicar-Test-Signature FOUND\0', 422],
		['stream: Heuristics.Encrypted.Zip FOUND\0', 422],
		['INSTREAM size limit exceeded. ERROR\0', 503],
		['stream: OK', 503],
		['stream: OK\0unexpected', 503]
	])('rejects unsafe or incomplete verdict %s', async (reply, status) => {
		await scanner(
			(socket) => socket.end(reply),
			async (port) => {
				await expect(
					scanUploadBytes(Buffer.from('x'), { host: '127.0.0.1', port, timeoutMs: 500 })
				).rejects.toMatchObject({ status });
			}
		);
	});
	it('fails closed on a silent scanner and oversized input', async () => {
		await scanner(
			() => {},
			async (port) => {
				await expect(
					scanUploadBytes(Buffer.from('x'), { host: '127.0.0.1', port, timeoutMs: 30 })
				).rejects.toMatchObject({ status: 503 });
			}
		);
		await expect(scanUploadBytes(Buffer.alloc(16 * 1024 * 1024))).rejects.toMatchObject({
			status: 413
		});
	});
});
