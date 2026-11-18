<script lang="ts">
	import * as messages from '$paraglide/messages';
</script>

<div class="flex min-h-screen items-center justify-center bg-base-200">
	<div class="card w-96 bg-base-100 shadow-xl">
		<div class="card-body">
			<h2 class="card-title text-2xl font-bold text-error">{messages['ui.sign_in_error']()}</h2>
			<p class="mt-4 text-sm text-base-content/70">
				{messages['screen.could_not_sign_you_in_please_try_again']()}
			</p>

			<div class="mt-6 card-actions justify-end">
				<a href="/login" class="btn btn-primary"> {messages['screen.back_to_sign_in']()} </a>
			</div>
		</div>
	</div>
</div>
