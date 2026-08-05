<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { activeFamily } from '$lib/stores/familyStore';
	import { onMount } from 'svelte';

	interface Props {
		data: {
			families: Array<{
				id: string;
				name: string;
				role: string;
				memberCount: number;
				joinedAt: string;
				isOwner: boolean;
			}>;
		};
		form: any;
	}

	let { data, form }: Props = $props();

	let showCreateModal = $state(false);
	let familyName = $state('');
	let showInvitationSuccess = $state(false);

	onMount(() => {
		// Check if redirected from accepting an invitation
		const urlParams = new URLSearchParams(window.location.search);
		if (urlParams.get('invitation_accepted') === 'true') {
			showInvitationSuccess = true;
			// Remove the query parameter from URL
			const newUrl = window.location.pathname;
			window.history.replaceState({}, '', newUrl);

			// Hide the message after 5 seconds
			setTimeout(() => {
				showInvitationSuccess = false;
			}, 5000);
		}
	});

	function openFamily(family: { id: string; name: string; role: string }) {
		activeFamily.set(family);
		goto(`/family/${family.id}`);
	}

	function resetForm() {
		familyName = '';
		showCreateModal = false;
	}
</script>

<div class="container mx-auto max-w-6xl p-8">
	<div class="mb-8 flex items-center justify-between">
		<div>
			<h1 class="text-4xl font-bold">My Families</h1>
			<p class="mt-2 text-base-content/70">Manage your family groups</p>
		</div>
		<button onclick={() => (showCreateModal = true)} class="btn gap-2 btn-primary">
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
			Create Family
		</button>
	</div>

	{#if showInvitationSuccess}
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
			<span>Invitation accepted successfully! Welcome to the family.</span>
		</div>
	{/if}

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
			<span>Family created successfully!</span>
		</div>
	{/if}

	{#if form?.message}
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

	<!-- Loading skeletons while data loads -->
	{#if !data.families}
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
			{#each Array(3) as _}
				<div class="card bg-base-100 shadow-xl">
					<div class="card-body">
						<div class="mb-2 flex items-start justify-between">
							<div class="h-8 w-32 skeleton"></div>
							<div class="h-6 w-16 skeleton"></div>
						</div>

						<div class="mt-4 flex flex-col gap-2">
							<div class="h-5 w-24 skeleton"></div>
							<div class="h-5 w-32 skeleton"></div>
						</div>

						<div class="mt-4 card-actions justify-end">
							<div class="h-8 w-28 skeleton"></div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{:else if data.families.length === 0}
		<div class="card bg-base-100 shadow-xl">
			<div class="card-body items-center py-16 text-center">
				<div class="mb-4 text-6xl">👨‍👩‍👧‍👦</div>
				<h2 class="mb-2 card-title text-2xl">No families yet</h2>
				<p class="mb-6 text-base-content/70">
					Create your first family to start organizing events, expenses, and more!
				</p>
				<button onclick={() => (showCreateModal = true)} class="btn gap-2 btn-primary">
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
					Create Your First Family
				</button>
			</div>
		</div>
	{:else}
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
			{#each data.families as family}
				<div
					class="card cursor-pointer bg-base-100 shadow-xl transition-all hover:shadow-2xl"
					onclick={() => openFamily(family)}
				>
					<div class="card-body">
						<div class="mb-2 flex items-start justify-between">
							<h2 class="card-title text-2xl">{family.name}</h2>
							{#if family.isOwner}
								<div class="badge badge-primary">Owner</div>
							{:else}
								<div class="badge badge-secondary">{family.role}</div>
							{/if}
						</div>

						<div class="mt-4 flex flex-col gap-2">
							<div class="flex items-center gap-2 text-sm">
								<span class="text-lg">👥</span>
								<span>{family.memberCount} {family.memberCount === 1 ? 'member' : 'members'}</span>
							</div>
							<div class="flex items-center gap-2 text-sm text-base-content/70">
								<span class="text-lg">📅</span>
								<span>Joined {new Date(family.joinedAt).toLocaleDateString()}</span>
							</div>
						</div>

						<div class="mt-4 card-actions justify-end">
							<button class="btn gap-2 btn-sm btn-primary">
								Open Family
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-4 w-4"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M9 5l7 7-7 7"
									/>
								</svg>
							</button>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<!-- Create Family Modal -->
{#if showCreateModal}
	<div class="modal-open modal">
		<div class="modal-box">
			<h3 class="mb-4 text-lg font-bold">Create New Family</h3>

			<form
				method="POST"
				action="?/createFamily"
				use:enhance={() => {
					return async ({ result, update }) => {
						await update();
						if (result.type === 'success') {
							resetForm();
						}
					};
				}}
			>
				<div class="form-control">
					<label class="label" for="name">
						<span class="label-text">Family Name</span>
					</label>
					<input
						id="name"
						name="name"
						type="text"
						placeholder="e.g., Smith Family"
						class="input-bordered input"
						bind:value={familyName}
						required
					/>
				</div>

				<div class="modal-action">
					<button type="button" class="btn btn-ghost" onclick={resetForm}> Cancel </button>
					<button type="submit" class="btn btn-primary"> Create </button>
				</div>
			</form>
		</div>
		<div class="modal-backdrop" onclick={resetForm}></div>
	</div>
{/if}
