<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';
	import { getNavigationModules } from '$lib/config/modules';
	import type { LayoutData } from './$types';

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
			href: module.href(data.family.id)
		}))
	);
	const settingsHref = $derived(`/family/${encodeURIComponent(data.family.id)}/settings/modules`);

	function isActive(href: string) {
		return page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
	}
</script>

<div class="container mx-auto max-w-7xl p-4">
	<nav aria-label="Módulos familiares" class="mb-4 overflow-x-auto">
		<div role="tablist" class="tabs-box tabs w-max min-w-full">
			{#each modules as module (module.id)}
				<a
					role="tab"
					href={resolve(...([module.href] as unknown as ['/']))}
					aria-current={isActive(module.href) ? 'page' : undefined}
					aria-selected={isActive(module.href)}
					class="tab gap-2 whitespace-nowrap"
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
				Módulos
			</a>
		</div>
	</nav>

	<div>
		{@render children()}
	</div>
</div>
