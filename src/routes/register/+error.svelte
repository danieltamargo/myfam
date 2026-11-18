<script lang="ts">
	import * as messages from '$paraglide/messages';
	import { resolve } from '$app/paths';
</script>

<svelte:head><title>{messages['ui.private_access']()} · MyFamily</title></svelte:head>

<main class="flex min-h-screen items-center justify-center bg-base-200 p-4">
	<div class="card w-full max-w-md bg-base-100">
		<div class="card-body">
			<h1 class="card-title">{messages['ui.private_access']()}</h1>
			<p>{messages['screen.registration_is_closed_ask_an_administrator_for_access']()}</p>
			<a href={resolve('/login')} class="btn mt-4 btn-primary">{messages['nav.login']()}</a>
		</div>
	</div>
</main>
