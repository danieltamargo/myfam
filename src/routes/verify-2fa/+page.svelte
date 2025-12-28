<script lang="ts">
  import { createClient } from '$lib/supabase';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  const supabase = createClient();

  let loading = $state(false);
  let error = $state('');
  let code = $state('');
  let factorId = $state('');
  let hasSession = $state(false);

  onMount(async () => {
    // Verificar si el usuario tiene una sesión parcial (autenticado pero sin 2FA)
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      // Si no hay sesión, redirigir a login
      goto('/login');
      return;
    }

    // Obtener factores MFA
    const { data, error: mfaError } = await supabase.auth.mfa.listFactors();

    if (mfaError || !data) {
      error = 'Could not load 2FA settings. Please try logging in again.';
      return;
    }

    const verifiedFactor = data.totp?.find(f => f.status === 'verified');

    if (!verifiedFactor) {
      // Si no hay 2FA configurado, continuar al dashboard
      goto('/dashboard');
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
      const { data: challengeData, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId });

      if (challengeError) throw challengeError;

      // Verificar código
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code
      });

      if (verifyError) throw verifyError;

      // Éxito - redirigir al dashboard
      goto('/dashboard');
    } catch (err: any) {
      error = err.message || 'Invalid code. Please try again.';
      code = '';
    } finally {
      loading = false;
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    goto('/login');
  }

  // Auto-submit cuando se complete el código
  $effect(() => {
    if (code.length === 6 && !loading) {
      verifyCode(new Event('submit'));
    }
  });
</script>

<div class="flex min-h-screen items-center justify-center bg-base-200">
  <div class="card w-96 bg-base-100 shadow-xl">
    <div class="card-body">
      <h2 class="card-title text-2xl font-bold">Two-Factor Authentication</h2>
      <p class="text-sm text-base-content/70">
        Enter the 6-digit code from your authenticator app
      </p>

      {#if error}
        <div class="alert alert-error mt-4">
          <span>{error}</span>
        </div>
      {/if}

      {#if hasSession}
        <form onsubmit={verifyCode} class="flex flex-col gap-4 mt-6">
          <div class="form-control">
            <div class="flex justify-center">
              <input
                type="text"
                bind:value={code}
                placeholder="000000"
                class="input input-bordered input-lg w-full text-center text-3xl tracking-[0.5em] font-mono"
                maxlength="6"
                pattern="[0-9]*"
                inputmode="numeric"
                autofocus
                disabled={loading}
              />
            </div>
            <label class="label">
              <span class="label-text-alt mx-auto">Code from your authenticator app</span>
            </label>
          </div>

          <button
            type="submit"
            class="btn btn-primary btn-lg"
            disabled={loading || code.length !== 6}
          >
            {#if loading}
              <span class="loading loading-spinner"></span>
            {/if}
            Verify
          </button>
        </form>

        <div class="divider text-xs">Having trouble?</div>

        <div class="text-center space-y-2">
          <p class="text-sm text-base-content/70">
            Can't access your authenticator app?
          </p>
          <button
            onclick={handleLogout}
            class="btn btn-ghost btn-sm"
          >
            Sign out and try again
          </button>
        </div>
      {:else}
        <div class="flex justify-center py-8">
          <span class="loading loading-spinner loading-lg"></span>
        </div>
      {/if}
    </div>
  </div>
</div>
