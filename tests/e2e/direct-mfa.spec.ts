import { execFileSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import type { Database } from '../../src/lib/types/database';

function currentTotp(secret: string): string {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
	let bits = '';
	for (const character of secret.toUpperCase().replaceAll('=', '')) {
		const index = alphabet.indexOf(character);
		if (index < 0) throw new Error('Invalid TOTP secret');
		bits += index.toString(2).padStart(5, '0');
	}
	const bytes: number[] = [];
	for (let index = 0; index + 8 <= bits.length; index += 8) {
		bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
	}
	const counter = Buffer.alloc(8);
	counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
	const digest = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
	const offset = digest[digest.length - 1] & 0x0f;
	return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

test('GoTrue exige AAL2 en datos, RPC y Storage solo después de verificar un factor', async () => {
	const status = JSON.parse(
		execFileSync('supabase', ['status', '-o', 'json'], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		})
	) as { API_URL: string; ANON_KEY: string; SECRET_KEY?: string; SERVICE_ROLE_KEY: string };
	if (!['127.0.0.1', 'localhost'].includes(new URL(status.API_URL).hostname)) {
		throw new Error('La prueba MFA requiere Supabase local.');
	}
	const authOptions = { persistSession: false, autoRefreshToken: false };
	const admin = createClient<Database>(
		status.API_URL,
		status.SECRET_KEY ?? status.SERVICE_ROLE_KEY,
		{ auth: authOptions }
	);
	const owner = createClient<Database>(status.API_URL, status.ANON_KEY, { auth: authOptions });
	const outsider = createClient<Database>(status.API_URL, status.ANON_KEY, { auth: authOptions });
	const userIds: string[] = [];
	const familyIds: string[] = [];
	let imagePath: string | undefined;
	try {
		for (const client of [owner, outsider]) {
			const email = `direct-mfa-${randomUUID()}@example.test`;
			const password = `Mfa-${randomUUID()}aA1!`;
			const created = await admin.auth.admin.createUser({
				email,
				password,
				email_confirm: true,
				user_metadata: { name: 'Prueba MFA directa' }
			});
			if (created.data.user) userIds.push(created.data.user.id);
			expect(created.error === null).toBe(true);
			const signedIn = await client.auth.signInWithPassword({ email, password });
			expect(signedIn.error === null).toBe(true);
			expect(Boolean(signedIn.data.session)).toBe(true);
			const family = await client.rpc('create_family', { p_name: 'Familia MFA directa' });
			if (family.data) familyIds.push(family.data);
			expect(family.error === null).toBe(true);
		}
		const [familyId, outsiderFamilyId] = familyIds;
		const session = await owner.auth.getSession();
		expect(session.error === null).toBe(true);
		const aal1 = createClient<Database>(status.API_URL, status.ANON_KEY, {
			auth: authOptions,
			global: { headers: { Authorization: `Bearer ${session.data.session!.access_token}` } }
		});
		expect((await owner.auth.mfa.getAuthenticatorAssuranceLevel()).data?.currentLevel).toBe('aal1');
		imagePath = `${familyId}/${userIds[0]}/${randomUUID()}.png`;
		const image = Buffer.from(
			'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=',
			'base64'
		);
		expect(
			(
				await admin.storage
					.from('gift-images')
					.upload(imagePath, image, { contentType: 'image/png' })
			).error === null
		).toBe(true);
		expect(
			(
				await admin.from('gift_items').insert({
					family_id: familyId,
					owner_id: userIds[0],
					name: 'Imagen MFA',
					image_url: imagePath
				})
			).error === null
		).toBe(true);
		const beforeEnrollment = await aal1.storage.from('gift-images').createSignedUrl(imagePath, 60);
		expect(beforeEnrollment.error === null).toBe(true);
		expect(Boolean(beforeEnrollment.data?.signedUrl)).toBe(true);

		const enrolled = await owner.auth.mfa.enroll({
			factorType: 'totp',
			friendlyName: 'MFA directa E2E'
		});
		expect(enrolled.error === null).toBe(true);
		const factors = await owner.auth.mfa.listFactors();
		expect(factors.error === null).toBe(true);
		expect(factors.data?.all.find((factor) => factor.id === enrolled.data!.id)?.status).toBe(
			'unverified'
		);
		for (const read of await Promise.all([
			aal1.from('families').select('id').eq('id', familyId),
			aal1.from('public_profiles').select('id').eq('id', userIds[0])
		])) {
			expect(read.error === null).toBe(true);
			expect(read.data?.length).toBe(1);
		}
		expect((await aal1.rpc('get_my_profile')).error === null).toBe(true);

		const verified = await owner.auth.mfa.challengeAndVerify({
			factorId: enrolled.data!.id,
			code: currentTotp(enrolled.data!.totp.secret)
		});
		expect(verified.error === null).toBe(true);
		expect((await owner.auth.mfa.getAuthenticatorAssuranceLevel()).data?.currentLevel).toBe('aal2');
		for (const blocked of await Promise.all([
			aal1.from('families').select('id').eq('id', familyId),
			aal1.from('public_profiles').select('id').eq('id', userIds[0])
		])) {
			expect(blocked.error === null).toBe(true);
			expect(blocked.data?.length).toBe(0);
		}
		for (const allowed of await Promise.all([
			owner.from('families').select('id').eq('id', familyId),
			owner.from('public_profiles').select('id').eq('id', userIds[0])
		])) {
			expect(allowed.error === null).toBe(true);
			expect(allowed.data?.length).toBe(1);
		}
		expect((await aal1.rpc('get_my_profile')).error?.code).toBe('42501');
		const deniedFamily = await aal1.rpc('create_family', { p_name: 'MFA debe rechazar' });
		if (deniedFamily.data) familyIds.push(deniedFamily.data);
		expect(deniedFamily.error?.code).toBe('42501');
		const profile = await owner.rpc('get_my_profile');
		expect(profile.error === null).toBe(true);
		expect(profile.data?.[0]?.id).toBe(userIds[0]);
		const foreignFamily = await owner.from('families').select('id').eq('id', outsiderFamilyId);
		expect(foreignFamily.error === null).toBe(true);
		expect(foreignFamily.data?.length).toBe(0);
		const blockedImage = await aal1.storage.from('gift-images').createSignedUrl(imagePath, 60);
		expect(blockedImage.error !== null).toBe(true);
		expect(Boolean(blockedImage.data?.signedUrl)).toBe(false);
		const allowedImage = await owner.storage.from('gift-images').createSignedUrl(imagePath, 60);
		expect(allowedImage.error === null).toBe(true);
		expect(Boolean(allowedImage.data?.signedUrl)).toBe(true);

		const unenrolled = await owner.auth.mfa.unenroll({ factorId: enrolled.data!.id });
		expect(unenrolled.error === null).toBe(true);
		const restored = await aal1.from('families').select('id').eq('id', familyId);
		expect(restored.error === null).toBe(true);
		expect(restored.data?.length).toBe(1);
		expect((await aal1.rpc('get_my_profile')).error === null).toBe(true);
		const restoredImage = await aal1.storage.from('gift-images').createSignedUrl(imagePath, 60);
		expect(restoredImage.error === null).toBe(true);
		expect(Boolean(restoredImage.data?.signedUrl)).toBe(true);
	} finally {
		const cleanup: PromiseSettledResult<{ error: unknown }>[] = [];
		if (imagePath) {
			cleanup.push(
				...(await Promise.allSettled([admin.storage.from('gift-images').remove([imagePath])]))
			);
		}
		cleanup.push(
			...(await Promise.allSettled(
				familyIds.map((id) => admin.from('families').delete().eq('id', id))
			))
		);
		cleanup.push(
			...(await Promise.allSettled(userIds.map((id) => admin.auth.admin.deleteUser(id))))
		);
		expect(
			cleanup.every((result) => result.status === 'fulfilled' && result.value.error === null)
		).toBe(true);
	}
});
