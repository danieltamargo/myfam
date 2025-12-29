<script lang="ts">
  import { enhance } from '$app/forms';

  interface Props {
    data: {
      members: Array<{
        userId: string;
        role: string;
        joinedAt: string;
        displayName: string;
        avatarUrl?: string;
      }>;
      invitations: Array<any>;
      currentUserId?: string;
      userRole: string;
    };
    form: any;
  }

  let { data, form }: Props = $props();

  let showInviteModal = $state(false);
  let inviteEmail = $state('');
  let editingRole = $state<string | null>(null);

  const canManageMembers = $derived(data.userRole === 'owner' || data.userRole === 'admin');
  const isOwner = $derived(data.userRole === 'owner');

  function resetInviteForm() {
    inviteEmail = '';
    showInviteModal = false;
  }

  const roleColors: Record<string, string> = {
    owner: 'badge-primary',
    admin: 'badge-secondary',
    member: 'badge-ghost'
  };

  const roleIcons: Record<string, string> = {
    owner: '👑',
    admin: '⚡',
    member: '👤'
  };
</script>

<div>
  <div class="flex justify-between items-center mb-6 gap-2">
    <div>
      <h2 class="text-2xl font-bold">Family Members</h2>
      <p class="text-base-content/70">This is your crew <span class="text-base-content">👨‍👩‍👧‍👦</span></p>
    </div>
    {#if canManageMembers}
      <button onclick={() => showInviteModal = true} class="btn btn-primary gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        Invite Member
      </button>
    {/if}
  </div>

  {#if form?.success}
    <div class="alert alert-success mb-6">
      <span>✓ {form.message || 'Action completed successfully'}</span>
    </div>
  {/if}

  {#if form?.message && !form?.success}
    <div class="alert alert-error mb-6">
      <span>{form.message}</span>
    </div>
  {/if}

  <!-- Pending Invitations -->
  {#if data.invitations.length > 0 && canManageMembers}
    <div class="mb-8">
      <h3 class="text-lg font-semibold mb-3">Pending Invitations</h3>
      <div class="space-y-2">
        {#each data.invitations as invitation}
          <div class="alert alert-info">
            <span>
              Invitation sent to <strong>{invitation.invited_user?.email || 'unknown user'}</strong> •
              {new Date(invitation.created_at).toLocaleDateString()}
            </span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Members List -->
  <div class="space-y-4 flex gap-4 items-stretch flex-wrap">
    {#each data.members as member}
      <div class="card relative flex-1 min-w-75 md:w-96 max-w-full bg-base-100 mb-0 shadow-md hover:shadow-lg transition-shadow">
        <div class="card-body mt-6">
            <div class="flex items-center gap-4">
              <!-- Avatar -->
              <div class="avatar">
                <div class="w-12 h-12 rounded-full ring ring-primary ring-offset-base-100 ring-offset-2">
                  {#if member.avatarUrl}
                    <img
                      src={member.avatarUrl}
                      alt={member.displayName}
                      referrerpolicy="no-referrer"
                      crossorigin="anonymous"
                    />
                  {:else}
                    <div class="bg-primary text-primary-content w-full h-full flex items-center justify-center text-lg font-bold">
                      {member.displayName[0]?.toUpperCase() || '?'}
                    </div>
                  {/if}
                </div>
              </div>

              <!-- Member Info -->
              <div class="badge absolute top-2 right-2 {roleColors[member.role]} gap-2 px-4 py-3">
                <span>{roleIcons[member.role]}</span>
                {member.role}
              </div>
              {#if member.userId === data.currentUserId}
                <span class="absolute top-2 left-2 text-sm text-base-content/70">(You)</span>
              {/if}
              <div>
                <h3 class="font-semibold text-lg">
                  {member.displayName}
                </h3>
                <p class="text-sm text-base-content/70">
                  Joined {new Date(member.joinedAt).toLocaleDateString()}
                </p>
              </div>
            </div>

            <!-- Role & Actions -->
            {#if isOwner && member.userId !== data.currentUserId}
              <div class="mt-2 flex justify-end items-center gap-3">
                <!-- Role selector for owners -->
                <form method="POST" action="?/updateRole" use:enhance>
                  <input type="hidden" name="userId" value={member.userId} />
                  <select
                    name="role"
                    class="select select-bordered select-sm"
                    value={member.role}
                    onchange={(e) => (e.target as HTMLFormElement).form?.requestSubmit()}
                  >
                    <option value="owner">👑 Owner</option>
                    <option value="admin">⚡ Admin</option>
                    <option value="member">👤 Member</option>
                  </select>
                </form>

                <!-- Remove button -->
                <form method="POST" action="?/removeMember" use:enhance={() => {
                  return async ({ result, update }) => {
                    if (confirm('Are you sure you want to remove this member?')) {
                      await update();
                    }
                  };
                }}>
                  <input type="hidden" name="userId" value={member.userId} />
                  <button type="submit" class="btn btn-ghost btn-sm btn-circle text-error">
                    ✕
                  </button>
                </form>
              </div>
            {/if}
        </div>
      </div>
    {/each}
  </div>

  <!-- Role Explanation -->
  <div class="mt-8 card bg-base-200">
    <div class="card-body">
      <h3 class="font-semibold mb-3">About Roles</h3>
      <div class="space-y-2 text-sm">
        <div class="flex gap-3">
          <span class="badge badge-primary">👑 Owner</span>
          <span class="text-base-content/70">Full control over family, can manage all settings and members</span>
        </div>
        <div class="flex gap-3">
          <span class="badge badge-secondary">⚡ Admin</span>
          <span class="text-base-content/70">Can invite members and manage most family features</span>
        </div>
        <div class="flex gap-3">
          <span class="badge badge-ghost">👤 Member</span>
          <span class="text-base-content/70">Can view and participate in family activities</span>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- Invite Member Modal -->
{#if showInviteModal}
  <div class="modal modal-open">
    <div class="modal-box">
      <h3 class="font-bold text-lg mb-4">Invite Family Member</h3>

      <form method="POST" action="?/inviteMember" use:enhance={() => {
        return async ({ result, update }) => {
          await update();
          if (result.type === 'success') {
            resetInviteForm();
          }
        };
      }}>
        <div class="form-control">
          <label class="label" for="email">
            <span class="label-text">Email Address</span>
          </label>
          <input
            id="email"
            name="email"
            type="email"
            placeholder="user@example.com"
            class="input input-bordered"
            bind:value={inviteEmail}
            required
          />
          <label class="label" for="email">
            <span class="label-text-alt">The user must have an account to receive the invitation</span>
          </label>
        </div>

        <div class="modal-action">
          <button
            type="button"
            class="btn btn-ghost"
            onclick={resetInviteForm}
          >
            Cancel
          </button>
          <button type="submit" class="btn btn-primary">
            Send Invitation
          </button>
        </div>
      </form>
    </div>
    <div class="modal-backdrop" onclick={resetInviteForm}></div>
  </div>
{/if}
