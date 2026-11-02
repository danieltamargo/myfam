<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { ActionData } from './$types';
	let { form }: { form: ActionData } = $props();
	let submitting = $state(false);
</script>

<main class="mx-auto max-w-2xl space-y-6 p-6">
	<a href={resolve('/profile')} class="link">Volver al perfil</a>
	<h1 class="text-2xl font-bold">Códigos de recuperación</h1>
	<p>
		Necesitas verificar tu autenticador para generar o revocar códigos. Guarda los códigos fuera de
		MyFamily. Cada lote sustituye al anterior y solo se muestra al generarlo.
	</p>
	{#if form?.codes?.length}
		<section class="space-y-4" aria-label="Códigos recién generados">
			<p role="status">
				Guarda estos ocho códigos ahora. Al usar uno, se anulan todos los demás y tendrás que
				cambiar tu contraseña y configurar otro autenticador.
			</p>
			<ul class="space-y-2 font-mono break-all">
				{#each form.codes as code (code)}<li>{code}</li>{/each}
			</ul>
		</section>
	{:else if form?.revoked}
		<p role="status">Los códigos anteriores están revocados.</p>
	{/if}
	<form
		method="POST"
		class="flex flex-wrap gap-3"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				await update();
				submitting = false;
			};
		}}
	>
		<button class="btn btn-primary" formaction="?/generate" disabled={submitting}
			>Generar ocho códigos nuevos</button
		>
		<button class="btn btn-outline" formaction="?/revoke" disabled={submitting}
			>Revocar códigos</button
		>
	</form>
</main>
