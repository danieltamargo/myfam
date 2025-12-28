<script lang="ts">
  import { createClient } from '$lib/supabase';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  const supabase = createClient();

  let loading = $state(false);
  let error = $state('');
  let success = $state(false);
  let password = $state('');
  let confirmPassword = $state('');
  let validToken = $state(false);
  let checking = $state(true);

  onMount(async () => {
    // Verificar si el usuario tiene una sesión válida (viene del link del email)
    const { data: { session } } = await supabase.auth.getSession();

    if (session) {
      validToken = true;
    } else {
      error = 'Invalid or expired reset link. Please request a new one.';
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
      error = 'Passwords do not match';
      loading = false;
      return;
    }

    if (password.length < 6) {
      error = 'Password must be at least 6 characters';
      loading = false;
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: password
    });

    loading = false;

    if (updateError) {
      error = updateError.message;
      return;
    }

    success = true;

    // Redirigir al login después de 2 segundos
    setTimeout(() => {
      goto('/login');
    }, 2000);
  }
</script>

<div class="flex min-h-screen items-center justify-center bg-base-200">
  <div class="card w-96 bg-base-100 shadow-xl">
    <div class="card-body">
      <h2 class="card-title text-2xl font-bold">Reset Password</h2>
      <p class="text-sm text-base-content/70">
        Enter your new password below.
      </p>

      {#if checking}
        <div class="flex justify-center py-8">
          <span class="loading loading-spinner loading-lg"></span>
        </div>
      {:else if !validToken}
        <div class="alert alert-error mt-4">
          <div class="flex flex-col gap-2">
            <span class="font-semibold">Invalid or Expired Link</span>
            <span class="text-sm">{error}</span>
          </div>
        </div>

        <div class="card-actions justify-center mt-4">
          <a href="/forgot-password" class="btn btn-primary">
            Request New Link
          </a>
        </div>
      {:else}
        {#if error}
          <div class="alert alert-error mt-4">
            <span>{error}</span>
          </div>
        {/if}

        {#if success}
          <div class="alert alert-success mt-4">
            <div class="flex flex-col gap-2">
              <span class="font-semibold">Password Updated!</span>
              <span class="text-sm">
                Your password has been successfully changed. Redirecting to login...
              </span>
            </div>
          </div>
        {:else}
          <form onsubmit={handleSubmit} class="flex flex-col gap-4 mt-4">
            <div class="form-control">
              <label class="label" for="password">
                <span class="label-text">New Password</span>
              </label>
              <input
                type="password"
                id="password"
                bind:value={password}
                placeholder="••••••••"
                class="input input-bordered"
                required
                disabled={loading}
              />
              <label class="label">
                <span class="label-text-alt">At least 6 characters</span>
              </label>
            </div>

            <div class="form-control">
              <label class="label" for="confirmPassword">
                <span class="label-text">Confirm New Password</span>
              </label>
              <input
                type="password"
                id="confirmPassword"
                bind:value={confirmPassword}
                placeholder="••••••••"
                class="input input-bordered"
                required
                disabled={loading}
              />
            </div>

            <button type="submit" class="btn btn-primary" disabled={loading}>
              {#if loading}
                <span class="loading loading-spinner"></span>
              {/if}
              Update Password
            </button>
          </form>

          <div class="text-center text-sm mt-4">
            <a href="/login" class="link link-primary">Back to Login</a>
          </div>
        {/if}
      {/if}
    </div>
  </div>
</div>
