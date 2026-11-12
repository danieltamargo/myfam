<script lang="ts">
	import { safeAuthError } from '$lib/auth/messages';
	import { createClient } from '$lib/supabase';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { invitationSession } from '$lib/auth/invitation';
	import * as m from '$paraglide/messages';
	import { getLocale } from '$paraglide/runtime';

	const supabase = createClient();

	let loading = $state(false);
	let error = $state('');
	let success = $state(false);
	let password = $state('');
	let confirmPassword = $state('');
	let validToken = $state(false);
	let checking = $state(true);

	onMount(async () => {
		const incomingFragment = window.location.hash;
		const invitedSession = invitationSession(window.location.hash);
		if (incomingFragment && !invitedSession) {
			window.history.replaceState(null, '', window.location.pathname + window.location.search);
			error = m['auth.welcome_link_error']();
			checking = false;
			return;
		}
		if (invitedSession) {
			window.history.replaceState(null, '', window.location.pathname + window.location.search);
			const { error: invitationError } = await supabase.auth.setSession(invitedSession);
			if (invitationError) {
				error = m['auth.welcome_link_error']();
				checking = false;
				return;
			}
		}
		// Verificar si el usuario tiene una sesión válida (viene del link del email)
		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (session) {
			validToken = true;
		} else {
			error = m['auth.reset_link_error']();
		}

		checking = false;
	});

	async function handleSubmit(e: Event) {
		e.preventDefault();
		loading = true;
		error = '';
		success = false;

		// Validar contraseñas
		if (password !== confirmPassword) {
			error = m['auth.password_mismatch']();
			loading = false;
			return;
		}

		if (password.length < 12) {
			error = m['auth.password_length']();
			loading = false;
			return;
		}

		const { error: updateError } = await supabase.auth.updateUser({
			password: password
		});

		loading = false;

		if (updateError) {
			error = safeAuthError(updateError, 'reset', getLocale());
			return;
		}

		success = true;

		// Redirigir al login después de 2 segundos
		setTimeout(() => {
			goto(resolve('/login'));
		}, 2000);
	}
</script>

<div class="flex min-h-dvh items-center justify-center bg-base-200 px-4 pt-6 pb-20">
	<div class="card w-full max-w-sm bg-base-100 shadow-xl">
		<div class="card-body">
			<h1 class="card-title text-2xl font-bold">{m['auth.reset_title']()}</h1>
			<p class="text-sm text-base-content/70">{m['auth.reset_intro']()}</p>

			{#if checking}
				<div class="flex justify-center py-8">
					<span class="loading loading-lg loading-spinner"></span>
				</div>
			{:else if !validToken}
				<div class="mt-4 alert alert-error" role="alert">
					<div class="flex flex-col gap-2">
						<span class="font-semibold">{m['auth.invalid_link']()}</span>
						<span class="text-sm">{error}</span>
					</div>
				</div>

				<div class="mt-4 card-actions justify-center">
					<a href={resolve('/forgot-password')} class="btn btn-primary"
						>{m['auth.request_link']()}</a
					>
				</div>
			{:else}
				{#if error}
					<div class="mt-4 alert alert-error" role="alert">
						<span>{error}</span>
					</div>
				{/if}

				{#if success}
					<div class="mt-4 alert alert-success" role="status">
						<div class="flex flex-col gap-2">
							<span class="font-semibold">{m['auth.password_updated']()}</span>
							<span class="text-sm">
								{m['auth.password_redirect']()}
							</span>
						</div>
					</div>
				{:else}
					<form onsubmit={handleSubmit} class="mt-4 flex flex-col gap-4">
						<div class="form-control">
							<label class="label" for="password">
								<span class="label-text">{m['auth.new_password']()}</span>
							</label>
							<input
								type="password"
								id="password"
								bind:value={password}
								minlength={12}
								placeholder="••••••••"
								class="input w-full"
								autocomplete="new-password"
								required
								disabled={loading}
							/>
							<p class="label">
								<span class="label-text-alt">{m['auth.password_length']()}</span>
							</p>
						</div>

						<div class="form-control">
							<label class="label" for="confirmPassword">
								<span class="label-text">{m['auth.confirm_password']()}</span>
							</label>
							<input
								type="password"
								id="confirmPassword"
								bind:value={confirmPassword}
								placeholder="••••••••"
								class="input w-full"
								autocomplete="new-password"
								required
								disabled={loading}
							/>
						</div>

						<button type="submit" class="btn btn-primary" disabled={loading}>
							{#if loading}
								<span class="loading loading-spinner"></span>
							{/if}
							{m['auth.update_password']()}
						</button>
					</form>

					<div class="mt-4 text-center text-sm">
						<a href={resolve('/login')} class="link link-primary">{m['auth.back_to_login']()}</a>
					</div>
				{/if}
			{/if}
		</div>
	</div>
</div>
