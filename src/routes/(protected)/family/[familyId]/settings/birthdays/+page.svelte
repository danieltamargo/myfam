<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
	let submitting = $state(false);
	let submitError = $state('');
	const months = [
		'Enero',
		'Febrero',
		'Marzo',
		'Abril',
		'Mayo',
		'Junio',
		'Julio',
		'Agosto',
		'Septiembre',
		'Octubre',
		'Noviembre',
		'Diciembre'
	];
	const saveBirthday: SubmitFunction = () => {
		submitting = true;
		submitError = '';
		return async ({ update }) => {
			try {
				await update();
			} catch {
				submitError = 'No se pudo guardar. Comprueba la conexión e inténtalo de nuevo.';
			} finally {
				submitting = false;
			}
		};
	};
</script>

<svelte:head><title>Cumpleaños · MyFamily</title></svelte:head>

<div class="mx-auto max-w-3xl space-y-6 pb-8">
	<header>
		<h1 class="text-3xl font-bold">Cumpleaños familiares</h1>
		<p class="mt-2">
			Guarda el día y el mes para ver avisos desde 14 días antes y abrir su wishlist.
		</p>
		<p class="mt-2 text-sm">
			La fecha se comparte solo con esta familia. Cada miembro puede cambiar la suya; el propietario
			y los administradores pueden cambiar todas. No guardamos el año de nacimiento.
		</p>
	</header>
	{#if submitError || form?.message}
		<p
			role="status"
			class="alert alert-soft"
			class:alert-error={Boolean(submitError || !form?.success)}
			class:alert-success={!submitError && form?.success}
		>
			{submitError || form?.message}
		</p>
	{/if}
	{#if !data.birthdayMembers.length}
		<p>No hay miembros disponibles.</p>
	{:else}
		<ul class="divide-y divide-base-300">
			{#each data.birthdayMembers as member (member.userId)}
				<li class="py-4">
					<h2 class="font-semibold break-words">{member.displayName}</h2>
					{#if data.canManageBirthdays || member.userId === data.currentUserId}
						<form
							method="POST"
							action="?/save"
							use:enhance={saveBirthday}
							class="mt-3 flex flex-wrap items-end gap-3"
						>
							<input type="hidden" name="user_id" value={member.userId} />
							<label class="flex flex-col gap-1 text-sm"
								>Día
								<input
									type="number"
									name="day"
									min="1"
									max="31"
									value={member.day ?? ''}
									class="input w-24"
									aria-label={`Día de cumpleaños de ${member.displayName}`}
								/>
							</label>
							<label class="flex min-w-0 flex-col gap-1 text-sm"
								>Mes
								<select
									name="month"
									class="select w-44 max-w-full"
									value={member.month ?? ''}
									aria-label={`Mes de cumpleaños de ${member.displayName}`}
								>
									<option value="">Sin fecha</option>
									{#each months as month, index (month)}<option value={index + 1}>{month}</option
										>{/each}
								</select>
							</label>
							<button class="btn btn-primary" type="submit" disabled={submitting}
								>{submitting ? 'Guardando…' : 'Guardar'}</button
							>
							{#if member.month !== null}<button
									class="btn btn-ghost"
									type="submit"
									name="remove"
									value="true"
									formnovalidate
									disabled={submitting}>Eliminar fecha</button
								>{/if}
						</form>
					{:else}
						<p class="mt-2 text-sm">
							{member.month !== null
								? `${member.day} de ${months[member.month - 1].toLowerCase()}`
								: 'Sin fecha registrada'}
						</p>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
	<p class="text-sm">
		Para cumpleaños el 29 de febrero, el aviso usa el 28 de febrero en años no bisiestos. Los avisos
		siguen la hora de Madrid.
	</p>
</div>
