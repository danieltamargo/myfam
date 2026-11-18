<script lang="ts">
	import * as messages from '$paraglide/messages';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { MODULE_CATALOG, type ModuleId } from '$lib/config/modules';
	import type { ActionData, PageData, SubmitFunction } from './$types';

	interface Props {
		data: PageData;
		form?: ActionData;
	}

	let { data, form }: Props = $props();
	let submitting = $state<ModuleId | null>(null);

	const coreModules = $derived(data.modules.filter((module) => module.reason === 'core'));
	const availableModules = $derived(
		data.modules.filter((module) => MODULE_CATALOG[module.moduleId].availability === 'available')
	);
	const disabledModules = $derived(
		data.modules.filter((module) => module.reason === 'globally-disabled')
	);

	const enhancePreference: SubmitFunction = ({ formData }) => {
		const moduleId = formData.get('moduleId');
		submitting = typeof moduleId === 'string' ? (moduleId as ModuleId) : null;
		return async ({ update }) => {
			try {
				await update();
			} finally {
				submitting = null;
			}
		};
	};
</script>

<svelte:head>
	<title>{messages['details.modules_for']()} {data.family.name} · MyFamily</title>
	<meta
		name="description"
		content="Configura los módulos organizativos disponibles para tu familia."
	/>
</svelte:head>

<div class="mx-auto max-w-5xl space-y-8 pb-12">
	<header class="space-y-3">
		<div class="breadcrumbs text-sm" aria-label={messages['module_settings.breadcrumbs']()}>
			<ul>
				<li>
					<a href={resolve(...([`/family/${data.family.id}`] as unknown as ['/']))}
						>{data.family.name}</a
					>
				</li>
				<li>{messages['ui.modules']()}</li>
			</ul>
		</div>
		<div>
			<p class="text-sm font-semibold tracking-wide text-primary uppercase">
				{messages['screen.family_preferences']()}
			</p>
			<h1 class="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
				{messages['screen.choose_what_your_family_needs']()}
			</h1>
			<p class="mt-2 max-w-2xl text-base-content/70">
				{messages['screen.core_modules_are_always_on_you_can_choose_which_other_modules_to_sho']()}
			</p>
		</div>
	</header>

	{#if form?.error}
		<div role="alert" class="alert alert-soft alert-error">
			<span>{form.error}</span>
		</div>
	{:else if form?.success}
		<div role="status" class="alert alert-soft alert-success">
			<span>{form.success}</span>
		</div>
	{/if}

	{#if !data.canManage}
		<div role="note" class="alert alert-soft alert-info">
			<span>{messages['module_settings.view_only']()}</span>
		</div>
	{/if}

	<section class="space-y-4" aria-labelledby="core-modules-heading">
		<div>
			<h2 id="core-modules-heading" class="text-xl font-bold">
				{messages['details.essentials']()}
			</h2>
			<p class="text-sm text-base-content/65">
				{messages['details.these_tools_are_always_available']()}
			</p>
		</div>
		<div class="grid gap-4 md:grid-cols-2">
			{#each coreModules as access (access.moduleId)}
				{@const module = MODULE_CATALOG[access.moduleId]}
				<article class="card bg-base-100 card-border">
					<div class="card-body gap-4">
						<div class="flex items-start justify-between gap-4">
							<div class="flex min-w-0 items-start gap-3">
								<span aria-hidden="true" class="text-3xl">{module.icon}</span>
								<div class="min-w-0">
									<h3 class="card-title text-lg">{messages[`app_nav.${module.id}`]()}</h3>
									<p class="mt-1 text-sm text-base-content/65">
										{messages[`landing.${module.id}`]()}
									</p>
								</div>
							</div>
							<span class="badge shrink-0 badge-soft badge-primary"
								>{messages['details.essential']()}</span
							>
						</div>
						<div class="card-actions justify-end">
							<button class="btn btn-sm" type="button" disabled
								>{messages['screen.always_on']()}</button
							>
						</div>
					</div>
				</article>
			{/each}
		</div>
	</section>

	<section class="space-y-4" aria-labelledby="available-modules-heading">
		<div>
			<h2 id="available-modules-heading" class="text-xl font-bold">
				{messages['screen.family_organization']()}
			</h2>
			<p class="text-sm text-base-content/65">
				{messages['screen.turn_on_the_tools_you_want_to_see_in_the_menu']()}
			</p>
		</div>
		<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
			{#each availableModules as access (access.moduleId)}
				{@const module = MODULE_CATALOG[access.moduleId]}
				<article class="card bg-base-100 card-border">
					<div class="card-body gap-5">
						<div class="flex items-start justify-between gap-3">
							<span aria-hidden="true" class="text-3xl">{module.icon}</span>
							<span
								class={[
									'badge shrink-0',
									{ 'badge-success': access.enabled, 'badge-ghost': !access.enabled }
								]}
							>
								{access.enabled
									? messages['feature.active']()
									: messages['module_settings.hidden']()}
							</span>
						</div>
						<div class="grow">
							<h3 class="card-title text-lg">{messages[`app_nav.${module.id}`]()}</h3>
							<p class="mt-1 text-sm text-base-content/65">{messages[`landing.${module.id}`]()}</p>
						</div>
						<form method="POST" action="?/setPreference" use:enhance={enhancePreference}>
							<input type="hidden" name="moduleId" value={module.id} />
							<input type="hidden" name="enabled" value={access.enabled ? 'false' : 'true'} />
							<button
								type="submit"
								class={[
									'btn btn-block btn-sm',
									{ 'btn-primary': !access.enabled, 'btn-ghost': access.enabled }
								]}
								disabled={!data.canManage || submitting !== null}
								aria-label={messages[
									access.enabled ? 'module_settings.disable' : 'module_settings.enable'
								]({ module: messages[`app_nav.${module.id}`]() })}
							>
								{#if submitting === module.id}
									<span class="loading loading-xs loading-spinner" aria-hidden="true"></span>
									{messages['details.saving']()}
								{:else if access.enabled}
									{messages['screen.hide_module']()}
								{:else}
									{messages['details.enable_module']()}
								{/if}
							</button>
						</form>
					</div>
				</article>
			{/each}
		</div>
	</section>

	{#if disabledModules.length > 0}
		<section class="space-y-4" aria-labelledby="future-modules-heading">
			<div>
				<h2 id="future-modules-heading" class="text-xl font-bold">
					{messages['details.coming_later']()}
				</h2>
				<p class="text-sm text-base-content/65">
					{messages['details.these_modules_are_not_available_yet']()}
				</p>
			</div>
			<div class="grid gap-4 md:grid-cols-2">
				{#each disabledModules as access (access.moduleId)}
					{@const module = MODULE_CATALOG[access.moduleId]}
					<article class="card bg-base-200/60 card-border">
						<div class="card-body gap-4">
							<div class="flex items-start justify-between gap-4">
								<span aria-hidden="true" class="text-3xl opacity-60">{module.icon}</span>
								<span class="badge badge-ghost">{messages['details.unavailable']()}</span>
							</div>
							<div>
								<h3 class="card-title text-lg">{messages[`app_nav.${module.id}`]()}</h3>
								<p class="mt-1 text-sm text-base-content/65">
									{messages[`landing.${module.id}`]()}
								</p>
							</div>
							<button class="btn btn-block btn-sm" type="button" disabled
								>{messages['details.coming_soon']()}</button
							>
						</div>
					</article>
				{/each}
			</div>
		</section>
	{/if}
</div>
