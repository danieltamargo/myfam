import { createHmac, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import { createExpenseCsv } from '../../src/lib/server/expenses/csv';
import type { Database } from '../../src/lib/types/database';

interface LocalSupabaseStatus {
	ANON_KEY: string;
	API_URL: string;
	JWT_SECRET: string;
	SECRET_KEY: string;
}

function getLocalSupabaseStatus(): LocalSupabaseStatus {
	const executable = process.platform === 'win32' ? 'powershell.exe' : 'npx';
	const args =
		process.platform === 'win32'
			? ['-NoProfile', '-Command', 'npx supabase status -o json']
			: ['supabase', 'status', '-o', 'json'];
	return JSON.parse(
		execFileSync(executable, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
	) as LocalSupabaseStatus;
}

function encode(value: unknown): string {
	return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function createUserToken(
	secret: string,
	userId: string,
	email: string,
	aal: 'aal1' | 'aal2'
): string {
	const issuedAt = Math.floor(Date.now() / 1000);
	const header = encode({ alg: 'HS256', typ: 'JWT' });
	const payload = encode({
		sub: userId,
		email,
		role: 'authenticated',
		aal,
		session_id: randomUUID(),
		iat: issuedAt,
		exp: issuedAt + 900
	});
	const signed = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
	return `${header}.${payload}.${signed}`;
}

function createUserClient(
	status: LocalSupabaseStatus,
	userId: string,
	email: string
): SupabaseClient<Database> {
	return createClient<Database>(status.API_URL, status.ANON_KEY, {
		global: {
			headers: {
				Authorization: `Bearer ${createUserToken(status.JWT_SECRET, userId, email, 'aal1')}`
			}
		},
		auth: { autoRefreshToken: false, persistSession: false }
	});
}

function decodeBase32(value: string): Buffer {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
	let bits = '';
	for (const character of value.toUpperCase().replaceAll('=', '')) {
		const index = alphabet.indexOf(character);
		if (index < 0) throw new Error('Invalid TOTP secret');
		bits += index.toString(2).padStart(5, '0');
	}
	const bytes: number[] = [];
	for (let index = 0; index + 8 <= bits.length; index += 8) {
		bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
	}
	return Buffer.from(bytes);
}

function currentTotp(secret: string): string {
	const counter = Buffer.alloc(8);
	counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
	const digest = createHmac('sha1', decodeBase32(secret)).update(counter).digest();
	const offset = digest[digest.length - 1]! & 0x0f;
	const binary =
		((digest[offset]! & 0x7f) << 24) |
		((digest[offset + 1]! & 0xff) << 16) |
		((digest[offset + 2]! & 0xff) << 8) |
		(digest[offset + 3]! & 0xff);
	return String(binary % 1_000_000).padStart(6, '0');
}

async function acceptFamilyInvite(
	owner: SupabaseClient<Database>,
	member: SupabaseClient<Database>,
	familyId: string,
	email: string
): Promise<void> {
	const invitation = await owner.rpc('invite_family_member', {
		p_family_id: familyId,
		p_email: email
	});
	expect(invitation.error).toBeNull();
	expect(invitation.data).toBeTruthy();
	expect(
		(await member.rpc('accept_family_invitation', { p_invitation_id: invitation.data! })).error
	).toBeNull();
}

test('cierra la matriz operativa con tres usuarios, dos familias y dos colecciones privadas', async () => {
	test.setTimeout(120_000);
	const status = getLocalSupabaseStatus();
	const admin = createClient<Database>(status.API_URL, status.SECRET_KEY, {
		auth: { autoRefreshToken: false, persistSession: false }
	});
	const suffix = randomUUID();
	const password = 'ClosureE2E-2026!';
	const emails = {
		alice: `closure-alice-${suffix}@example.test`,
		bob: `closure-bob-${suffix}@example.test`,
		carol: `closure-carol-${suffix}@example.test`
	};
	const createdUserIds: string[] = [];

	try {
		const createdUsers = await Promise.all(
			Object.entries(emails).map(([name, email]) =>
				admin.auth.admin.createUser({
					email,
					password,
					email_confirm: true,
					user_metadata: { name: `Closure ${name}` }
				})
			)
		);
		for (const result of createdUsers) {
			expect(result.error).toBeNull();
			expect(result.data.user?.id).toBeTruthy();
			createdUserIds.push(result.data.user!.id);
		}

		const [aliceId, bobId, carolId] = createdUserIds as [string, string, string];
		const alice = createUserClient(status, aliceId, emails.alice);
		const bob = createUserClient(status, bobId, emails.bob);
		const carol = createUserClient(status, carolId, emails.carol);

		const familyA = await alice.rpc('create_family', { p_name: `Familia A ${suffix}` });
		const familyB = await bob.rpc('create_family', { p_name: `Familia B ${suffix}` });
		expect(familyA.error).toBeNull();
		expect(familyB.error).toBeNull();
		expect(familyA.data).toBeTruthy();
		expect(familyB.data).toBeTruthy();

		await acceptFamilyInvite(alice, bob, familyA.data!, emails.bob);
		await acceptFamilyInvite(alice, carol, familyA.data!, emails.carol);
		await acceptFamilyInvite(bob, carol, familyB.data!, emails.carol);

		const collectionA = await alice.rpc('create_expense_collection', {
			p_family_id: familyA.data!,
			p_name: `Privada Alice ${suffix}`,
			p_currency: 'EUR'
		});
		const collectionB = await bob.rpc('create_expense_collection', {
			p_family_id: familyA.data!,
			p_name: `Privada Bob ${suffix}`,
			p_currency: 'EUR'
		});
		expect(collectionA.error).toBeNull();
		expect(collectionB.error).toBeNull();

		for (const [owner, collectionId, role] of [
			[alice, collectionA.data!, 'viewer'],
			[bob, collectionB.data!, 'contributor']
		] as const) {
			expect(
				(
					await owner.rpc('invite_expense_collection_member', {
						p_collection_id: collectionId,
						p_user_id: carolId,
						p_role: role
					})
				).error
			).toBeNull();
			expect(
				(
					await carol.rpc('accept_expense_collection_invitation', {
						p_collection_id: collectionId
					})
				).error
			).toBeNull();
		}

		const [aliceCollections, bobCollections, carolCollections] = await Promise.all([
			alice.from('expense_collections').select('id').eq('family_id', familyA.data!),
			bob.from('expense_collections').select('id').eq('family_id', familyA.data!),
			carol.from('expense_collections').select('id').eq('family_id', familyA.data!)
		]);
		expect(aliceCollections.data?.map(({ id }) => id)).toEqual([collectionA.data!]);
		expect(bobCollections.data?.map(({ id }) => id)).toEqual([collectionB.data!]);
		expect(new Set(carolCollections.data?.map(({ id }) => id))).toEqual(
			new Set([collectionA.data!, collectionB.data!])
		);

		const category = await alice
			.from('expense_categories')
			.select('id')
			.eq('collection_id', collectionA.data!)
			.limit(1)
			.single();
		expect(category.error).toBeNull();
		expect(
			(
				await alice.from('expenses').insert({
					collection_id: collectionA.data!,
					category_id: category.data!.id,
					created_by: aliceId,
					paid_by: aliceId,
					amount: 42.5,
					description: 'Compra para exportar',
					occurred_on: '2026-08-07'
				})
			).error
		).toBeNull();

		const exportedExpenses = await alice
			.from('expenses')
			.select('occurred_on, description, amount, notes, receipt_path')
			.eq('collection_id', collectionA.data!);
		expect(exportedExpenses.error).toBeNull();
		const exportedCsv = createExpenseCsv(
			(exportedExpenses.data ?? []).map((expense) => ({
				occurredOn: expense.occurred_on,
				description: expense.description,
				amount: Number(expense.amount),
				currency: 'EUR',
				category: 'Alimentación',
				payer: 'Closure alice',
				notes: expense.notes ?? '',
				hasReceipt: Boolean(expense.receipt_path)
			}))
		);
		expect(exportedCsv).toContain('Compra para exportar');
		expect(exportedCsv).toContain('42.50');

		const carolAuth = createClient<Database>(status.API_URL, status.ANON_KEY, {
			auth: { autoRefreshToken: false, persistSession: false }
		});
		const signedInCarol = await carolAuth.auth.signInWithPassword({
			email: emails.carol,
			password
		});
		expect(signedInCarol.error).toBeNull();
		expect(signedInCarol.data.session?.access_token).toBeTruthy();

		const aal1Response = await fetch(`${status.API_URL}/functions/v1/delete-account`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${signedInCarol.data.session!.access_token}`,
				apikey: status.ANON_KEY,
				'Content-Type': 'application/json'
			}
		});
		expect(aal1Response.status).toBe(403);

		const enrolled = await carolAuth.auth.mfa.enroll({
			factorType: 'totp',
			friendlyName: `Closure ${suffix}`
		});
		expect(enrolled.error).toBeNull();
		expect(enrolled.data?.id).toBeTruthy();
		const verified = await carolAuth.auth.mfa.challengeAndVerify({
			factorId: enrolled.data!.id,
			code: currentTotp(enrolled.data!.totp.secret)
		});
		expect(verified.error).toBeNull();
		expect(verified.data?.access_token).toBeTruthy();

		const aal2Response = await fetch(`${status.API_URL}/functions/v1/delete-account`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${verified.data!.access_token}`,
				apikey: status.ANON_KEY,
				'Content-Type': 'application/json'
			}
		});
		expect(aal2Response.status).toBe(200);
		expect((await admin.auth.admin.getUserById(carolId)).data.user).toBeNull();
	} finally {
		for (const userId of createdUserIds) await admin.auth.admin.deleteUser(userId);
	}
});
