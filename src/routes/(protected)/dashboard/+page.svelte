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
		<p class="mt-2 text-base-content/70">
			Hi {data.user?.email}, this is your dashboard
		</p>
	</div>

	<!-- Success/Error Messages -->
	{#if form?.success}
		<div class="mb-6 alert alert-success">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6 shrink-0 stroke-current"
				fill="none"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<span>{form.message}</span>
		</div>
	{/if}

	{#if form?.message && !form?.success}
		<div class="mb-6 alert alert-error">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6 shrink-0 stroke-current"
				fill="none"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<span>{form.message}</span>
		</div>
	{/if}

	<!-- Pending Invitations -->
	{#if data.invitations.length > 0}
		<div class="mb-8">
			<h2 class="mb-4 flex items-center gap-2 text-2xl font-bold">
				<span>📨</span>
				Pending Invitations
				<span class="badge badge-primary">{data.invitations.length}</span>
			</h2>
			<div class="space-y-3">
				{#each data.invitations as invitation}
					<div class="card border-2 border-primary bg-base-100 shadow-xl">
						<div class="card-body">
							<div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
								<div class="flex-1">
									<h3 class="text-lg font-semibold">
										Invitation to join <span class="text-primary"
											>{invitation.family?.name || 'Unknown Family'}</span
										>
									</h3>
									<p class="mt-1 text-sm text-base-content/70">
										Invited by {invitation.invited_by?.display_name ||
											invitation.invited_by?.email ||
											'Unknown'} •
										{new Date(invitation.created_at).toLocaleDateString()}
									</p>
								</div>
								<div class="flex gap-2">
									<form method="POST" action="?/acceptInvitation" use:enhance>
										<input type="hidden" name="invitation_id" value={invitation.id} />
										<button type="submit" class="btn gap-2 btn-sm btn-success">
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="h-4 w-4"
												viewBox="0 0 20 20"
												fill="currentColor"
											>
												<path
													fill-rule="evenodd"
													d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
													clip-rule="evenodd"
												/>
											</svg>
											Accept
										</button>
									</form>
									<form method="POST" action="?/rejectInvitation" use:enhance>
										<input type="hidden" name="invitation_id" value={invitation.id} />
										<button type="submit" class="btn gap-2 btn-ghost btn-sm">
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="h-4 w-4"
												viewBox="0 0 20 20"
												fill="currentColor"
											>
												<path
													fill-rule="evenodd"
													d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
													clip-rule="evenodd"
												/>
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

	<div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
		<!-- Families Card -->
		<div class="card bg-base-100 shadow-xl transition-shadow hover:shadow-2xl">
			<div class="card-body">
				<h2 class="card-title">
					<span class="text-3xl">👨‍👩‍👧‍👦</span>
					Families
				</h2>
				<p class="text-base-content/70">Manage your family groups and members</p>
				<div class="mt-4 card-actions justify-end">
					<a href="/families" class="btn btn-sm btn-primary">View Families</a>
				</div>
			</div>
		</div>

		<!-- Profile Card -->
		<div class="card bg-base-100 shadow-xl transition-shadow hover:shadow-2xl">
			<div class="card-body">
				<h2 class="card-title">
					<span class="text-3xl">⚙️</span>
					Profile
				</h2>
				<p class="text-base-content/70">Manage your account settings</p>
				<div class="mt-4 card-actions justify-end">
					<a href="/profile" class="btn btn-sm btn-primary">View Profile</a>
				</div>
			</div>
		</div>
	</div>

	<!-- Recent Activity -->
	<div class="mt-8">
		<h2 class="mb-4 text-2xl font-bold">Recent Activity</h2>
		<div class="card bg-base-100 shadow-xl">
			<div class="card-body">
				<div class="flex flex-col gap-4">
					<div class="flex items-center gap-4 rounded-lg bg-base-200 p-4">
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
