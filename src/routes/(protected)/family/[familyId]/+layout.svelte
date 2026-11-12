<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';
	import { getNavigationModules } from '$lib/config/modules';
	import type { LayoutData } from './$types';
	import BirthdayAlerts from '$lib/components/layout/BirthdayAlerts.svelte';
	import * as m from '$paraglide/messages';

	interface Props {
		data: LayoutData;
		children: Snippet;
	}

	let { data, children }: Props = $props();

	const modules = $derived(
		getNavigationModules(
			data.moduleAccess.filter((access) => access.enabled).map((access) => access.moduleId)
		).map((module) => ({
			...module,
			href: module.href(data.family.id),
			label: m[`app_nav.${module.id}`]()
		}))
	);
	const settingsHref = $derived(`/family/${encodeURIComponent(data.family.id)}/settings/modules`);
	const birthdaysHref = $derived(
		`/family/${encodeURIComponent(data.family.id)}/settings/birthdays`
	);

	function isActive(href: string) {
		return page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
	}
</script>

<div class="container mx-auto max-w-7xl min-w-0 px-3 py-4 sm:px-4">
	<nav aria-label={m['app_nav.family_nav']()} class="mb-4 overflow-x-auto">
		<div role="tablist" class="tabs-box tabs w-max min-w-full">
			{#each modules as module (module.id)}
				<a
					role="tab"
					href={resolve(...([module.href] as unknown as ['/']))}
					aria-current={isActive(module.href) ? 'page' : undefined}
					aria-selected={isActive(module.href)}
					class="tab gap-2 whitespace-nowrap motion-safe:transition-colors"
					class:tab-active={isActive(module.href)}
				>
					<span aria-hidden="true" class="text-lg">{module.icon}</span>
					{module.label}
				</a>
			{/each}
			<a
				role="tab"
				href={resolve(...([settingsHref] as unknown as ['/']))}
				aria-current={isActive(settingsHref) ? 'page' : undefined}
				aria-selected={isActive(settingsHref)}
				class="tab gap-2 whitespace-nowrap"
				class:tab-active={isActive(settingsHref)}
			>
				<span aria-hidden="true" class="text-lg">⚙️</span>
				{m['app_nav.modules']()}
			</a>
			{#if data.moduleAccess.some((access) => access.moduleId === 'wishlist' && access.enabled)}
				<a
					role="tab"
					href={resolve(...([birthdaysHref] as unknown as ['/']))}
					aria-current={isActive(birthdaysHref) ? 'page' : undefined}
					aria-selected={isActive(birthdaysHref)}
					class="tab whitespace-nowrap"
					class:tab-active={isActive(birthdaysHref)}>{m['app_nav.birthdays']()}</a
				>
			{/if}
		</div>
	</nav>
	<BirthdayAlerts alerts={data.birthdayAlerts} errorMessage={data.birthdayAlertsError} />

	<div>
		{@render children()}
	</div>
</div>
