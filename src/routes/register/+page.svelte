<script lang="ts">
  import { createClient } from '$lib/supabase';
  import { goto } from '$app/navigation';

  const supabase = createClient();

  let loading = $state(false);
  let error = $state('');
  let success = $state('');
  let email = $state('');
  let password = $state('');
  let confirmPassword = $state('');
  let displayName = $state('');

  async function signUp(e: Event) {
    e.preventDefault();
    loading = true;
    error = '';
    success = '';

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

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName || email.split('@')[0]
        },
        emailRedirectTo: `${window.location.origin}/auth/callback`
      }
    });

    loading = false;

    if (signUpError) {
      error = signUpError.message;
      return;
    }

    if (data?.user) {
      // Si la confirmación de email está deshabilitada, redirige directamente
      if (data.session) {
        goto('/dashboard');
      } else {
        // Si necesita confirmación de email
        success = 'Check your email to confirm your account!';
      }
    }
  }

  async function signInWithProvider(provider: 'google' | 'github') {
    loading = true;
    error = '';
    success = '';

    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    });

    if (signInError) {
      error = signInError.message;
      loading = false;
    }
  }
</script>

<div class="flex min-h-screen items-center justify-center bg-base-200">
  <div class="card w-96 bg-base-100 shadow-xl">
    <div class="card-body">
      <h2 class="card-title text-2xl font-bold">Create Account</h2>
      <p class="text-sm text-base-content/70">Join MyFamily to get started</p>

      {#if error}
        <div class="alert alert-error mt-4">
          <span>{error}</span>
        </div>
      {/if}

      {#if success}
        <div class="alert alert-success mt-4">
          <span>{success}</span>
        </div>
      {/if}

      <form onsubmit={signUp} class="flex flex-col gap-4 mt-4">
        <div class="form-control">
          <label class="label" for="displayName">
            <span class="label-text">Display Name</span>
          </label>
          <input
            type="text"
            id="displayName"
            bind:value={displayName}
            placeholder="Your name"
            class="input input-bordered"
            disabled={loading}
          />
        </div>

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

        <div class="form-control">
          <label class="label" for="password">
            <span class="label-text">Password</span>
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
            <span class="label-text">Confirm Password</span>
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
          Sign Up
        </button>
      </form>

      <div class="text-center text-sm mt-2">
        <span class="text-base-content/70">Already have an account?</span>
        <a href="/login" class="link link-primary ml-1">Sign in</a>
      </div>

      <div class="divider">Or continue with</div>

      <div class="flex flex-col gap-3">
        <button
          class="btn btn-outline"
          onclick={() => signInWithProvider('google')}
          disabled={loading}
        >
          {#if loading}
            <span class="loading loading-spinner"></span>
          {:else}
            <svg class="h-5 w-5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
          {/if}
          Continue with Google
        </button>

        <button
          class="btn btn-outline"
          onclick={() => signInWithProvider('github')}
          disabled={loading}
        >
          {#if loading}
            <span class="loading loading-spinner"></span>
          {:else}
            <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path
                d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
              />
            </svg>
          {/if}
          Continue with GitHub
        </button>
      </div>
    </div>
  </div>
</div>
