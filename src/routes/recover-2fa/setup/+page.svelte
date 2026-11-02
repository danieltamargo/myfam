<script lang="ts">
	import { createClient } from '$lib/supabase';
	import { onMount } from 'svelte';
	const supabase = createClient();
	let busy = $state(false);
	let error = $state('');
	let qrCode = $state('');
	let secret = $state('');
	let factorId = $state('');
	let code = $state('');
	let verified = $state(false);

	onMount(async () => {
		const { data, error: assuranceError } =
			await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
		if (assuranceError) error = 'No se pudo comprobar el autenticador.';
		else verified = data.currentLevel === 'aal2';
	});

	async function enroll() {
		busy = true;
		error = '';
		try {
			const { data, error: enrollError } = await supabase.auth.mfa.enroll({
				factorType: 'totp',
				friendlyName: 'MyFamily recuperado'
			});
			if (enrollError) throw enrollError;
			factorId = data.id;
			qrCode = data.totp.qr_code;
			secret = data.totp.secret;
		} catch {
			error = 'No se pudo crear el autenticador. Inténtalo de nuevo.';
		} finally {
			busy = false;
		}
	}

	async function verify(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		error = '';
		try {
			const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
			if (verifyError) throw verifyError;
			verified = true;
			qrCode = '';
			secret = '';
			code = '';
		} catch {
			error = 'Código no válido. Comprueba el autenticador e inténtalo de nuevo.';
		} finally {
			busy = false;
		}
	}
</script>

<main class="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 p-6">
	<h1 class="text-2xl font-bold">Configura tu nuevo autenticador</h1>
	<p>
		Tu contraseña ya se ha cambiado y tus sesiones anteriores están cerradas. Verifica el nuevo
		autenticador para volver a acceder a MyFamily.
	</p>
	{#if error}<p role="alert" class="alert alert-error">{error}</p>{/if}
	{#if verified}
		<p role="status">
			Autenticador verificado. Completa la recuperación y guarda un nuevo lote de códigos.
		</p>
		<form method="POST" action="?/complete">
			<button class="btn btn-primary">Completar recuperación</button>
		</form>
	{:else if qrCode}
		<img
			src={qrCode}
			alt="Código QR para configurar el nuevo autenticador"
			class="mx-auto h-56 w-56 max-w-full bg-white p-3"
		/>
		<details class="collapse-arrow collapse bg-base-200">
			<summary class="collapse-title">Introducir la clave manualmente</summary>
			<div class="collapse-content font-mono break-all">{secret}</div>
		</details>
		<form class="flex flex-col gap-4" onsubmit={verify}>
			<label class="flex flex-col gap-2"
				>Código del autenticador
				<input
					class="input w-full"
					bind:value={code}
					inputmode="numeric"
					autocomplete="one-time-code"
					pattern={'[0-9]{6}'}
					maxlength="6"
					required
				/>
			</label>
			<button class="btn btn-primary" disabled={busy || !/^[0-9]{6}$/.test(code)}
				>{busy ? 'Verificando…' : 'Verificar autenticador'}</button
			>
		</form>
	{:else}
		<button class="btn btn-primary" onclick={enroll} disabled={busy}
			>{busy ? 'Preparando…' : 'Crear nuevo autenticador'}</button
		>
	{/if}
</main>
