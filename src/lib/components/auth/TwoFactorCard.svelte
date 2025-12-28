<script lang="ts">
  import { createClient } from '$lib/supabase';
  import { onMount } from 'svelte';

  const supabase = createClient();

  let loading = $state(false);
  let error = $state('');
  let success = $state('');

  let isEnabled = $state(false);
  let factorId = $state('');

  // Modal states
  let showEnableModal = $state(false);
  let showDisableModal = $state(false);
  let showInfoModal = $state(false);

  // Enrollment data
  let qrCode = $state('');
  let secret = $state('');
  let verifyCode = $state('');
  let enrolling = $state(false);
  let verifying = $state(false);

  // Disable data
  let disableCode = $state('');
  let disabling = $state(false);

  onMount(async () => {
    await checkMFAStatus();
  });

  async function checkMFAStatus() {
    loading = true;
    try {
      const { data, error: mfaError } = await supabase.auth.mfa.listFactors();
      if (mfaError) throw mfaError;

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

  function openEnableModal() {
    showEnableModal = true;
    error = '';
    success = '';
  }

  function closeEnableModal() {
    showEnableModal = false;
    qrCode = '';
    secret = '';
    verifyCode = '';
    error = '';
  }

  function openDisableModal() {
    showDisableModal = true;
    disableCode = '';
    error = '';
  }

  function closeDisableModal() {
    showDisableModal = false;
    disableCode = '';
    error = '';
  }

  async function startEnrollment() {
    enrolling = true;
    error = '';

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

  async function verifyAndEnable() {
    if (!verifyCode || verifyCode.length !== 6) {
      error = 'Please enter a valid 6-digit code';
      return;
    }

    verifying = true;
    error = '';

    try {
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: verifyCode
      });

      if (verifyError) throw verifyError;

      success = '2FA enabled successfully!';
      isEnabled = true;

      setTimeout(() => {
        closeEnableModal();
        success = '';
        checkMFAStatus();
      }, 1500);
    } catch (err: any) {
      error = err.message || 'Invalid code. Please try again.';
      verifyCode = '';
    } finally {
      verifying = false;
    }
  }

  async function disableTOTP() {
    if (!disableCode || disableCode.length !== 6) {
      error = 'Please enter a valid 6-digit code to confirm';
      return;
    }

    disabling = true;
    error = '';

    try {
      // Primero verificamos el código
      const { data: challengeData, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId });

      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code: disableCode
      });

      if (verifyError) throw new Error('Invalid code');

      // Si el código es correcto, deshabilitamos
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({
        factorId
      });

      if (unenrollError) throw unenrollError;

      success = '2FA disabled successfully';
      isEnabled = false;
      factorId = '';

      setTimeout(() => {
        closeDisableModal();
        success = '';
      }, 1500);
    } catch (err: any) {
      error = err.message || 'Could not disable 2FA. Please try again.';
      disableCode = '';
    } finally {
      disabling = false;
    }
  }
</script>

