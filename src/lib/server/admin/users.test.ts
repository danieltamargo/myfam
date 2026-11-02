import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

vi.mock('$env/dynamic/private', () => ({
	env: {
		SUPER_ADMIN_USER_IDS:
			'98000000-0000-4000-8000-000000000001,98000000-0000-4000-8000-000000000002'
	}
}));
import {
	getTargetUser,
	pageNumber,
	parseNewUser,
	publicUser,
	runAuditedOperation,
	setUserEnabled
} from './users';

const actor = '98000000-0000-4000-8000-000000000001';
const targetId = '98000000-0000-4000-8000-000000000003';
const client = {
	rpc: vi.fn(),
	auth: { admin: { updateUserById: vi.fn(), getUserById: vi.fn() } }
};

describe('administrative user commands', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		client.rpc.mockResolvedValue({ error: null });
		client.auth.admin.updateUserById.mockResolvedValue({ error: null });
	});
	it.each([null, '0', '-1', '1.2', '99999', 'invalid'])(
		'bounds malformed pagination %s',
		(value) => {
			expect(pageNumber(value)).toBe(1);
		}
	);
	it('retains valid bounded pages', () => {
		expect(pageNumber('9999')).toBe(9999);
	});
	it('normalizes input and preserves names with accents', () => {
		const form = new FormData();
		form.set('email', ' Person@Example.test ');
		form.set('name', ' Lucía Muñoz ');
		expect(parseNewUser(form)).toEqual({ email: 'person@example.test', name: 'Lucía Muñoz' });
		form.set('name', 'bad\nname');
		expect(() => parseNewUser(form)).toThrow();
		form.set('name', 'Valid');
		form.set('email', 'bad@example.test\nInjected');
		expect(() => parseNewUser(form)).toThrow();
	});
	it('never serializes metadata, identities or authentication tokens', () => {
		const result = publicUser({
			id: targetId,
			email: 'fixture@example.test',
			created_at: '2026-01-01',
			user_metadata: { secret: 'private' },
			identities: [],
			banned_until: '2999-01-01'
		} as never);
		expect(Object.keys(result).sort()).toEqual(
			['createdAt', 'disabled', 'email', 'id', 'lastSignIn', 'superAdmin'].sort()
		);
		expect(result.disabled).toBe(true);
	});
	it.each([actor, '98000000-0000-4000-8000-000000000002'])(
		'blocks disabling superadministrator %s before auditing or mutation',
		async (id) => {
			await expect(
				setUserEnabled(client as never, actor, { id } as User, false)
			).rejects.toMatchObject({ status: 400 });
			expect(client.rpc).not.toHaveBeenCalled();
			expect(client.auth.admin.updateUserById).not.toHaveBeenCalled();
		}
	);
	it('records pending and success around an Auth ban', async () => {
		await setUserEnabled(client as never, actor, { id: targetId } as User, false);
		expect(client.auth.admin.updateUserById).toHaveBeenCalledWith(targetId, {
			ban_duration: '876000h'
		});
		expect(client.rpc.mock.calls.map((call) => call[1].p_status)).toEqual(['pending', 'succeeded']);
		expect(client.rpc.mock.calls[0][1].p_operation).toBe(client.rpc.mock.calls[1][1].p_operation);
		expect(client.rpc.mock.invocationCallOrder[0]).toBeLessThan(
			client.auth.admin.updateUserById.mock.invocationCallOrder[0]
		);
	});
	it('enables an ordinary user with the supported Auth unban value', async () => {
		await setUserEnabled(client as never, actor, { id: targetId } as User, true);
		expect(client.auth.admin.updateUserById).toHaveBeenCalledWith(targetId, {
			ban_duration: 'none'
		});
	});
	it('does not mutate when initial audit fails', async () => {
		client.rpc.mockResolvedValue({ error: { code: 'failure' } });
		await expect(
			setUserEnabled(client as never, actor, { id: targetId } as User, false)
		).rejects.toMatchObject({ status: 503 });
		expect(client.auth.admin.updateUserById).not.toHaveBeenCalled();
	});
	it('records failure explicitly without persisting provider errors', async () => {
		client.auth.admin.updateUserById.mockResolvedValue({ error: { message: 'provider-secret' } });
		await expect(
			setUserEnabled(client as never, actor, { id: targetId } as User, false)
		).rejects.toMatchObject({ status: 503 });
		expect(client.rpc.mock.calls.map((call) => call[1].p_status)).toEqual(['pending', 'failed']);
		expect(JSON.stringify(client.rpc.mock.calls)).not.toContain('provider-secret');
	});
	it('reports a final audit failure as an uncertain operation', async () => {
		client.rpc
			.mockResolvedValueOnce({ error: null })
			.mockResolvedValueOnce({ error: { code: 'failure' } });
		await expect(
			runAuditedOperation(client as never, actor, targetId, 'user_enabled', async () => 'ok')
		).rejects.toMatchObject({
			status: 503,
			body: { message: expect.stringContaining('puede haberse realizado') }
		});
	});
	it('rejects malformed target IDs before calling Auth', async () => {
		await expect(getTargetUser(client as never, 'invalid')).rejects.toMatchObject({ status: 400 });
		expect(client.auth.admin.getUserById).not.toHaveBeenCalled();
	});
});
