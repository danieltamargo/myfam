<script lang="ts">
	import * as messages from '$paraglide/messages';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';

	// Get error details
	const errorStatus = $derived($page.status);

	function goToDashboard() {
		goto('/dashboard');
	}

	function goBack() {
		history.back();
	}
</script>

<div class="flex min-h-screen items-center justify-center bg-base-200">
	<div class="card w-full max-w-2xl bg-base-100 shadow-xl">
		<div class="card-body items-center text-center">
			<!-- Error Icon -->
			<div class="mb-4">
				{#if errorStatus === 404}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-24 w-24 text-warning"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<circle cx="12" cy="12" r="10"></circle>
						<path d="M16 16s-1.5-2-4-2-4 2-4 2"></path>
						<line x1="9" y1="9" x2="9.01" y2="9"></line>
						<line x1="15" y1="9" x2="15.01" y2="9"></line>
					</svg>
				{:else if errorStatus === 403}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-24 w-24 text-error"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
						<path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
					</svg>
				{:else}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-24 w-24 text-error"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path
							d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
						></path>
						<line x1="12" y1="9" x2="12" y2="13"></line>
						<line x1="12" y1="17" x2="12.01" y2="17"></line>
					</svg>
				{/if}
			</div>

			<!-- Error Status -->
			<h1 class="mb-2 text-6xl font-bold text-base-content">
				{errorStatus}
			</h1>

			<!-- Error Title -->
			<h2 class="mb-4 text-2xl font-semibold">
				{#if errorStatus === 404}
					{messages['error_page.not_found']()}
				{:else if errorStatus === 403}
					{messages['error_page.forbidden']()}
				{:else if errorStatus === 401}
					{messages['error_page.sign_in']()}
				{:else}
					{messages['error_page.unavailable']()}
				{/if}
			</h2>

			<!-- Error Message -->
			<p class="mb-6 max-w-md text-base-content/70">
				{#if errorStatus === 404}
					{messages['error_page.not_found_detail']()}
				{:else if errorStatus === 403}
					{messages['error_page.forbidden_detail']()}
				{:else if errorStatus === 401}
					{messages['error_page.sign_in_detail']()}
				{:else}
					{messages['error_page.unavailable_detail']()}
				{/if}
			</p>

			<!-- Actions -->
			<div class="card-actions gap-3">
				<button class="btn gap-2 btn-ghost" onclick={goBack}>
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
						<line x1="19" y1="12" x2="5" y2="12"></line>
						<polyline points="12 19 5 12 12 5"></polyline>
					</svg>
					{messages['ui.go_back']()}
				</button>
				<button class="btn gap-2 btn-primary" onclick={goToDashboard}>
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
						<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
						<polyline points="9 22 9 12 15 12 15 22"></polyline>
					</svg>
					{messages['ui.go_to_dashboard']()}
				</button>
			</div>
		</div>
	</div>
</div>
