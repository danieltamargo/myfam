<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { ActionData } from './$types';
	let { form }: { form: ActionData } = $props();
	let submitting = $state(false);
</script>

<main class="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 p-6">
	<h1 class="text-2xl font-bold">Recuperar la verificación en dos pasos</h1>
	<p>
		Usa uno de los códigos que guardaste en tu perfil. Cambiaremos tu contraseña, cerraremos todas
		tus sesiones y te pediremos configurar un nuevo autenticador antes de acceder a tus datos.
	</p>
	{#if form?.message}<p role="alert" class="alert alert-error">{form.message}</p>{/if}
	<form
		method="POST"
		class="flex flex-col gap-4"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				await update();
				submitting = false;
			};
		}}
	>
		<label class="flex flex-col gap-2"
			>Contraseña actual
			<input
				class="input w-full"
				type="password"
				name="password"
				autocomplete="current-password"
				maxlength="4096"
				required
			/>
		</label>
		<label class="flex flex-col gap-2"
			>Nueva contraseña
			<input
				class="input w-full"
				type="password"
				name="new_password"
				autocomplete="new-password"
				minlength="12"
				maxlength="128"
				aria-describedby="new-password-help"
				required
			/>
		</label>
		<p class="text-sm" id="new-password-help">
			Al menos 12 caracteres y distinta de la contraseña actual.
		</p>
		<label class="flex flex-col gap-2"
			>Código de recuperación
			<input
				class="input w-full font-mono"
				name="code"
				autocomplete="off"
				maxlength="64"
				spellcheck="false"
				required
			/>
		</label>
		<p class="text-sm">
			Usar un código anula todos los códigos restantes. Sin un código guardado, contacta con quien
			administra MyFamily.
		</p>
		<button class="btn btn-primary" disabled={submitting}
			>{submitting ? 'Recuperando…' : 'Recuperar y cambiar contraseña'}</button
		>
	</form>
	<a href={resolve('/verify-2fa')} class="link">Volver al autenticador</a>
</main>
