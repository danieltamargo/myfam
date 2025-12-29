<script lang="ts">
  import { enhance } from '$app/forms';

  interface Props {
    data: {
      user: any;
      invitations: Array<any>;
    };
    form: any;
  }

  let { data, form }: Props = $props();
</script>

<div class="container mx-auto max-w-6xl p-8">
  <div class="mb-8">
    <h1 class="text-4xl font-bold">Welcome back!</h1>
    <p class="text-base-content/70 mt-2">
      Hi {data.user?.email}, this is your dashboard
    </p>
  </div>

  <!-- Success/Error Messages -->
  {#if form?.success}
    <div class="alert alert-success mb-6">
      <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>{form.message}</span>
    </div>
  {/if}

  {#if form?.message && !form?.success}
    <div class="alert alert-error mb-6">
      <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>{form.message}</span>
    </div>
  {/if}

  <!-- Pending Invitations -->
  {#if data.invitations.length > 0}
    <div class="mb-8">
      <h2 class="text-2xl font-bold mb-4 flex items-center gap-2">
        <span>📨</span>
        Pending Invitations
        <span class="badge badge-primary">{data.invitations.length}</span>
      </h2>
      <div class="space-y-3">
        {#each data.invitations as invitation}
          <div class="card bg-base-100 shadow-xl border-2 border-primary">
            <div class="card-body">
              <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div class="flex-1">
                  <h3 class="font-semibold text-lg">
                    Invitation to join <span class="text-primary">{invitation.family?.name || 'Unknown Family'}</span>
                  </h3>
                  <p class="text-sm text-base-content/70 mt-1">
                    Invited by {invitation.invited_by?.display_name || invitation.invited_by?.email || 'Unknown'} •
                    {new Date(invitation.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div class="flex gap-2">
                  <form method="POST" action="?/acceptInvitation" use:enhance>
                    <input type="hidden" name="invitation_id" value={invitation.id} />
                    <button type="submit" class="btn btn-success btn-sm gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                      </svg>
                      Accept
                    </button>
                  </form>
                  <form method="POST" action="?/rejectInvitation" use:enhance>
                    <input type="hidden" name="invitation_id" value={invitation.id} />
                    <button type="submit" class="btn btn-ghost btn-sm gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                      </svg>
                      Decline
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    <!-- Families Card -->
    <div class="card bg-base-100 shadow-xl hover:shadow-2xl transition-shadow">
      <div class="card-body">
        <h2 class="card-title">
          <span class="text-3xl">👨‍👩‍👧‍👦</span>
          Families
        </h2>
        <p class="text-base-content/70">Manage your family groups and members</p>
        <div class="card-actions justify-end mt-4">
          <a href="/families" class="btn btn-primary btn-sm">View Families</a>
        </div>
      </div>
    </div>

    <!-- Wishlist Card -->
    <div class="card bg-base-100 shadow-xl hover:shadow-2xl transition-shadow">
      <div class="card-body">
        <h2 class="card-title">
          <span class="text-3xl">🎁</span>
          Wishlist
        </h2>
        <p class="text-base-content/70">Gift registry and shopping lists</p>
        <div class="card-actions justify-end mt-4">
          <a href="/families" class="btn btn-primary btn-sm">Go to Families</a>
        </div>
      </div>
    </div>

    <!-- Profile Card -->
    <div class="card bg-base-100 shadow-xl hover:shadow-2xl transition-shadow">
      <div class="card-body">
        <h2 class="card-title">
          <span class="text-3xl">⚙️</span>
          Profile
        </h2>
        <p class="text-base-content/70">Manage your account settings</p>
        <div class="card-actions justify-end mt-4">
          <a href="/profile" class="btn btn-primary btn-sm">View Profile</a>
        </div>
      </div>
    </div>
  </div>

  <!-- Recent Activity -->
  <div class="mt-8">
    <h2 class="text-2xl font-bold mb-4">Recent Activity</h2>
    <div class="card bg-base-100 shadow-xl">
      <div class="card-body">
        <div class="flex flex-col gap-4">
          <div class="flex items-center gap-4 p-4 bg-base-200 rounded-lg">
            <div class="text-2xl">👋</div>
            <div class="flex-1">
              <p class="font-semibold">Welcome to MyFamily!</p>
              <p class="text-sm text-base-content/70">Get started by creating your first family</p>
            </div>
            <div class="text-xs text-base-content/50">Just now</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
