<script lang="ts">
  import { enhance } from '$app/forms';
  import ConfirmationModal from '$lib/components/modals/ConfirmationModal.svelte';

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
  let showDeleteModal = $state(false);
  let memberToDelete = $state<{userId: string; displayName: string} | null>(null);
  let deleteFormRef = $state<HTMLFormElement | null>(null);
  let showLeaveModal = $state(false);
  let leaveFormRef = $state<HTMLFormElement | null>(null);
  let showTransferOwnershipModal = $state(false);
  let ownershipTransfer = $state<{userId: string; displayName: string} | null>(null);
  let transferFormRef = $state<HTMLFormElement | null>(null);

  const canManageMembers = $derived(data.userRole === 'owner' || data.userRole === 'admin');
  const isOwner = $derived(data.userRole === 'owner');
  const canLeave = $derived(!isOwner); // Non-owners can leave

  function resetInviteForm() {
    inviteEmail = '';
    showInviteModal = false;
  }

  function openDeleteModal(userId: string, displayName: string) {
    memberToDelete = { userId, displayName };
    showDeleteModal = true;
  }

  async function handleDeleteConfirm() {
    if (deleteFormRef && memberToDelete) {
      deleteFormRef.requestSubmit();
    }
  }

  function handleRoleChange(event: Event, userId: string, displayName: string) {
    const target = event.target as HTMLSelectElement;
    const newRole = target.value;

    // If trying to transfer ownership, show confirmation modal
    if (newRole === 'owner') {
      // Reset select to previous value
      target.value = data.members.find(m => m.userId === userId)?.role || 'member';

      // Open transfer modal
      ownershipTransfer = { userId, displayName };
      showTransferOwnershipModal = true;
    } else {
      // For non-owner roles, submit directly
      (target.form as HTMLFormElement)?.requestSubmit();
    }
  }

  async function handleTransferOwnership() {
    if (transferFormRef && ownershipTransfer) {
      transferFormRef.requestSubmit();
    }
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
      <div class="card relative flex-1 min-w-75 md:w-96 max-w-full bg-base-100 mb-0 shadow-md hover:shadow-lg transition-shadow {member.userId === data.currentUserId ? 'ring-2 ring-primary ring-offset-2 bg-primary/5' : ''}">
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
              <div class="badge absolute top-2 right-2 {roleColors[member.role]} gap-2 px-2 py-1">
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
                    onchange={(e) => handleRoleChange(e, member.userId, member.displayName)}
                  >
                    <option value="owner">👑 Owner</option>
                    <option value="admin">⚡ Admin</option>
                    <option value="member">👤 Member</option>
                  </select>
                </form>

                <!-- Remove button -->
                <button
                  type="button"
                  class="btn btn-ghost btn-sm btn-circle text-error"
                  onclick={() => openDeleteModal(member.userId, member.displayName)}
                >
                  ✕
                </button>
              </div>
            {/if}
        </div>
      </div>
    {/each}
  </div>

  <!-- Role Explanation & Leave Family -->
  <div class="mt-8 space-y-4">
    <div class="card bg-base-200">
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

    <!-- Leave Family Section -->
    {#if canLeave}
      <div class="card bg-base-200 border-2 border-error/20">
        <div class="card-body">
          <h3 class="font-semibold text-error mb-2">Leave Family</h3>
          <p class="text-sm text-base-content/70 mb-4">
            If you leave this family, you will lose access to all family data, wishlists, and shared content. You can only rejoin if invited again by an owner or admin.
          </p>
          <button
            class="btn btn-error btn-outline gap-2 w-full sm:w-auto"
            onclick={() => showLeaveModal = true}
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            Leave Family
          </button>
        </div>
      </div>
    {/if}
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
          <label class="label mt-2" for="email">
            <span class="text-sm text-base-content/40 label-text-alt">The user must have an account to receive the invitation</span>
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

<!-- Hidden form for member deletion -->
{#if memberToDelete}
  <form
    bind:this={deleteFormRef}
    method="POST"
    action="?/removeMember"
    use:enhance={() => {
      return async ({ result, update }) => {
        await update();
        showDeleteModal = false;
        memberToDelete = null;
      };
    }}
    style="display: none;"
  >
    <input type="hidden" name="userId" value={memberToDelete.userId} />
  </form>
{/if}

<!-- Delete Member Confirmation Modal -->
{#if memberToDelete}
  <ConfirmationModal
    bind:show={showDeleteModal}
    title="Remove Family Member"
    message="You are about to remove <strong class='text-error'>{memberToDelete.displayName}</strong> from your family."
    details="This member will lose access to all family data, wishlists, and shared content immediately."
    style="critical"
    icon="trash"
    confirmText="Remove Member"
    require2FA={true}
    onConfirm={handleDeleteConfirm}
    onCancel={() => {
      showDeleteModal = false;
      memberToDelete = null;
    }}
  />
{/if}

<!-- Hidden form for leaving family -->
<form
  bind:this={leaveFormRef}
  method="POST"
  action="?/leaveFamily"
  use:enhance={() => {
    return async ({ result, update }) => {
      await update();
      showLeaveModal = false;
      // Redirect handled by server action
    };
  }}
  style="display: none;"
>
  <!-- No inputs needed, uses current user session -->
</form>

<!-- Leave Family Confirmation Modal -->
<ConfirmationModal
  bind:show={showLeaveModal}
  title="Leave Family"
  message="You are about to leave <strong class='text-error'>{data.members.find(m => m.userId === data.currentUserId)?.displayName || 'this'} family</strong>."
  details="You will lose access to all family data, wishlists, and shared content. You can only rejoin if invited again by an owner or admin."
  style="critical"
  icon="logout"
  confirmText="Leave Family"
  require2FA={true}
  onConfirm={() => {
    if (leaveFormRef) {
      leaveFormRef.requestSubmit();
    }
  }}
  onCancel={() => {
    showLeaveModal = false;
  }}
/>

<!-- Hidden form for ownership transfer -->
{#if ownershipTransfer}
  <form
    bind:this={transferFormRef}
    method="POST"
    action="?/updateRole"
    use:enhance={() => {
      return async ({ result, update }) => {
        await update();
        showTransferOwnershipModal = false;
        ownershipTransfer = null;
      };
    }}
    style="display: none;"
  >
    <input type="hidden" name="userId" value={ownershipTransfer.userId} />
    <input type="hidden" name="role" value="owner" />
  </form>
{/if}

<!-- Transfer Ownership Confirmation Modal -->
{#if ownershipTransfer}
  <ConfirmationModal
    bind:show={showTransferOwnershipModal}
    title="Transfer Ownership"
    message="You are about to transfer ownership to <strong class='text-primary'>{ownershipTransfer.displayName}</strong>."
    details="This will make them the new owner of this family with full control. Your role will be automatically changed to Admin. This action requires careful consideration and 2FA verification."
    style="critical"
    icon="transfer"
    confirmText="Transfer Ownership"
    require2FA={true}
    onConfirm={handleTransferOwnership}
    onCancel={() => {
      showTransferOwnershipModal = false;
      ownershipTransfer = null;
    }}
  />
{/if}
