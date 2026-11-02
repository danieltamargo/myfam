import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';

const mocks = vi.hoisted(() => ({
	scan: vi.fn(),
	upload: vi.fn(),
	rpc: vi.fn(),
	serviceFetch: null as typeof fetch | null,
	env: {
		SUPABASE_URL: 'https://storage.example.test',
		SUPABASE_SERVICE_ROLE_KEY: 'test-server-key'
	}
}));
vi.mock('$env/dynamic/private', () => ({ env: mocks.env }));
vi.mock('@supabase/supabase-js', () => ({
	createClient: (_url: string, _key: string, options: { global: { fetch: typeof fetch } }) => {
		mocks.serviceFetch = options.global.fetch;
		return { storage: { from: () => ({ upload: mocks.upload }) }, rpc: mocks.rpc };
	}
}));
vi.mock('./antivirus', async (original) => ({
	...(await original<typeof import('./antivirus')>()),
	scanUploadBytes: mocks.scan
}));
import { configuredStorageServiceKey, uploadScannedObject } from './upload-storage';
import { AntivirusError } from './antivirus';

const user = '10000000-0000-4000-8000-000000000001';
const family = '10000000-1000-4000-8000-000000000001';
const path = `${family}/${user}/10000000-2000-4000-8000-000000000001.png`;
const scope = { bucket: 'gift-images' as const, familyId: family, ownerId: user };
const file = () =>
	new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1])], 'image.png', {
		type: 'image/png'
	});
function client(row: () => unknown = () => ({ user_id: user })) {
	const query = {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		maybeSingle: vi.fn(async () => ({ data: row(), error: null }))
	};
	return {
		auth: { getUser: vi.fn(async () => ({ data: { user: { id: user } }, error: null })) },
		from: vi.fn(() => query)
	} as unknown as SupabaseClient<Database>;
}

