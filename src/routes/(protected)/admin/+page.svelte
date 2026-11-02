<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let pending = $state(false);
	const submit: SubmitFunction = () => {
		pending = true;
		return async ({ update }) => {
			try {
				await update();
			} finally {
				pending = false;
			}
		};
	};
	function date(value: string | null): string {
		return value
			? new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short' }).format(
					new Date(value)
				)
			: 'Sin registro';
	}
	function pagination(key: string, value: number): `?${string}` {
		const query = new SvelteURLSearchParams(page.url.searchParams);
		query.set(key, String(value));
		return `?${query}`;
	}
</script>

<svelte:head
	><title>Administración | MyFamily</title><meta
		name="robots"
		content="noindex,nofollow"
	/></svelte:head
>

<div class="mx-auto w-full max-w-6xl space-y-8 p-4 sm:p-6">
	<header>
		<h1 class="text-3xl font-bold">Administración</h1>
		<p class="mt-2">
			Gestiona las altas y el acceso a MyFamily y consulta la actividad registrada.
		</p>
	</header>

	{#if form?.error}<div class="alert alert-error" role="alert">{form.error}</div>{/if}
	{#if form?.success}<div class="alert alert-success" role="status">{form.success}</div>{/if}
	{#if pending}<p role="status">Guardando los cambios…</p>{/if}

	<section
		aria-labelledby="create-heading"
		class="rounded-box border border-base-300 bg-base-100 p-4 sm:p-6"
	>
		<h2 id="create-heading" class="text-xl font-semibold">Invitar usuario</h2>
		<p class="mt-1 text-sm">
			La persona recibirá un enlace para establecer su contraseña. El alta no la añade a ninguna
			familia.
		</p>
		<form
			method="POST"
			action="?/create"
			use:enhance={submit}
			class="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end"
		>
			<div class="min-w-0 flex-1">
				<label for="admin-name" class="label text-base-content">Nombre</label><input
					id="admin-name"
					name="name"
					class="input w-full"
					maxlength="100"
					required
					disabled={pending}
					autocomplete="name"
				/>
			</div>
			<div class="min-w-0 flex-1">
				<label for="admin-email" class="label text-base-content">Correo electrónico</label><input
					id="admin-email"
					name="email"
					type="email"
					class="input w-full"
					maxlength="254"
					required
					disabled={pending}
					autocomplete="email"
				/>
			</div>
			<button class="btn btn-primary" disabled={pending}>Crear y enviar bienvenida</button>
		</form>
	</section>

	<section aria-labelledby="users-heading">
		<h2 id="users-heading" class="text-xl font-semibold">Usuarios</h2>
		<p class="mt-1 text-sm">
			Deshabilitar bloquea el acceso a los datos y los nuevos inicios de sesión. Los
			superadministradores se configuran en el servidor.
		</p>
		<ul class="mt-4 divide-y divide-base-300 rounded-box border border-base-300 bg-base-100">
			{#each data.users as user (user.id)}
				<li class="flex min-w-0 flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
					<div class="min-w-0 space-y-1">
						<p class="font-semibold break-words">{user.email || 'Sin correo'}</p>
						<p class="text-sm">
							{user.disabled ? 'Deshabilitado' : 'Habilitado'}{user.superAdmin
								? ' · Superadministrador'
								: ''}{user.id === data.actorId ? ' · Tu cuenta' : ''}
						</p>
						<p class="text-sm">
							Alta: {date(user.createdAt)} · Último acceso: {date(user.lastSignIn)}
						</p>
						<p class="text-xs break-all">{user.id}</p>
					</div>
					<div class="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-end">
						<form method="POST" action="?/welcome" use:enhance={submit}>
							<input type="hidden" name="userId" value={user.id} /><button
								class="btn w-full btn-outline btn-sm"
								disabled={pending || user.disabled || !user.email}>Reenviar bienvenida</button
							>
						</form>
						{#if user.disabled}
							<form method="POST" action="?/enable" use:enhance={submit}>
								<input type="hidden" name="userId" value={user.id} /><button
									class="btn w-full btn-sm"
									disabled={pending}>Habilitar</button
								>
							</form>
						{:else if !user.superAdmin && user.id !== data.actorId}
							<form method="POST" action="?/disable" use:enhance={submit} class="space-y-2">
								<input type="hidden" name="userId" value={user.id} /><label
									class="flex items-center gap-2 text-sm"
									><input
										class="checkbox checkbox-sm"
										type="checkbox"
										name="confirm"
										required
										disabled={pending}
									/>Confirmo deshabilitar</label
								><button class="btn w-full btn-outline btn-sm" disabled={pending}
									>Deshabilitar</button
								>
							</form>
						{/if}
					</div>
				</li>
			{:else}<li class="p-4">No hay usuarios en esta página.</li>{/each}
		</ul>
		<nav aria-label="Páginas de usuarios" class="mt-3 flex items-center gap-3 text-sm">
			{#if data.page > 1}<a
					class="btn btn-ghost btn-sm"
					href={resolve(`/admin${pagination('page', data.page - 1)}`)}>Anterior</a
				>{/if}<span>Página {data.page}</span>{#if data.hasMoreUsers}<a
					class="btn btn-ghost btn-sm"
					href={resolve(`/admin${pagination('page', data.page + 1)}`)}>Siguiente</a
				>{/if}
		</nav>
	</section>

	<section aria-labelledby="business-heading">
		<h2 id="business-heading" class="text-xl font-semibold">Acciones de la aplicación</h2>
		<p class="mt-1 text-sm">
			Incluye las operaciones administrativas y los eventos de negocio que registra cada módulo. No
			muestra contenido privado ni metadatos.
		</p>
		<ul class="mt-4 divide-y divide-base-300 rounded-box border border-base-300 bg-base-100">
			{#each data.business as entry (entry.id)}<li class="space-y-1 p-4">
					<p class="font-medium break-words">{entry.action}</p>
					<p class="text-sm">{date(entry.created_at)} · {entry.module_name || 'Aplicación'}</p>
					<p class="text-xs break-all">
						Usuario: {entry.user_id || 'Sistema'}{entry.family_id
							? ` · Familia: ${entry.family_id}`
							: ''}
					</p>
					{#if entry.resource_id}<p class="text-xs break-all">
							{entry.resource_type || 'Recurso'}: {entry.resource_id}
						</p>{/if}
				</li>{:else}<li class="p-4">No hay acciones registradas en esta página.</li>{/each}
		</ul>
		<nav aria-label="Páginas de acciones" class="mt-3 flex items-center gap-3 text-sm">
			{#if data.businessPage > 1}<a
					class="btn btn-ghost btn-sm"
					href={resolve(`/admin${pagination('businessPage', data.businessPage - 1)}`)}>Anterior</a
				>{/if}<span>Página {data.businessPage}</span>{#if data.hasMoreBusiness}<a
					class="btn btn-ghost btn-sm"
					href={resolve(`/admin${pagination('businessPage', data.businessPage + 1)}`)}>Siguiente</a
				>{/if}
		</nav>
	</section>

	<section aria-labelledby="auth-heading">
		<h2 id="auth-heading" class="text-xl font-semibold">Autenticación</h2>
		<p class="mt-1 text-sm">
			Inicios de sesión y otros eventos registrados por Supabase Auth. Solo se muestran la fecha, la
			acción y el identificador del usuario.
		</p>
		<ul class="mt-4 divide-y divide-base-300 rounded-box border border-base-300 bg-base-100">
			{#each data.authEvents as entry (entry.id)}<li class="space-y-1 p-4">
					<p class="font-medium">{entry.action}</p>
					<p class="text-sm">{date(entry.created_at)}</p>
					<p class="text-xs break-all">Usuario: {entry.actor_id || 'Sin identificador'}</p>
				</li>{:else}<li class="p-4">No hay eventos de autenticación en esta página.</li>{/each}
		</ul>
		<nav aria-label="Páginas de autenticación" class="mt-3 flex items-center gap-3 text-sm">
			{#if data.authPage > 1}<a
					class="btn btn-ghost btn-sm"
					href={resolve(`/admin${pagination('authPage', data.authPage - 1)}`)}>Anterior</a
				>{/if}<span>Página {data.authPage}</span>{#if data.hasMoreAuth}<a
					class="btn btn-ghost btn-sm"
					href={resolve(`/admin${pagination('authPage', data.authPage + 1)}`)}>Siguiente</a
				>{/if}
		</nav>
	</section>
</div>
