<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { activeFamily } from '$lib/stores/familyStore';
	import { onMount } from 'svelte';
	import * as m from '$paraglide/messages';
	import { getLocale } from '$paraglide/runtime';

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

	let dialog: HTMLDialogElement;
	let familyName = $state('');
	let showInvitationSuccess = $state(false);
	let submitting = $state(false);
	let createError = $state('');

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
		createError = '';
	}
</script>

<div class="container mx-auto max-w-6xl px-4 py-6 sm:p-8">
	<div class="mb-8 flex flex-wrap items-center justify-between gap-4">
		<div>
			<h1 class="text-3xl font-bold sm:text-4xl">{m['app_nav.families']()}</h1>
			<p class="mt-2 text-base-content/70">{m['families.description']()}</p>
		</div>
		<button onclick={() => dialog.showModal()} class="btn gap-2 btn-primary">
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
			{m['families.create']()}
		</button>
	</div>

	{#if showInvitationSuccess}
		<div class="mb-6 alert alert-success" role="status">
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
			<span>{m['families.invitation_accepted']()}</span>
		</div>
	{/if}

	{#if form?.success}
		<div class="mb-6 alert alert-success" role="status">
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
			<span>{m['families.created']()}</span>
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
				<h2 class="mb-2 card-title text-2xl">{m['families.empty']()}</h2>
				<p class="mb-6 text-base-content/70">
					{m['families.empty_description']()}
				</p>
				<button onclick={() => dialog.showModal()} class="btn gap-2 btn-primary">
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
					{m['families.create']()}
				</button>
			</div>
		</div>
	{:else}
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
			{#each data.families as family (family.id)}
				<div class="card min-w-0 bg-base-100 shadow-sm">
					<div class="card-body">
						<div class="mb-2 flex flex-wrap items-start justify-between gap-2">
							<h2 class="card-title text-2xl break-words">{family.name}</h2>
							{#if family.isOwner}
								<div class="badge badge-primary">{m['app_nav.owner']()}</div>
							{:else}
								<div class="badge badge-secondary">
									{family.role === 'admin' ? m['app_nav.admin_role']() : m['app_nav.member']()}
								</div>
							{/if}
						</div>

						<div class="mt-4 flex flex-col gap-2">
							<div class="flex items-center gap-2 text-sm">
								<span class="text-lg">👥</span>
								<span
									>{family.memberCount === 1
										? m['families.member_one']({ count: family.memberCount })
										: m['families.member_many']({ count: family.memberCount })}</span
								>
							</div>
							<div class="flex items-center gap-2 text-sm text-base-content/70">
								<span class="text-lg">📅</span>
								<span
									>{m['families.joined']({
										date: new Date(family.joinedAt).toLocaleDateString(getLocale())
									})}</span
								>
							</div>
						</div>

						<div class="mt-4 card-actions justify-end">
							<button
								type="button"
								class="btn gap-2 btn-sm btn-primary"
								onclick={() => openFamily(family)}
							>
								{m['families.open']()}
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
<dialog class="modal" bind:this={dialog} aria-labelledby="create-family-title" onclose={resetForm}>
	<div class="modal-box">
		<h2 id="create-family-title" class="mb-4 text-lg font-bold">{m['families.create']()}</h2>

		<form
			method="POST"
			action="?/createFamily"
			use:enhance={({ cancel }) => {
				if (submitting) {
					cancel();
					return;
				}
				submitting = true;
				createError = '';
				return async ({ result, update }) => {
					try {
						await update();
						if (result.type === 'success') dialog.close();
						else
							createError =
								result.type === 'failure' && typeof result.data?.message === 'string'
									? result.data.message
									: m['families.error']();
					} catch {
						createError = m['families.error']();
					} finally {
						submitting = false;
					}
				};
			}}
		>
			<div class="form-control">
				<label class="label" for="name">
					<span class="label-text">{m['families.name']()}</span>
				</label>
				<input
					id="name"
					name="name"
					type="text"
					class="input w-full"
					bind:value={familyName}
					required
					maxlength={80}
				/>
			</div>

			{#if createError}<p class="mt-3 text-sm text-error" role="alert">{createError}</p>{/if}
			<div class="modal-action">
				<button type="button" class="btn btn-ghost" onclick={() => dialog.close()}
					>{m['families.cancel']()}</button
				>
				<button type="submit" class="btn btn-primary" disabled={submitting}>
					{submitting ? m['families.creating']() : m['families.create']()}
				</button>
			</div>
		</form>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button aria-label={m['families.cancel']()}>{m['families.cancel']()}</button>
	</form>
</dialog>
