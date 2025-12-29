<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';

	// Get error details
	const errorStatus = $derived($page.status);
	const errorMessage = $derived($page.error?.message || 'Something went wrong');

	function goToDashboard() {
		goto('/dashboard');
	}

	function goBack() {
		history.back();
	}
</script>

<div class="min-h-screen flex items-center justify-center bg-base-200">
	<div class="card w-full max-w-2xl bg-base-100 shadow-xl">
		<div class="card-body items-center text-center">
			<!-- Error Icon -->
			<div class="mb-4">
				{#if errorStatus === 404}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="w-24 h-24 text-warning"
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
						class="w-24 h-24 text-error"
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
						class="w-24 h-24 text-error"
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
			<h1 class="text-6xl font-bold text-base-content mb-2">
				{errorStatus}
			</h1>

			<!-- Error Title -->
			<h2 class="text-2xl font-semibold mb-4">
				{#if errorStatus === 404}
					Page Not Found
				{:else if errorStatus === 403}
					Access Denied
				{:else if errorStatus === 401}
					Unauthorized
				{:else if errorStatus === 500}
					Server Error
				{:else}
					Something Went Wrong
				{/if}
			</h2>

			<!-- Error Message -->
			<p class="text-base-content/70 mb-6 max-w-md">
				{#if errorStatus === 404}
					The page you're looking for doesn't exist or you no longer have access to it.
				{:else if errorStatus === 403}
					You don't have permission to access this resource. You may have been removed from the
					family or your role has changed.
				{:else if errorStatus === 401}
					You need to be logged in to access this page.
				{:else}
					{errorMessage}
				{/if}
			</p>

			<!-- Additional info for removed members -->
			{#if errorStatus === 403 || errorStatus === 404}
				<div class="alert alert-info max-w-md mb-6">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="w-5 h-5"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<circle cx="12" cy="12" r="10"></circle>
						<line x1="12" y1="16" x2="12" y2="12"></line>
						<line x1="12" y1="8" x2="12.01" y2="8"></line>
					</svg>
					<span class="text-sm">
						{#if errorStatus === 403}
							If you were recently removed from a family, you'll be redirected to the dashboard.
						{:else}
							The content you're trying to access may have been moved or deleted.
						{/if}
					</span>
				</div>
			{/if}

			<!-- Actions -->
			<div class="card-actions gap-3">
				<button class="btn btn-ghost gap-2" onclick={goBack}>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="w-5 h-5"
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
					Go Back
				</button>
				<button class="btn btn-primary gap-2" onclick={goToDashboard}>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="w-5 h-5"
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
					Go to Dashboard
				</button>
			</div>
		</div>
	</div>
</div>
