<script lang="ts">
  import { createClient } from '$lib/supabase';
  import { onMount } from 'svelte';

  const supabase = createClient();

  let loading = $state(false);
  let enrolling = $state(false);
  let verifying = $state(false);
  let error = $state('');
  let success = $state('');

  let isEnabled = $state(false);
  let qrCode = $state('');
  let secret = $state('');
  let verifyCode = $state('');
  let factorId = $state('');

  onMount(async () => {
    await checkMFAStatus();
  });

  async function checkMFAStatus() {
    loading = true;
    try {
      const { data, error: mfaError } = await supabase.auth.mfa.listFactors();

      if (mfaError) throw mfaError;

      // Verificar si hay algún factor TOTP verificado
      const totpFactors = data?.totp || [];
      const verifiedFactor = totpFactors.find(f => f.status === 'verified');

      if (verifiedFactor) {
        isEnabled = true;
        factorId = verifiedFactor.id;
      }
    } catch (err: any) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  async function enrollTOTP() {
    enrolling = true;
    error = '';
    success = '';

    try {
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'MyFamily Authenticator'
      });

      if (enrollError) throw enrollError;

      if (data) {
        qrCode = data.totp.qr_code;
        secret = data.totp.secret;
        factorId = data.id;
      }
    } catch (err: any) {
      error = err.message;
    } finally {
      enrolling = false;
    }
  }

  async function verifyTOTP() {
    if (!verifyCode || verifyCode.length !== 6) {
      error = 'Please enter a valid 6-digit code';
      return;
    }

    verifying = true;
    error = '';

    try {
      const { data, error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: verifyCode
      });

      if (verifyError) throw verifyError;

      success = '2FA enabled successfully!';
      isEnabled = true;

      // Limpiar estado de enrollment
      qrCode = '';
      secret = '';
      verifyCode = '';

      // Recargar status
      setTimeout(() => {
        success = '';
        checkMFAStatus();
      }, 2000);
    } catch (err: any) {
      error = err.message || 'Invalid code. Please try again.';
    } finally {
      verifying = false;
    }
  }

  async function disableTOTP() {
    if (!confirm('Are you sure you want to disable two-factor authentication? This will make your account less secure.')) {
      return;
    }

    loading = true;
    error = '';

    try {
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({
        factorId
      });

      if (unenrollError) throw unenrollError;

      success = '2FA disabled successfully';
      isEnabled = false;
      factorId = '';

      setTimeout(() => {
        success = '';
      }, 2000);
    } catch (err: any) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  function cancelEnrollment() {
    qrCode = '';
    secret = '';
    verifyCode = '';
    error = '';
  }
</script>

<div class="card bg-base-100 shadow-xl">
  <div class="card-body">
    <h2 class="card-title text-xl">
      Two-Factor Authentication (2FA)
      {#if isEnabled}
        <span class="badge badge-success">Enabled</span>
      {:else}
        <span class="badge badge-ghost">Disabled</span>
      {/if}
    </h2>

    <p class="text-sm text-base-content/70">
      Add an extra layer of security to your account by requiring a code from your authenticator app.
    </p>

    {#if error}
      <div class="alert alert-error">
        <span>{error}</span>
      </div>
    {/if}

    {#if success}
      <div class="alert alert-success">
        <span>{success}</span>
      </div>
    {/if}

    {#if loading}
      <div class="flex justify-center py-4">
        <span class="loading loading-spinner loading-lg"></span>
      </div>
    {:else if !isEnabled && !qrCode}
      <!-- Estado: 2FA Deshabilitado -->
      <div class="mt-4">
        <div class="bg-base-200 p-4 rounded-lg">
          <h3 class="font-semibold mb-2">How it works:</h3>
          <ol class="list-decimal list-inside space-y-1 text-sm">
            <li>Install an authenticator app (Google Authenticator, Authy, 1Password, etc.)</li>
            <li>Scan the QR code with your app</li>
            <li>Enter the 6-digit code to verify</li>
            <li>You'll need this code every time you log in</li>
          </ol>
        </div>

        <button
          onclick={enrollTOTP}
          class="btn btn-primary mt-4"
          disabled={enrolling}
        >
          {#if enrolling}
            <span class="loading loading-spinner"></span>
          {/if}
          Enable 2FA
        </button>
      </div>
    {:else if qrCode}
      <!-- Estado: Enrollment en Progreso -->
      <div class="mt-4">
        <div class="alert alert-info mb-4">
          <span>Scan this QR code with your authenticator app</span>
        </div>

        <div class="flex flex-col items-center gap-4">
          <!-- QR Code -->
          <div class="bg-white p-4 rounded-lg">
            <img src={qrCode} alt="QR Code for 2FA" class="w-64 h-64" />
          </div>

          <!-- Secret Manual Entry -->
          <div class="w-full">
            <p class="text-sm text-base-content/70 mb-2">
              Can't scan? Enter this code manually:
            </p>
            <div class="mockup-code text-xs">
              <pre><code>{secret}</code></pre>
            </div>
          </div>

          <!-- Verificar Código -->
          <div class="form-control w-full max-w-xs">
            <label class="label" for="verifyCode">
              <span class="label-text">Enter 6-digit code from app</span>
            </label>
            <input
              type="text"
              id="verifyCode"
              bind:value={verifyCode}
              placeholder="123456"
              class="input input-bordered w-full text-center text-2xl tracking-widest"
              maxlength="6"
              pattern="[0-9]*"
              inputmode="numeric"
              disabled={verifying}
            />
          </div>

          <div class="flex gap-2">
            <button
              onclick={verifyTOTP}
              class="btn btn-primary"
              disabled={verifying || verifyCode.length !== 6}
            >
              {#if verifying}
                <span class="loading loading-spinner"></span>
              {/if}
              Verify & Enable
            </button>
            <button
              onclick={cancelEnrollment}
              class="btn btn-ghost"
              disabled={verifying}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    {:else if isEnabled}
      <!-- Estado: 2FA Habilitado -->
      <div class="mt-4">
        <div class="alert alert-success">
          <div class="flex flex-col gap-1">
            <span class="font-semibold">✓ Two-factor authentication is active</span>
            <span class="text-sm">Your account is protected with an extra layer of security.</span>
          </div>
        </div>

        <div class="mt-4 bg-base-200 p-4 rounded-lg">
          <h3 class="font-semibold mb-2">What this means:</h3>
          <ul class="list-disc list-inside space-y-1 text-sm">
            <li>You'll need your authenticator app to log in</li>
            <li>Your account is more secure against unauthorized access</li>
            <li>You can disable 2FA at any time from this page</li>
          </ul>
        </div>

        <div class="alert alert-warning mt-4">
          <div class="flex flex-col gap-1">
            <span class="font-semibold">⚠️ Important</span>
            <span class="text-sm">
              If you lose access to your authenticator app, you won't be able to log in.
              Make sure to save backup codes or have recovery options configured.
            </span>
          </div>
        </div>

        <button
          onclick={disableTOTP}
          class="btn btn-error btn-outline mt-4"
          disabled={loading}
        >
          Disable 2FA
        </button>
      </div>
    {/if}
  </div>
</div>
