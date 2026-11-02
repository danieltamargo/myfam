import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { error } from '@sveltejs/kit';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';

type Client = SupabaseClient<Database>;

export function hashRecoveryCode(value: string): string | null {
	if (value.length > 64) return null;
	const normalized = value.replace(/[\s-]/g, '').toLowerCase();
	if (!/^[a-f0-9]{32}$/.test(normalized)) return null;
	return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

export async function replaceRecoveryCodes(client: Client, revoke = false): Promise<string[]> {
	const codes = revoke
		? []
		: Array.from({ length: 8 }, () => randomBytes(16).toString('hex').match(/.{8}/g)!.join('-'));
	const { error: replaceError } = await client.rpc('replace_my_mfa_recovery_codes', {
		p_hashes: codes.map((code) => hashRecoveryCode(code)!)
	});
	if (replaceError) throw error(403, 'Verifica el segundo factor antes de gestionar los códigos.');
	return codes;
}

export async function recoverMfa({
	user,
	password,
	newPassword,
	code,
	admin,
	passwordClient,
	cookieClient
}: {
	user: User;
	password: string;
	newPassword: string;
	code: string;
	admin: Client;
	passwordClient: Client;
	cookieClient: Client;
}): Promise<void> {
	const codeHash = hashRecoveryCode(code);
	if (
		!user.email ||
		!codeHash ||
		!password ||
		password.length > 4096 ||
		newPassword.length < 12 ||
		newPassword.length > 128 ||
		newPassword === password
	) {
		throw error(
			400,
			'Introduce un código válido y una contraseña nueva distinta de al menos 12 caracteres.'
		);
	}
	const { data: firstFactor, error: passwordError } = await passwordClient.auth.signInWithPassword({
		email: user.email,
		password
	});
	if (passwordError || !firstFactor.session || firstFactor.user?.id !== user.id) {
		throw error(400, 'No se pudo verificar la contraseña o el código de recuperación.');
	}
	const jobId = randomUUID();
	let started = false;
	try {
		const { data: accepted, error: beginError } = await admin.rpc('begin_mfa_recovery', {
			p_user_id: user.id,
			p_code_hash: codeHash,
			p_job_id: jobId
		});
		if (beginError) throw error(503, 'No se pudo iniciar la recuperación.');
		if (!accepted)
			throw error(400, 'No se pudo verificar la contraseña o el código de recuperación.');
		started = true;
		const { error: signOutError } = await admin.auth.admin.signOut(
			firstFactor.session.access_token,
			'global'
		);
		if (signOutError) throw signOutError;
		const { error: changeError } = await admin.auth.admin.updateUserById(user.id, {
			password: newPassword
		});
		if (changeError) throw changeError;
		const { data: factors, error: factorsError } = await admin.auth.admin.mfa.listFactors({
			userId: user.id
		});
		if (factorsError) throw factorsError;
		for (const factor of factors.factors) {
			const { error: deleteError } = await admin.auth.admin.mfa.deleteFactor({
				userId: user.id,
				id: factor.id
			});
			if (deleteError) throw deleteError;
		}
		const { data: recovered, error: signInError } = await passwordClient.auth.signInWithPassword({
			email: user.email,
			password: newPassword
		});
		if (signInError || !recovered.session || recovered.user?.id !== user.id)
			throw signInError ?? new Error('Session missing');
		// This token is issued directly by GoTrue, never supplied by the request.
		const claims = JSON.parse(
			Buffer.from(recovered.session.access_token.split('.')[1], 'base64url').toString('utf8')
		);
		if (typeof claims.session_id !== 'string') throw new Error('Session missing');
		const { error: bindError } = await admin.rpc('bind_mfa_recovery_session', {
			p_user_id: user.id,
			p_job_id: jobId,
			p_session_id: claims.session_id
		});
		if (bindError) throw bindError;
		const { error: cookieError } = await cookieClient.auth.setSession({
			access_token: recovered.session.access_token,
			refresh_token: recovered.session.refresh_token
		});
		if (cookieError) throw cookieError;
	} catch (cause) {
		const { error: cleanupError } = await passwordClient.auth.signOut({ scope: 'local' });
		if (cleanupError)
			throw error(
				503,
				started
					? 'La recuperación sigue bloqueada. Contacta con quien administra MyFamily.'
					: 'No se pudo cerrar la sesión temporal de recuperación.'
			);
		if (!started) throw cause;
		throw error(
			503,
			'La recuperación quedó bloqueada por seguridad. Usa tu contraseña nueva si el cambio se completó y contacta con quien administra MyFamily.'
		);
	}
}