<!-- Main Card -->
<div class="card bg-base-100 shadow-xl">
  <div class="card-body">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <h2 class="card-title">Two-Factor Authentication</h2>
        {#if isEnabled}
          <span class="badge badge-success gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
            </svg>
            Enabled
          </span>
        {:else}
          <span class="badge badge-ghost">Disabled</span>
        {/if}
      </div>

      <button
        onclick={() => showInfoModal = true}
        class="btn btn-circle btn-ghost btn-sm"
        title="Information about 2FA"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>
    </div>

    <p class="text-sm text-base-content/70">
      {#if isEnabled}
        Your account is protected with two-factor authentication using a time-based code.
      {:else}
        Add an extra layer of security by requiring a code from your authenticator app when you sign in.
      {/if}
    </p>

    {#if success}
      <div class="alert alert-success mt-4">
        <span>{success}</span>
      </div>
    {/if}

    <div class="card-actions justify-end mt-4">
      {#if isEnabled}
        <button
          onclick={openDisableModal}
          class="btn btn-error btn-outline"
          disabled={loading}
        >
          Disable 2FA
        </button>
      {:else}
        <button
          onclick={openEnableModal}
          class="btn btn-primary"
          disabled={loading}
        >
          Enable 2FA
        </button>
      {/if}
    </div>
  </div>
</div>

<!-- Info Modal -->
{#if showInfoModal}
  <dialog class="modal modal-open">
    <div class="modal-box max-w-2xl">
      <h3 class="font-bold text-lg mb-4">About Two-Factor Authentication</h3>

      <div class="space-y-4">
        <div>
          <h4 class="font-semibold mb-2">What is 2FA?</h4>
          <p class="text-sm text-base-content/70">
            Two-factor authentication adds an extra layer of security to your account. When enabled,
            you'll need both your password and a 6-digit code from your authenticator app to sign in.
          </p>
        </div>

        <div>
          <h4 class="font-semibold mb-2">Compatible Apps</h4>
          <ul class="list-disc list-inside text-sm text-base-content/70 space-y-1">
            <li>Google Authenticator</li>
            <li>Microsoft Authenticator</li>
            <li>Authy</li>
            <li>1Password</li>
            <li>Bitwarden</li>
          </ul>
        </div>

        <div>
          <h4 class="font-semibold mb-2">Benefits</h4>
          <ul class="list-disc list-inside text-sm text-base-content/70 space-y-1">
            <li>Protects your account even if your password is compromised</li>
            <li>Industry-standard security used by major platforms</li>
            <li>Works offline - no internet required to generate codes</li>
          </ul>
        </div>

        <div class="alert alert-warning">
          <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span class="text-sm">
            Keep your recovery codes in a safe place. If you lose access to your authenticator app,
            you won't be able to sign in without them.
          </span>
        </div>
      </div>

      <div class="modal-action">
        <button onclick={() => showInfoModal = false} class="btn">Close</button>
      </div>
    </div>
    <div class="modal-backdrop" onclick={() => showInfoModal = false}></div>
  </dialog>
{/if}

<!-- Enable 2FA Modal -->
{#if showEnableModal}
  <dialog class="modal modal-open">
    <div class="modal-box max-w-2xl">
      <h3 class="font-bold text-lg mb-4">Enable Two-Factor Authentication</h3>

      {#if error}
        <div class="alert alert-error mb-4">
          <span>{error}</span>
        </div>
      {/if}

      {#if !qrCode}
        <!-- Step 1: Introduction -->
        <div class="space-y-4">
          <div class="bg-base-200 p-4 rounded-lg">
            <h4 class="font-semibold mb-2">Before you start:</h4>
            <ol class="list-decimal list-inside space-y-2 text-sm">
              <li>Make sure you have an authenticator app installed (Google Authenticator, Authy, etc.)</li>
              <li>Keep your phone handy to scan the QR code</li>
              <li>Save the setup key in case you need to manually enter it</li>
            </ol>
          </div>

          <div class="flex gap-2 justify-end">
            <button onclick={closeEnableModal} class="btn btn-ghost">Cancel</button>
            <button
              onclick={startEnrollment}
              class="btn btn-primary"
              disabled={enrolling}
            >
              {#if enrolling}
                <span class="loading loading-spinner"></span>
              {/if}
              Continue
            </button>
          </div>
        </div>
      {:else}
        <!-- Step 2: Scan QR & Verify -->
        <div class="space-y-4">
          <div class="steps steps-horizontal w-full mb-6">
            <div class="step step-primary">Scan QR Code</div>
            <div class="step">Verify Code</div>
            <div class="step">Complete</div>
          </div>

          <div class="alert alert-info">
            <span class="text-sm">
              Scan this QR code with your authenticator app, then enter the 6-digit code to verify.
            </span>
          </div>

          <div class="flex flex-col items-center gap-4">
            <div class="bg-white p-6 rounded-lg">
              <img src={qrCode} alt="QR Code" class="w-56 h-56" />
            </div>

            <div class="w-full max-w-md">
              <details class="collapse collapse-arrow bg-base-200">
                <summary class="collapse-title text-sm font-medium">
                  Can't scan? Enter manually
                </summary>
                <div class="collapse-content">
                  <p class="text-xs text-base-content/70 mb-2">Setup key:</p>
                  <code class="text-xs break-all bg-base-300 p-2 rounded block">{secret}</code>
                </div>
              </details>
            </div>

            <div class="form-control w-full max-w-xs">
              <label class="label" for="verify_code">
                <span class="label-text">Enter 6-digit code</span>
              </label>
              <input
                type="text"
                id="verify_code"
                bind:value={verifyCode}
                placeholder="000000"
                class="input input-bordered text-center text-2xl tracking-widest font-mono"
                maxlength="6"
                pattern="[0-9]*"
                inputmode="numeric"
                disabled={verifying}
              />
            </div>
          </div>

          <div class="flex gap-2 justify-end">
            <button onclick={closeEnableModal} class="btn btn-ghost" disabled={verifying}>
              Cancel
            </button>
            <button
              onclick={verifyAndEnable}
              class="btn btn-primary"
              disabled={verifying || verifyCode.length !== 6}
            >
              {#if verifying}
                <span class="loading loading-spinner"></span>
              {/if}
              Verify & Enable
            </button>
          </div>
        </div>
      {/if}
    </div>
    <div class="modal-backdrop" onclick={closeEnableModal}></div>
  </dialog>
{/if}

<!-- Disable 2FA Modal -->
{#if showDisableModal}
  <dialog class="modal modal-open">
    <div class="modal-box">
      <h3 class="font-bold text-lg text-error mb-4">Disable Two-Factor Authentication</h3>

      {#if error}
        <div class="alert alert-error mb-4">
          <span>{error}</span>
        </div>
      {/if}

      <div class="space-y-4">
        <div class="alert alert-warning">
          <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div class="flex flex-col gap-1">
            <span class="font-semibold">Warning</span>
            <span class="text-sm">
              Disabling 2FA will make your account less secure. Anyone with your password will be able to access your account.
            </span>
          </div>
        </div>

        <div class="form-control">
          <label class="label" for="disable_code">
            <span class="label-text">Enter current 6-digit code to confirm</span>
          </label>
          <input
            type="text"
            id="disable_code"
            bind:value={disableCode}
            placeholder="000000"
            class="input input-bordered text-center text-2xl tracking-widest font-mono"
            maxlength="6"
            pattern="[0-9]*"
            inputmode="numeric"
            disabled={disabling}
          />
          <label class="label">
            <span class="label-text-alt text-base-content/60">
              Open your authenticator app to get the code
            </span>
          </label>
        </div>
      </div>

      <div class="modal-action">
        <button onclick={closeDisableModal} class="btn btn-ghost" disabled={disabling}>
          Cancel
        </button>
        <button
          onclick={disableTOTP}
          class="btn btn-error"
          disabled={disabling || disableCode.length !== 6}
        >
          {#if disabling}
            <span class="loading loading-spinner"></span>
          {/if}
          Disable 2FA
        </button>
      </div>
    </div>
    <div class="modal-backdrop" onclick={closeDisableModal}></div>
  </dialog>
{/if}
