<script lang="ts">
	import { safeAuthError } from '$lib/auth/messages';
	import * as m from '$paraglide/messages';
	import { getLocale } from '$paraglide/runtime';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { createClient } from '$lib/supabase';

	const supabase = createClient();
	let ready = $state(false);
	onMount(() => {
		ready = true;
	});

	let loading = $state(false);
	let error = $state('');
	let success = $state(false);
	let email = $state('');

	async function handleSubmit(e: Event) {
		e.preventDefault();
		loading = true;
		error = '';
		success = false;

		const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
			redirectTo: `${window.location.origin}/reset-password`
		});

		loading = false;

		error = resetError ? safeAuthError(resetError, 'recovery', getLocale()) : '';
		if (error) {
			return;
		}

		success = true;
	}
</script>

<div class="flex min-h-dvh items-center justify-center bg-base-200 px-4 pt-6 pb-20">
	<div class="card w-full max-w-sm bg-base-100 shadow-xl">
		<div class="card-body">
			<h1 class="card-title text-2xl font-bold">{m['auth.recovery_title']()}</h1>
			<p class="text-sm text-base-content/70">
				{m['auth.recovery_intro']()}
			</p>

			{#if error}
				<div class="mt-4 alert alert-error" role="alert">
					<span>{error}</span>
				</div>
			{/if}

			{#if success}
				<div class="mt-4 alert alert-success" role="status">
					<div class="flex flex-col gap-2">
						<span class="font-semibold">{m['auth.check_email']()}</span>
						<span class="text-sm">
							{m['auth.recovery_result']()}
						</span>
					</div>
				</div>

				<div class="mt-4 card-actions justify-center">
					<a href={resolve('/login')} class="btn btn-ghost btn-sm">{m['auth.back_to_login']()}</a>
				</div>
			{:else}
				<form onsubmit={handleSubmit} class="mt-4 flex flex-col gap-4">
					<div class="form-control">
						<label class="label" for="email">
							<span class="label-text">{m['auth.email']()}</span>
						</label>
						<input
							type="email"
							id="email"
							bind:value={email}
							placeholder="you@example.com"
							class="input w-full"
							autocomplete="email"
							required
							disabled={!ready || loading}
						/>
					</div>

					<button type="submit" class="btn btn-primary" disabled={!ready || loading}>
						{#if loading}
							<span class="loading loading-spinner"></span>
						{/if}
						{m['auth.send_recovery']()}
					</button>
				</form>

				<div class="mt-4 text-center text-sm">
					<a href={resolve('/login')} class="link link-primary">{m['auth.back_to_login']()}</a>
				</div>
			{/if}
		</div>
	</div>
</div>
