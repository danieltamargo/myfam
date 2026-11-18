<script lang="ts">
	import { getLocale } from '$paraglide/runtime';
	import * as messages from '$paraglide/messages';
	import { safeAuthError } from '$lib/auth/messages';
	import { createClient } from '$lib/supabase';
	import { safeInternalPath } from '$lib/auth/redirects';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';

	const supabase = createClient();

	let loading = $state(false);
	let error = $state('');
	let code = $state('');
	let factorId = $state('');
	let hasSession = $state(false);
	let returnTo = $derived(safeInternalPath(page.url.searchParams.get('next')));

	onMount(async () => {
		// Verificar si el usuario tiene una sesión parcial (autenticado pero sin 2FA)
		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session) {
			// Si no hay sesión, redirigir a login
			goto(resolve('/login'));
			return;
		}

		// Obtener factores MFA
		const { data, error: mfaError } = await supabase.auth.mfa.listFactors();

		if (mfaError || !data) {
			error = 'Could not load 2FA settings. Please try logging in again.';
			return;
		}

		const verifiedFactor = data.totp?.find((f) => f.status === 'verified');

		if (!verifiedFactor) {
			// Si no hay 2FA configurado, continuar al destino interno solicitado
			goto(resolve(returnTo as '/dashboard'));
			return;
		}

		factorId = verifiedFactor.id;
		hasSession = true;
	});

	async function verifyCode(e: Event) {
		e.preventDefault();

		if (code.length !== 6) {
			error = 'Please enter a valid 6-digit code';
			return;
		}

		loading = true;
		error = '';

		try {
			// Crear challenge
			const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
				factorId
			});

			if (challengeError) throw challengeError;

			// Verificar código
			const { error: verifyError } = await supabase.auth.mfa.verify({
				factorId,
				challengeId: challengeData.id,
				code
			});

			if (verifyError) throw verifyError;

			// Éxito - volver al destino interno solicitado
			goto(resolve(returnTo as '/dashboard'));
		} catch (err: unknown) {
			error = safeAuthError(err, 'mfa', getLocale());
			code = '';
		} finally {
			loading = false;
		}
	}

	async function handleLogout() {
		await supabase.auth.signOut();
		goto(resolve('/login'));
	}

	function handleCodeInput(event: Event) {
		code = (event.currentTarget as HTMLInputElement).value;
		if (code.length === 6 && !loading) verifyCode(new Event('submit'));
	}
</script>

<div class="flex min-h-screen items-center justify-center bg-base-200">
	<div class="card w-96 bg-base-100 shadow-xl">
		<div class="card-body">
			<h2 class="card-title text-2xl font-bold">{messages['ui.two_step_verification']()}</h2>
			<p class="text-sm text-base-content/70">
				{messages['screen.enter_the_6_digit_code_from_your_authenticator_app']()}
			</p>

			{#if error}
				<div class="mt-4 alert alert-error">
					<span>{error}</span>
				</div>
			{/if}

			{#if hasSession}
				<form onsubmit={verifyCode} class="mt-6 flex flex-col gap-4">
					<div class="form-control">
						<div class="flex justify-center">
							<input
								type="text"
								value={code}
								oninput={handleCodeInput}
								id="verification-code"
								placeholder="000000"
								class="input-bordered input input-lg w-full text-center font-mono text-3xl tracking-[0.5em]"
								maxlength="6"
								pattern="[0-9]*"
								inputmode="numeric"
								disabled={loading}
							/>
						</div>
						<label class="label" for="verification-code">
							<span class="label-text-alt mx-auto"
								>{messages['screen.code_from_your_authenticator_app']()}</span
							>
						</label>
					</div>

					<button
						type="submit"
						class="btn btn-lg btn-primary"
						disabled={loading || code.length !== 6}
					>
						{#if loading}
							<span class="loading loading-spinner"></span>
						{/if}
						Verify
					</button>
				</form>

				<div class="divider text-xs">{messages['screen.having_trouble']()}</div>

				<div class="space-y-2 text-center">
					<p class="text-sm text-base-content/70">
						{messages['screen.can_t_access_your_authenticator_app']()}
					</p>
					<a href={resolve('/recover-2fa')} class="btn btn-outline btn-sm"
						>{messages['screen.use_a_recovery_code']()}</a
					>
					<button onclick={handleLogout} class="btn btn-ghost btn-sm">
						{messages['screen.sign_out_and_try_again']()}
					</button>
				</div>
			{:else}
				<div class="flex justify-center py-8">
					<span class="loading loading-lg loading-spinner"></span>
				</div>
			{/if}
		</div>
	</div>
</div>
