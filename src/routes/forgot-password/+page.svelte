<script lang="ts">
  import { createClient } from '$lib/supabase';

  const supabase = createClient();

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

    if (resetError) {
      error = resetError.message;
      return;
    }

    success = true;
  }
</script>

<div class="flex min-h-screen items-center justify-center bg-base-200">
  <div class="card w-96 bg-base-100 shadow-xl">
    <div class="card-body">
      <h2 class="card-title text-2xl font-bold">Forgot Password</h2>
      <p class="text-sm text-base-content/70">
        Enter your email and we'll send you a link to reset your password.
      </p>

      {#if error}
        <div class="alert alert-error mt-4">
          <span>{error}</span>
        </div>
      {/if}

      {#if success}
        <div class="alert alert-success mt-4">
          <div class="flex flex-col gap-2">
            <span class="font-semibold">Check your email!</span>
            <span class="text-sm">
              We've sent a password reset link to <strong>{email}</strong>
            </span>
            <span class="text-sm text-base-content/70">
              The link will expire in 1 hour.
            </span>
          </div>
        </div>

        <div class="card-actions justify-center mt-4">
          <a href="/login" class="btn btn-ghost btn-sm">
            Back to Login
          </a>
        </div>
      {:else}
        <form onsubmit={handleSubmit} class="flex flex-col gap-4 mt-4">
          <div class="form-control">
            <label class="label" for="email">
              <span class="label-text">Email</span>
            </label>
            <input
              type="email"
              id="email"
              bind:value={email}
              placeholder="you@example.com"
              class="input input-bordered"
              required
              disabled={loading}
            />
          </div>

          <button type="submit" class="btn btn-primary" disabled={loading}>
            {#if loading}
              <span class="loading loading-spinner"></span>
            {/if}
            Send Reset Link
          </button>
        </form>

        <div class="text-center text-sm mt-4">
          <span class="text-base-content/70">Remember your password?</span>
          <a href="/login" class="link link-primary ml-1">Sign in</a>
        </div>
      {/if}
    </div>
  </div>
</div>
