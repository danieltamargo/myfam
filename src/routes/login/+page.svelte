<script lang="ts">
	import { safeAuthError } from '$lib/auth/messages';
	import { createClient } from '$lib/supabase';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';

	const supabase = createClient();
	let ready = $state(false);
	onMount(() => {
		ready = true;
	});

	let loading = $state(false);
	let error = $state('');
	let success = $state('');
	let email = $state('');
	let password = $state('');

	async function signInWithEmail(e: Event) {
		e.preventDefault();
		loading = true;
		error = '';
		success = '';

		const { data, error: signInError } = await supabase.auth.signInWithPassword({
			email,
			password
		});

		loading = false;

		if (signInError) {
			error = safeAuthError(signInError, 'login');
			return;
		}

		if (data?.user) {
			// Verificar si el usuario tiene 2FA habilitado
			const { data: factors } = await supabase.auth.mfa.listFactors();
			const hasMFA = factors?.totp?.some((f) => f.status === 'verified');

			if (hasMFA) {
				// Redirigir a verificación 2FA
				goto(resolve('/verify-2fa'));
			} else {
				// Continuar al dashboard
				goto(resolve('/dashboard'));
			}
		}
	}
</script>

<div class="flex min-h-screen items-center justify-center bg-base-200">
	<div class="card w-96 bg-base-100 shadow-xl">
		<div class="card-body">
			<h2 class="card-title text-2xl font-bold">Welcome to MyFamily</h2>
			<p class="text-sm text-base-content/70">Sign in to manage your family</p>

			{#if error}
				<div class="mt-4 alert alert-error">
					<span>{error}</span>
				</div>
			{/if}

			{#if success}
				<div class="mt-4 alert alert-success">
					<span>{success}</span>
				</div>
			{/if}

			<form onsubmit={signInWithEmail} class="mt-4 flex flex-col gap-4">
				<div class="form-control">
					<label class="label" for="email">
						<span class="label-text">Email</span>
					</label>
					<input
						type="email"
						id="email"
						bind:value={email}
						placeholder="you@example.com"
						class="input-bordered input"
						required
						disabled={!ready || loading}
					/>
				</div>

				<div class="form-control">
					<label class="label" for="password">
						<span class="label-text">Password</span>
					</label>
					<input
						type="password"
						id="password"
						bind:value={password}
						placeholder="••••••••"
						class="input-bordered input"
						required
						disabled={!ready || loading}
					/>
					<div class="label">
						<a
							href={resolve('/forgot-password')}
							class="label-text-alt link link-primary link-hover"
						>
							Forgot password?
						</a>
					</div>
				</div>

				<button type="submit" class="btn btn-primary" disabled={!ready || loading}>
					{#if loading}
						<span class="loading loading-spinner"></span>
					{/if}
					Sign In
				</button>
			</form>

			<p class="mt-2 text-center text-sm text-base-content/70">
				El acceso es privado. Solicita tu cuenta al administrador.
			</p>
		</div>
	</div>
</div>
