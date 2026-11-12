<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import ConfirmationModal from '$lib/components/modals/ConfirmationModal.svelte';
	import * as m from '$paraglide/messages';
	import { getLocale } from '$paraglide/runtime';

	interface Props {
		data: {
			members: Array<{
				userId: string;
				role: string;
				canManageMembers: boolean;
				canConfigureModules: boolean;
				joinedAt: string;
				displayName: string;
				avatarUrl?: string;
			}>;
			invitations: Array<any>;
			currentUserId?: string;
			userRole: string;
			canManageMembers: boolean;
		};
		form: any;
	}

	let { data, form }: Props = $props();

	let inviteDialog = $state<HTMLDialogElement>();
	let inviting = $state(false);
	let inviteError = $state('');
	let ready = $state(false);
	onMount(() => {
		ready = true;
	});
	let inviteEmail = $state('');
	let editingRole = $state<string | null>(null);
	let showDeleteModal = $state(false);
	let memberToDelete = $state<{ userId: string; displayName: string } | null>(null);
	let showLeaveModal = $state(false);
	let showTransferOwnershipModal = $state(false);
	let ownershipTransfer = $state<{ userId: string; displayName: string } | null>(null);

	const canManageMembers = $derived(data.canManageMembers);
	const isOwner = $derived(data.userRole === 'owner');
	const canLeave = $derived(!isOwner); // Non-owners can leave

	function resetInviteForm() {
		inviteEmail = '';
		inviteError = '';
	}

	function openDeleteModal(userId: string, displayName: string) {
		memberToDelete = { userId, displayName };
		showDeleteModal = true;
	}

	async function handleDeleteConfirm() {
		if (memberToDelete) {
			submitHiddenForm('delete-member-form');
		}
	}

	function submitHiddenForm(id: string) {
		const formElement = document.getElementById(id);
		if (formElement instanceof HTMLFormElement) formElement.requestSubmit();
	}

	function handleRoleChange(event: Event, userId: string, displayName: string) {
		const target = event.target as HTMLSelectElement;
		const newRole = target.value;

		// If trying to transfer ownership, show confirmation modal
		if (newRole === 'owner') {
			// Reset select to previous value
			target.value = data.members.find((m) => m.userId === userId)?.role || 'member';

			// Open transfer modal
			ownershipTransfer = { userId, displayName };
			showTransferOwnershipModal = true;
		} else {
			// For non-owner roles, submit directly
			(target.form as HTMLFormElement)?.requestSubmit();
		}
	}

	async function handleTransferOwnership() {
		if (ownershipTransfer) {
			submitHiddenForm('transfer-ownership-form');
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
	<div class="mb-6 flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="text-2xl font-bold">{m['members.title']()}</h1>
			<p class="text-base-content/70">{m['members.intro']()}</p>
		</div>
		{#if canManageMembers}
			<button
				disabled={!ready}
				onclick={() => inviteDialog?.showModal()}
				class="btn gap-2 btn-primary"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<line x1="12" y1="5" x2="12" y2="19"></line>
					<line x1="5" y1="12" x2="19" y2="12"></line>
				</svg>
				{m['members.invite']()}
			</button>
		{/if}
	</div>

	{#if form?.success}
		<div class="mb-6 alert alert-success">
			<span>✓ {form.message || 'Action completed successfully'}</span>
		</div>
	{/if}

	{#if form?.message && !form?.success}
		<div class="mb-6 alert alert-error">
			<span>{form.message}</span>
		</div>
	{/if}

	<!-- Pending Invitations -->
	{#if data.invitations.length > 0 && canManageMembers}
		<div class="mb-8">
			<h2 class="mb-3 text-lg font-semibold">{m['members.pending']()}</h2>
			<div class="space-y-2">
				{#each data.invitations as invitation (invitation.id)}
					<div class="alert alert-info">
						<span>
							Invitation sent to <strong>{invitation.invited_user?.email || 'unknown user'}</strong>
							•
							{new Date(invitation.created_at).toLocaleDateString()}
						</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Members List -->
	<div class="flex flex-wrap items-stretch gap-4 space-y-4">
		{#each data.members as member (member.userId)}
			<div
				class="card relative mb-0 max-w-full min-w-75 flex-1 bg-base-100 shadow-md transition-shadow hover:shadow-lg md:w-96 {member.userId ===
				data.currentUserId
					? 'bg-primary/5 ring-2 ring-primary ring-offset-2'
					: ''}"
			>
				<div class="mt-6 card-body">
					<div class="flex items-center gap-4">
						<!-- Avatar -->
						<div class="avatar">
							<div
								class="h-12 w-12 rounded-full ring ring-primary ring-offset-2 ring-offset-base-100"
							>
								{#if member.avatarUrl}
									<img
										src={member.avatarUrl}
										alt={member.displayName}
										referrerpolicy="no-referrer"
										crossorigin="anonymous"
									/>
								{:else}
									<div
										class="flex h-full w-full items-center justify-center bg-primary text-lg font-bold text-primary-content"
									>
										{member.displayName[0]?.toUpperCase() || '?'}
									</div>
								{/if}
							</div>
						</div>

						<!-- Member Info -->
						<div class="absolute top-2 right-2 badge {roleColors[member.role]} gap-2 px-2 py-1">
							<span>{roleIcons[member.role]}</span>
							{member.role === 'owner'
								? m['app_nav.owner']()
								: member.role === 'admin'
									? m['app_nav.admin_role']()
									: m['app_nav.member']()}
						</div>
						{#if member.userId === data.currentUserId}
							<span class="absolute top-2 left-2 text-sm text-base-content/70"
								>{m['members.you']()}</span
							>
						{/if}
						<div class="min-w-0">
							<h3 class="text-lg font-semibold break-words">
								{member.displayName}
							</h3>
							<p class="text-sm text-base-content/70">
								{m['families.joined']({
									date: new Date(member.joinedAt).toLocaleDateString(getLocale())
								})}
							</p>
						</div>
					</div>

					{#if isOwner && member.role === 'member'}
						<form method="POST" action="?/setCapabilities" use:enhance class="mt-4 space-y-3">
							<input type="hidden" name="userId" value={member.userId} />
							<fieldset class="space-y-2">
								<legend class="font-semibold">Permisos delegados</legend>
								<label class="flex items-center gap-2">
									<input
										class="checkbox checkbox-sm"
										type="checkbox"
										name="manageMembers"
										checked={member.canManageMembers}
									/>
									Gestionar miembros
								</label>
								<label class="flex items-center gap-2">
									<input
										class="checkbox checkbox-sm"
										type="checkbox"
										name="configureModules"
										checked={member.canConfigureModules}
									/>
									Configurar módulos
								</label>
							</fieldset>
							<button class="btn btn-sm" type="submit">Guardar permisos</button>
						</form>
					{/if}
					{#if canManageMembers && !isOwner && member.role === 'member' && member.userId !== data.currentUserId}
						<button
							class="btn text-error btn-ghost btn-sm"
							onclick={() => openDeleteModal(member.userId, member.displayName)}
							>Retirar miembro</button
						>
					{/if}
					<!-- Role & Actions -->
					{#if isOwner && member.userId !== data.currentUserId}
						<div class="mt-2 flex items-center justify-end gap-3">
							<!-- Role selector for owners -->
							<form method="POST" action="?/updateRole" use:enhance>
								<input type="hidden" name="userId" value={member.userId} />
								<select
									name="role"
									class="select-bordered select select-sm"
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
								class="btn btn-circle text-error btn-ghost btn-sm"
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
				<h3 class="mb-3 font-semibold">About Roles</h3>
				<div class="space-y-2 text-sm">
					<div class="flex gap-3">
						<span class="badge badge-primary">👑 Owner</span>
						<span class="text-base-content/70"
							>Full control over family, can manage all settings and members</span
						>
					</div>
					<div class="flex gap-3">
						<span class="badge badge-secondary">⚡ Admin</span>
						<span class="text-base-content/70"
							>Can invite members and manage most family features</span
						>
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
			<div class="card border-2 border-error/20 bg-base-200">
				<div class="card-body">
					<h3 class="mb-2 font-semibold text-error">Leave Family</h3>
					<p class="mb-4 text-sm text-base-content/70">
						If you leave this family, you will lose access to all family data, wishlists, and shared
						content. You can only rejoin if invited again by an owner or admin.
					</p>
					<button
						class="btn w-full gap-2 btn-outline btn-error sm:w-auto"
						onclick={() => (showLeaveModal = true)}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
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
{#if canManageMembers}
	<dialog
		class="modal"
		bind:this={inviteDialog}
		aria-labelledby="invite-member-title"
		onclose={resetInviteForm}
	>
		<div class="modal-box">
			<h2 id="invite-member-title" class="mb-4 text-lg font-bold">{m['members.invite']()}</h2>

			<form
				method="POST"
				action="?/inviteMember"
				use:enhance={({ cancel }) => {
					if (inviting) {
						cancel();
						return;
					}
					inviting = true;
					inviteError = '';
					return async ({ result, update }) => {
						try {
							if (result.type === 'success') {
								await update();
								inviteDialog?.close();
							} else {
								inviteError =
									result.type === 'failure' && typeof result.data?.message === 'string'
										? result.data.message
										: m['members.invite_error']();
							}
						} catch {
							inviteError = m['members.invite_error']();
						} finally {
							inviting = false;
						}
					};
				}}
			>
				<div class="form-control">
					<label class="label" for="email">
						<span class="label-text">{m['auth.email']()}</span>
					</label>
					<input
						id="email"
						name="email"
						type="email"
						placeholder="user@example.com"
						class="input w-full"
						bind:value={inviteEmail}
						aria-describedby="invite-account-hint"
						autocomplete="email"
						maxlength={254}
						required
					/>
					<p id="invite-account-hint" class="mt-2 text-sm text-base-content/70">
						{m['members.invite_hint']()}
					</p>
				</div>
				{#if inviteError}<p class="mt-3 text-sm text-error" role="alert">{inviteError}</p>{/if}

				<div class="modal-action">
					<button type="button" class="btn btn-ghost" onclick={() => inviteDialog?.close()}
						>{m['families.cancel']()}</button
					>
					<button type="submit" class="btn btn-primary" disabled={inviting}>
						{inviting ? m['members.sending']() : m['members.send']()}
					</button>
				</div>
			</form>
		</div>
		<form method="dialog" class="modal-backdrop">
			<button aria-label={m['families.cancel']()} tabindex="-1" aria-hidden="true"></button>
		</form>
	</dialog>
{/if}

<!-- Hidden form for member deletion -->
{#if memberToDelete}
	<form
		id="delete-member-form"
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
		message={`You are about to remove ${memberToDelete.displayName} from your family.`}
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
	id="leave-family-form"
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
	message={`You are about to leave ${
		data.members.find((m) => m.userId === data.currentUserId)?.displayName || 'this'
	} family.`}
	details="You will lose access to all family data, wishlists, and shared content. You can only rejoin if invited again by an owner or admin."
	style="critical"
	icon="logout"
	confirmText="Leave Family"
	require2FA={true}
	onConfirm={() => {
		submitHiddenForm('leave-family-form');
	}}
	onCancel={() => {
		showLeaveModal = false;
	}}
/>

<!-- Hidden form for ownership transfer -->
{#if ownershipTransfer}
	<form
		id="transfer-ownership-form"
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
		message={`You are about to transfer ownership to ${ownershipTransfer.displayName}.`}
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
