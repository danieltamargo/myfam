<script lang="ts">
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import { getNavigationModules } from '$lib/config/modules';
	import type { LayoutData } from './$types';

	interface Props {
		data: LayoutData;
		children: Snippet;
	}

	let { data, children }: Props = $props();

	const modules = $derived(
		getNavigationModules().map((module) => ({
			...module,
			href: module.href(data.family.id)
		}))
	);

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
					href={module.href}
					aria-current={isActive(module.href) ? 'page' : undefined}
					aria-selected={isActive(module.href)}
					class="tab gap-2 whitespace-nowrap"
					class:tab-active={isActive(module.href)}
				>
					<span aria-hidden="true" class="text-lg">{module.icon}</span>
					{module.label}
				</a>
			{/each}
		</div>
	</nav>

	<div>
		{@render children()}
	</div>
</div>
