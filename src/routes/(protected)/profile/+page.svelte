<script lang="ts">
  import { createClient } from '$lib/supabase';
  import { enhance } from '$app/forms';
  import Avatar from '$lib/components/ui/Avatar.svelte';
  import TwoFactorCard from '$lib/components/auth/TwoFactorCard.svelte';

  interface Props {
    data: {
      user: any;
      profile: any;
      identities: Array<{
        provider: string;
        email: string;
        created_at: string;
      }>;
      isSoleOwner: boolean;
    };
    form: any;
  }

  let { data, form }: Props = $props();

  const supabase = createClient();

  let displayName = $state(data.profile?.display_name || '');
  let linking = $state(false);
  let showDeleteConfirm = $state(false);
  let deleteConfirmText = $state('');
  let error = $state('');

  const availableProviders = [
    {
      id: 'google',
      name: 'Google',
      icon: `<svg class="w-5 h-5" viewBox="0 0 24 24">
        <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>`,
      color: 'text-red-600'
    },
    {
      id: 'github',
      name: 'GitHub',
      icon: `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
      </svg>`,
      color: 'text-gray-900 dark:text-gray-100'
    }
  ];

  const linkedProviders = $derived(
    new Set(data.identities.map(i => i.provider))
  );

  async function linkProvider(provider: 'google' | 'github') {
    linking = true;
    error = '';

    try {
      const { error: linkError } = await supabase.auth.linkIdentity({
        provider,
        options: {
          redirectTo: `${window.location.origin}/profile`
        }
      });

      if (linkError) {
        error = linkError.message;
      }
    } catch (e: any) {
      error = e.message;
    } finally {
      linking = false;
    }
  }

  function handleDeleteAccount() {
    if (deleteConfirmText !== 'DELETE') {
      error = 'Please type DELETE to confirm';
      return;
    }
  }
</script>

<div class="container mx-auto max-w-4xl p-8">
  <!-- Header -->
  <div class="mb-8">
    <h1 class="text-3xl font-bold">Profile Settings</h1>
    <p class="text-base-content/70 mt-2">Manage your account, security, and preferences</p>
  </div>

  <!-- Alerts -->
  {#if form?.success}
    <div class="alert alert-success mb-6">
      <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>Profile updated successfully</span>
    </div>
  {/if}

  {#if form?.message || error}
    <div class="alert alert-error mb-6">
      <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>{form?.message || error}</span>
    </div>
  {/if}

  <div class="space-y-6">
    <!-- Profile Information -->
    <div class="card bg-base-100 shadow-xl">
      <div class="card-body">
        <h2 class="card-title mb-4">Profile Information</h2>

        <form method="POST" action="?/updateProfile" use:enhance>
          <div class="flex flex-col md:flex-row gap-6">
            <!-- Avatar -->
            <div class="flex flex-col items-center gap-3">
              <Avatar
                src={data.profile?.avatar_url}
                name={displayName || data.user?.email}
                size="xl"
              />
            </div>

            <!-- Form Fields -->
            <div class="flex-1 space-y-4">
              <div class="form-control">
                <label class="label" for="display_name">
                  <span class="label-text font-semibold">Display Name</span>
                </label>
                <input
                  type="text"
                  id="display_name"
                  name="display_name"
                  bind:value={displayName}
                  class="input input-bordered"
                  placeholder="Your name"
                />
              </div>

              <div class="form-control">
                <label class="label">
                  <span class="label-text font-semibold">Email</span>
                </label>
                <input
                  type="email"
                  value={data.user?.email}
                  class="input input-bordered"
                  disabled
                />
              </div>

              <div class="card-actions justify-end pt-2">
                <button type="submit" class="btn btn-primary">
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>

    <!-- Connected Accounts -->
    <div class="card bg-base-100 shadow-xl">
      <div class="card-body">
        <h2 class="card-title mb-2">Connected Accounts</h2>
        <p class="text-sm text-base-content/70 mb-4">
          Link multiple accounts to sign in with any of them. You can use these providers
          interchangeably to access your account.
        </p>

        <div class="space-y-3">
          {#each availableProviders as provider}
            {@const isLinked = linkedProviders.has(provider.id)}
            <div class="flex items-center justify-between p-4 bg-base-200 rounded-lg">
              <div class="flex items-center gap-3">
                <div class={provider.color}>
                  {@html provider.icon}
                </div>
                <div>
                  <p class="font-semibold">{provider.name}</p>
                  {#if isLinked}
                    {@const identity = data.identities.find(i => i.provider === provider.id)}
                    <p class="text-sm text-base-content/60">{identity?.email}</p>
                  {:else}
                    <p class="text-sm text-base-content/60">Not connected</p>
                  {/if}
                </div>
              </div>

              {#if isLinked}
                <div class="badge badge-success gap-1">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                  Connected
                </div>
              {:else}
                <button
                  onclick={() => linkProvider(provider.id as 'google' | 'github')}
                  class="btn btn-sm btn-outline"
                  disabled={linking}
                >
                  {#if linking}
                    <span class="loading loading-spinner loading-xs"></span>
                  {/if}
                  Connect
                </button>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    </div>

    <!-- Two-Factor Authentication -->
    <TwoFactorCard />

    <!-- Danger Zone -->
    <div class="card bg-base-100 shadow-xl border-2 border-error">
      <div class="card-body">
        <h2 class="card-title text-error">Danger Zone</h2>

        {#if !showDeleteConfirm}
          <p class="text-sm text-base-content/70 mb-4">
            Once you delete your account, there is no going back. All your data will be permanently removed.
          </p>

          {#if data.isSoleOwner}
            <div class="alert alert-warning mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>You cannot delete your account because you are the only owner of one or more families. Please transfer ownership first.</span>
            </div>
          {/if}

          <div class="card-actions justify-start">
            <button
              type="button"
              class="btn btn-error btn-outline"
              onclick={() => showDeleteConfirm = true}
              disabled={data.isSoleOwner}
            >
              Delete Account
            </button>
          </div>
        {:else}
          <div class="space-y-4">
            <div class="alert alert-error">
              <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>This action cannot be undone. This will permanently delete your account and remove all your data.</span>
            </div>

            <div class="form-control">
              <label class="label" for="delete_confirm">
                <span class="label-text">Type <strong>DELETE</strong> to confirm</span>
              </label>
              <input
                type="text"
                id="delete_confirm"
                bind:value={deleteConfirmText}
                class="input input-bordered"
                placeholder="DELETE"
              />
            </div>

            <div class="flex gap-2">
              <button
                type="button"
                class="btn btn-ghost"
                onclick={() => {
                  showDeleteConfirm = false;
                  deleteConfirmText = '';
                  error = '';
                }}
              >
                Cancel
              </button>
              <form method="POST" action="?/deleteAccount" use:enhance>
                <button
                  type="submit"
                  class="btn btn-error"
                  disabled={deleteConfirmText !== 'DELETE'}
                  onclick={handleDeleteAccount}
                >
                  Permanently Delete Account
                </button>
              </form>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>
