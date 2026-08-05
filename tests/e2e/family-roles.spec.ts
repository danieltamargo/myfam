import { createHmac, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import type { Database } from '../../src/lib/types/database';

interface LocalSupabaseStatus {
	ANON_KEY: string;
	API_URL: string;
	JWT_SECRET: string;
	SECRET_KEY: string;
	SERVICE_ROLE_KEY: string;
}

function getLocalSupabaseStatus(): LocalSupabaseStatus {
	const executable = process.platform === 'win32' ? 'powershell.exe' : 'npx';
	const args =
		process.platform === 'win32'
			? ['-NoProfile', '-Command', 'npx supabase status -o json']
			: ['supabase', 'status', '-o', 'json'];
	return JSON.parse(
		execFileSync(executable, args, {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		})
	) as LocalSupabaseStatus;
}

function encode(value: unknown): string {
	return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function createUserToken(secret: string, userId: string, email: string, aal: 'aal1' | 'aal2') {
	const issuedAt = Math.floor(Date.now() / 1000);
	const header = encode({ alg: 'HS256', typ: 'JWT' });
	const payload = encode({
		sub: userId,
		email,
		role: 'authenticated',
		aal,
		session_id: randomUUID(),
		iat: issuedAt,
		exp: issuedAt + 600
	});
	const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
	return `${header}.${payload}.${signature}`;
}

function createUserClient(
	status: LocalSupabaseStatus,
	userId: string,
	email: string,
	aal: 'aal1' | 'aal2'
): SupabaseClient<Database> {
	const token = createUserToken(status.JWT_SECRET, userId, email, aal);
	return createClient<Database>(status.API_URL, status.ANON_KEY, {
		global: { headers: { Authorization: `Bearer ${token}` } },
		auth: { autoRefreshToken: false, persistSession: false }
	});
}

test('family ownership operations are atomic, audited, and AAL2-gated', async () => {
	const status = getLocalSupabaseStatus();
	const admin = createClient<Database>(status.API_URL, status.SECRET_KEY, {
		auth: { autoRefreshToken: false, persistSession: false }
	});
	const suffix = randomUUID();
	const aliceEmail = `alice-${suffix}@example.test`;
	const bobEmail = `bob-${suffix}@example.test`;
	let aliceId: string | undefined;
	let bobId: string | undefined;
	let familyId: string | undefined;

	try {
		const { data: alice, error: aliceError } = await admin.auth.admin.createUser({
			email: aliceEmail,
			email_confirm: true,
			user_metadata: { name: 'Alice E2E' }
		});
		const { data: bob, error: bobError } = await admin.auth.admin.createUser({
			email: bobEmail,
			email_confirm: true,
			user_metadata: { name: 'Bob E2E' }
		});
		expect(aliceError).toBeNull();
		expect(bobError).toBeNull();
		aliceId = alice.user?.id;
		bobId = bob.user?.id;
		expect(aliceId).toBeTruthy();
		expect(bobId).toBeTruthy();

		const aliceAal1 = createUserClient(status, aliceId!, aliceEmail, 'aal1');
		const aliceAal2 = createUserClient(status, aliceId!, aliceEmail, 'aal2');
		const bobAal1 = createUserClient(status, bobId!, bobEmail, 'aal1');
		const bobAal2 = createUserClient(status, bobId!, bobEmail, 'aal2');

		const { error: directInsertError } = await aliceAal1.from('families').insert({
			name: 'No debe crearse',
			created_by: aliceId
		});
		expect(directInsertError?.code).toBe('42501');

		const { data: createdFamilyId, error: createError } = await aliceAal1.rpc('create_family', {
			p_name: 'Familia E2E'
		});
		expect(createError).toBeNull();
		familyId = createdFamilyId ?? undefined;
		expect(familyId).toBeTruthy();

		const [{ count: ownerCount }, { count: categoryCount }] = await Promise.all([
			admin
				.from('family_members')
				.select('*', { count: 'exact', head: true })
				.eq('family_id', familyId!)
				.eq('role', 'owner'),
			admin
				.from('gift_event_categories')
				.select('*', { count: 'exact', head: true })
				.eq('family_id', familyId!)
		]);
		expect(ownerCount).toBe(1);
		expect(categoryCount).toBe(5);

		const { data: invitationId, error: invitationError } = await aliceAal1.rpc(
			'invite_family_member',
			{ p_family_id: familyId!, p_email: bobEmail }
		);
		expect(invitationError).toBeNull();
		expect(invitationId).toBeTruthy();

		const { error: acceptError } = await bobAal1.rpc('accept_family_invitation', {
			p_invitation_id: invitationId!
		});
		expect(acceptError).toBeNull();

		const { error: aal1TransferError } = await aliceAal1.rpc('transfer_family_ownership', {
			p_family_id: familyId!,
			p_target_user_id: bobId!
		});
		expect(aal1TransferError?.code).toBe('42501');

		const { error: transferError } = await aliceAal2.rpc('transfer_family_ownership', {
			p_family_id: familyId!,
			p_target_user_id: bobId!
		});
		expect(transferError).toBeNull();

		const { data: roles } = await admin
			.from('family_members')
			.select('user_id, role')
			.eq('family_id', familyId!);
		expect(roles).toEqual(
			expect.arrayContaining([
				{ user_id: aliceId, role: 'admin' },
				{ user_id: bobId, role: 'owner' }
			])
		);

		const { error: removeOwnerError } = await aliceAal2.rpc('remove_family_member', {
			p_family_id: familyId!,
			p_target_user_id: bobId!
		});
		expect(removeOwnerError?.code).toBe('42501');

		const { error: removeAdminError } = await bobAal1.rpc('remove_family_member', {
			p_family_id: familyId!,
			p_target_user_id: aliceId!
		});
		expect(removeAdminError).toBeNull();

		const { data: auditBeforeDelete } = await admin
			.from('audit_logs')
			.select('action')
			.eq('family_id', familyId!);
		expect(auditBeforeDelete?.map(({ action }) => action)).toEqual(
			expect.arrayContaining([
				'family.created',
				'family.invitation_accepted',
				'family.ownership_transferred',
				'family.member_removed'
			])
		);

		const { error: aal1DeleteError } = await bobAal1.rpc('delete_family', {
			p_family_id: familyId!
		});
		expect(aal1DeleteError?.code).toBe('42501');

		const { error: deleteError } = await bobAal2.rpc('delete_family', {
			p_family_id: familyId!
		});
		expect(deleteError).toBeNull();

		const [{ count: familyCount }, { data: deletionAudit }] = await Promise.all([
			admin.from('families').select('*', { count: 'exact', head: true }).eq('id', familyId!),
			admin
				.from('audit_logs')
				.select('action, family_id, resource_id')
				.eq('action', 'family.deleted')
				.eq('resource_id', familyId!)
				.maybeSingle()
		]);
		expect(familyCount).toBe(0);
		expect(deletionAudit).toMatchObject({
			action: 'family.deleted',
			family_id: null,
			resource_id: familyId
		});
		familyId = undefined;
	} finally {
		if (familyId) {
			await admin.from('families').delete().eq('id', familyId);
		}
		if (aliceId) await admin.auth.admin.deleteUser(aliceId);
		if (bobId) await admin.auth.admin.deleteUser(bobId);
	}
});
