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
  <div class="flex justify-between items-center mb-6">
    <div>
      <h2 class="text-2xl font-bold">Family Members</h2>
      <p class="text-base-content/70">Manage who has access to this family</p>
    </div>
    {#if canManageMembers}
      <button onclick={() => showInviteModal = true} class="btn btn-primary gap-2">
        <span>➕</span>
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
              Invitation sent to user •
              {new Date(invitation.created_at).toLocaleDateString()}
            </span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Members List -->
  <div class="space-y-4">
    {#each data.members as member}
      <div class="card bg-base-100 shadow-md hover:shadow-lg transition-shadow">
        <div class="card-body">
          <div class="flex items-center justify-between">
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
              <div>
                <h3 class="font-semibold text-lg">
                  {member.displayName}
                  {#if member.userId === data.currentUserId}
                    <span class="text-sm text-base-content/70">(You)</span>
                  {/if}
                </h3>
                <p class="text-sm text-base-content/70">
                  Joined {new Date(member.joinedAt).toLocaleDateString()}
                </p>
              </div>
            </div>

            <!-- Role & Actions -->
            <div class="flex items-center gap-3">
              {#if isOwner && member.userId !== data.currentUserId}
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
              {:else}
                <!-- Read-only badge -->
                <div class="badge {roleColors[member.role]} gap-2 px-4 py-3">
                  <span>{roleIcons[member.role]}</span>
                  {member.role}
                </div>
              {/if}
            </div>
          </div>
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