beforeEach(() => {
	mocks.scan.mockReset().mockResolvedValue(undefined);
	mocks.upload.mockReset().mockResolvedValue({ error: null });
	mocks.rpc.mockReset().mockResolvedValue({ data: true, error: null });
});
describe('scanned storage uploads', () => {
	it('diagnoses a hidden quota rejection without exposing database errors', async () => {
		mocks.upload.mockResolvedValueOnce({ error: { message: 'Database error' } });
		mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
		await expect(uploadScannedObject(client(), scope, path, file())).rejects.toMatchObject({
			status: 413
		});
		expect(mocks.rpc).toHaveBeenCalledWith('family_storage_has_capacity', {
			p_bucket_id: scope.bucket,
			p_name: path,
			p_size_bytes: file().size
		});
	});
	it('preserves a generic failure when the quota diagnosis is unavailable', async () => {
		mocks.upload.mockResolvedValueOnce({ error: { message: 'Internal database detail' } });
		mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Unavailable' } });
		await expect(uploadScannedObject(client(), scope, path, file())).rejects.toMatchObject({
			status: 500,
			message: 'No se pudo guardar el archivo analizado.'
		});
	});
	it('returns a safe family quota error and releases the upload slot', async () => {
		mocks.upload.mockResolvedValueOnce({
			error: { message: 'FAMILY_STORAGE_QUOTA_EXCEEDED' }
		});
		await expect(uploadScannedObject(client(), scope, path, file())).rejects.toMatchObject({
			status: 413,
			message:
				'La familia ha alcanzado su límite de almacenamiento. Elimina archivos antes de subir más.'
		});
		await uploadScannedObject(client(), scope, path, file());
		expect(mocks.upload).toHaveBeenCalledTimes(2);
	});
	it('aborts stalled Storage requests after a bounded deadline and releases the upload slot', async () => {
		const controller = new AbortController();
		const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
		const fetchRequest = vi.fn(
			(_input: unknown, init?: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener(
						'abort',
						() => reject(new DOMException('Timed out', 'AbortError')),
						{ once: true }
					);
				})
		);
		vi.stubGlobal('fetch', fetchRequest);
		try {
			mocks.upload.mockImplementationOnce(() =>
				mocks.serviceFetch!('https://storage.example.test/upload')
			);
			const pending = expect(
				uploadScannedObject(client(), scope, path, file())
			).rejects.toMatchObject({ status: 503 });
			await vi.waitFor(() => expect(fetchRequest).toHaveBeenCalledTimes(1));
			expect(timeout).toHaveBeenCalledWith(30_000);
			controller.abort();
			await pending;
			await uploadScannedObject(client(), scope, path, file());
			expect(mocks.upload).toHaveBeenCalledTimes(2);
		} finally {
			timeout.mockRestore();
			vi.unstubAllGlobals();
		}
	});
	it.each([
		['viewer', false, user],
		['manager', true, user],
		['contributor', false, family]
	])('blocks expense permission failure: %s archived=%s', async (role, archived, author) => {
		const db = client();
		vi.mocked(db.from).mockImplementation((table: string) => {
			const data =
				table === 'expense_collection_members'
					? { role }
					: table === 'expense_collections'
						? { id: family, archived_at: archived ? '2026-10-31' : null }
						: { created_by: author };
			return {
				select: vi.fn().mockReturnThis(),
				eq: vi.fn().mockReturnThis(),
				maybeSingle: vi.fn(async () => ({ data, error: null }))
			} as never;
		});
		await expect(
			uploadScannedObject(
				db,
				{ bucket: 'expense-receipts', collectionId: family, ownerId: user, expenseId: family },
				path,
				file()
			)
		).rejects.toMatchObject({ status: 403 });
		expect(mocks.scan).not.toHaveBeenCalled();
	});
	it('requires a matching pending document reservation before scanning', async () => {
		const documentPath = path.replace('.png', '');
		const db = client(() => ({
			family_id: family,
			status: 'active',
			size_bytes: file().size,
			mime_type: 'image/png'
		}));
		await expect(
			uploadScannedObject(db, { bucket: 'family-documents' }, documentPath, file())
		).rejects.toMatchObject({ status: 403 });
		expect(mocks.scan).not.toHaveBeenCalled();
	});
	it('blocks a received gift before scanning', async () => {
		const db = client(() => ({ user_id: user, status: 'fulfilled' }));
		await expect(
			uploadScannedObject(db, { ...scope, itemId: family }, path, file())
		).rejects.toMatchObject({ status: 403 });
		expect(mocks.scan).not.toHaveBeenCalled();
	});
	it('uploads the same Buffer that was scanned after rechecking membership', async () => {
		const db = client();
		await uploadScannedObject(db, scope, path, file());
		expect(db.auth.getUser).toHaveBeenCalledTimes(2);
		expect(mocks.upload).toHaveBeenCalledWith(path, mocks.scan.mock.calls[0][0], {
			contentType: 'image/png',
			upsert: false
		});
		expect(mocks.upload.mock.calls[0][1]).toBe(mocks.scan.mock.calls[0][0]);
	});
	it.each([422, 503])('never uploads when antivirus rejects with %s', async (status) => {
		mocks.scan.mockRejectedValue(new AntivirusError(status, 'Rejected'));
		await expect(uploadScannedObject(client(), scope, path, file())).rejects.toMatchObject({
			status
		});
		expect(mocks.upload).not.toHaveBeenCalled();
	});
	it('blocks another user path before scanning', async () => {
		await expect(
			uploadScannedObject(client(), scope, path.replace(user, family), file())
		).rejects.toMatchObject({ status: 403 });
		expect(mocks.scan).not.toHaveBeenCalled();
	});
	it('does not upload after access is revoked during the scan', async () => {
		let allowed = true;
		mocks.scan.mockImplementation(async () => {
			allowed = false;
		});
		await expect(
			uploadScannedObject(
				client(() => (allowed ? { user_id: user } : null)),
				scope,
				path,
				file()
			)
		).rejects.toMatchObject({ status: 403 });
		expect(mocks.upload).not.toHaveBeenCalled();
	});
	it('rejects mismatched bytes before contacting the scanner', async () => {
		await expect(
			uploadScannedObject(
				client(),
				scope,
				path,
				new File(['fake'], 'fake.png', { type: 'image/png' })
			)
		).rejects.toMatchObject({ status: 415 });
		expect(mocks.scan).not.toHaveBeenCalled();
	});
	it('serializes the upload pipeline and releases it after failure', async () => {
		let release!: () => void;
		mocks.scan.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					release = resolve;
				})
		);
		const first = uploadScannedObject(client(), scope, path, file());
		await vi.waitFor(() => expect(mocks.scan).toHaveBeenCalledTimes(1));
		await expect(uploadScannedObject(client(), scope, path, file())).rejects.toMatchObject({
			status: 503
		});
		release();
		await first;
		await uploadScannedObject(client(), scope, path, file());
		expect(mocks.upload).toHaveBeenCalledTimes(2);
	});
	it('prefers named server secrets and fails closed on malformed explicit configuration', () => {
		expect(
			configuredStorageServiceKey({
				SUPABASE_SECRET_KEYS: '{"upload":"named"}',
				SUPABASE_SECRET_KEY_NAME: 'upload',
				SUPABASE_SECRET_KEY: 'singular'
			})
		).toBe('named');
		expect(
			configuredStorageServiceKey({
				SUPABASE_SECRET_KEY: 'singular',
				SUPABASE_SERVICE_ROLE_KEY: 'legacy'
			})
		).toBe('singular');
		expect(() =>
			configuredStorageServiceKey({
				SUPABASE_SECRET_KEYS: '{}',
				SUPABASE_SERVICE_ROLE_KEY: 'legacy'
			})
		).toThrow();
	});
});
