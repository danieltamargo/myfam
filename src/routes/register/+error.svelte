<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<svelte:head><title>Registro cerrado | MyFamily</title></svelte:head>

<main class="flex min-h-screen items-center justify-center bg-base-200 p-4">
	<div class="card w-full max-w-md bg-base-100">
		<div class="card-body">
			<h1 class="card-title">Acceso privado</h1>
			<p>El registro está cerrado. Solicita el acceso al administrador.</p>
			<a href={resolve('/login')} class="btn mt-4 btn-primary">Iniciar sesión</a>
		</div>
	</div>
</main>
