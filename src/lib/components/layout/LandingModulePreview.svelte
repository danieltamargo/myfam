<script lang="ts">
	import { MODULE_CATALOG, type ModuleId } from '$lib/config/modules';
	import * as m from '$paraglide/messages';
	import { getLocale } from '$paraglide/runtime';

	type Slide = Extract<ModuleId, 'calendar' | 'expenses' | 'wishlist' | 'lists'>;
	let { module, playing }: { module: Slide; playing: boolean } = $props();
	let frame: HTMLElement = $state()!;
	let pointer: HTMLElement = $state()!;
	let step = $state(0);

	const navigation = ['calendar', 'planner', 'expenses', 'wishlist', 'lists'] as const;
	const sequences = {
		calendar: ['event', 'planner'],
		expenses: ['add-expense', 'save-expense'],
		wishlist: ['member', 'details', 'purchase'],
		lists: ['first-item', 'second-item']
	};
	const currentPage = $derived(module === 'calendar' && step === 2 ? 'planner' : module);
	const locale = $derived(getLocale());
	const month = $derived(
		new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
			new Date('2026-06-01')
		)
	);
	const weekdays = $derived(
		Array.from({ length: 7 }, (_, index) =>
			new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(
				new Date(Date.UTC(2026, 5, index + 1))
			)
		)
	);
	const money = $derived(new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }));
	const gifts = $derived(
		step === 0
			? ([
					[m['demo_item.wishlist'](), '🎲', 24],
					[m['demo_detail.books'](), '📚', 19],
					[m['showcase.headphones'](), '🎧', 42]
				] as const)
			: ([
					[m['showcase.camera'](), '📷', 55],
					[m['showcase.plant'](), '🪴', 12],
					[m['showcase.puzzle'](), '🧩', 18]
				] as const)
	);

	$effect(() => {
		const targets = sequences[module];
		step = 0;
		if (!playing) return;
		let cancelled = false;
		let animation: Animation | undefined;
		let position = { x: frame.clientWidth - 30, y: frame.clientHeight - 40 };
		const at = ({ x, y }: typeof position, scale = 1) =>
			`translate(${x}px, ${y}px) scale(${scale})`;

		async function play() {
			for (const [index, selector] of targets.entries()) {
				const target = frame.querySelector<HTMLElement>(`[data-demo-click="${selector}"]`);
				if (!target) return;
				const bounds = frame.getBoundingClientRect();
				const rect = target.getBoundingClientRect();
				const next = {
					x: rect.left - bounds.left - frame.clientLeft + rect.width / 2,
					y: rect.top - bounds.top - frame.clientTop + rect.height / 2
				};
				const previous = animation;
				animation = pointer.animate(
					[
						{ transform: at(position), opacity: 1 },
						{ transform: at(next), offset: 0.78 },
						{ transform: at(next, 0.74), offset: 0.91 },
						{ transform: at(next), opacity: 1 }
					],
					{ duration: index === 0 ? 950 : 1130, fill: 'forwards', easing: 'ease-in-out' }
				);
				previous?.cancel();
				try {
					await animation.finished;
				} catch {
					return;
				}
				if (cancelled) return;
				step = index + 1;
				position = next;
				await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
				if (cancelled) return;
			}
		}

		void play();
		return () => {
			cancelled = true;
			animation?.cancel();
		};
	});
</script>

{#snippet chip(label: string, target?: string, primary = false)}
	<span
		class="inline-flex items-center rounded-field border border-base-300 px-2 py-1 font-semibold {primary
			? 'bg-primary text-primary-content'
			: 'bg-base-100'}"
		data-demo-click={target}>{label}</span
	>
{/snippet}

<div
	bind:this={frame}
	class="presentation relative isolate grid h-[23rem] grid-cols-[2.75rem_minmax(0,1fr)] overflow-hidden rounded-box border border-base-300 bg-base-100 text-[.68rem] sm:h-[27rem] sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:text-xs"
	class:presentation-active={playing}
	data-module={module}
	data-step={step}
	aria-hidden="true"
>
	<aside class="border-r border-base-300 bg-base-200 p-1.5 sm:p-2">
		<div class="mb-4 px-1 pt-2 font-black">
			<span class="sm:hidden">MF</span><span class="hidden sm:inline">MyFamily</span>
		</div>
		<ul class="space-y-1">
			{#each navigation as id (id)}
				<li
					class="flex min-h-8 items-center justify-center gap-2 rounded-field px-1.5 font-medium sm:justify-start"
					class:demo-selected={currentPage === id}
					class:font-bold={currentPage === id}
					data-demo-click={module === 'calendar' && id === 'planner' ? 'planner' : undefined}
				>
					<span>{MODULE_CATALOG[id].icon}</span><span class="hidden sm:inline"
						>{m[`app_nav.${id}`]()}</span
					>
				</li>
			{/each}
		</ul>
	</aside>

	<div class="min-w-0">
		<div class="flex h-9 items-center justify-between border-b border-base-300 px-3 sm:px-4">
			<span class="font-semibold">{m['feature.current_family']()} · MyFamily</span>
			<span class="grid size-5 place-items-center rounded-full bg-primary/15 font-bold">Á</span>
		</div>
		<div class="space-y-2 p-2 sm:space-y-3 sm:p-4">
			{#if currentPage === 'calendar'}
				<div class="flex flex-wrap items-center justify-between gap-1">
					<strong class="text-base tracking-tight sm:text-xl">{m['ui.family_calendar']()}</strong>
					{@render chip(m['ui.new_event'](), undefined, true)}
				</div>
				<div class="flex flex-wrap items-center gap-1 rounded-box border border-base-300 p-1.5">
					{@render chip('‹')}
					{@render chip(m['ui.today']())}
					{@render chip('›')}
					<strong class="mr-auto capitalize">{month}</strong>
					<span class="hidden sm:inline"
						>{@render chip(m['ui.month']())} {@render chip(m['details.schedule']())}</span
					>
				</div>
				<div class="grid grid-cols-7 overflow-hidden rounded-box border border-base-300">
					{#each weekdays as day (day)}<span class="bg-base-200 py-1.5 text-center font-semibold"
							>{day}</span
						>{/each}
					{#each Array(35) as _, index (index)}
						<div class="relative min-w-0 border-t border-r border-base-300 p-1 sm:h-9">
							<span class:opacity-50={index > 29}>{(index % 30) + 1}</span>
							{#if index === 11 || index === 18}
								<span
									class="block truncate rounded bg-primary/15 px-0.5 text-[.58rem] font-bold sm:px-1"
									data-demo-click={index === 11 ? 'event' : undefined}
								>
									{index === 11 ? m['demo_item.planner']() : m['demo_detail.family_walk']()}
								</span>
							{/if}
						</div>
					{/each}
				</div>
				{#if step === 1}
					<div
						class="absolute inset-x-3 bottom-3 ml-11 rounded-box border border-primary/40 bg-base-100 p-2 shadow-sm sm:ml-34"
					>
						<strong>{m['demo_item.planner']()}</strong>
						<p>12/06 · 18:00</p>
					</div>
				{/if}
			{:else if currentPage === 'planner'}
				<strong class="text-base tracking-tight sm:text-xl"
					>{m['details.planner_for']()} MyFamily</strong
				>
				<div>
					<p class="mb-1 font-semibold">{m['feature.quick_actions']()}</p>
					{@render chip(m['ui.new_event']())}
					{@render chip(m['screen.add_expense']())}
				</div>
				<div class="grid gap-2 sm:grid-cols-2">
					<div class="space-y-2 rounded-box border border-base-300 p-2">
						<p class="font-bold">{m['screen.this_week']()}</p>
						<div class="rounded-field bg-base-200 p-2">
							<strong>{m['demo_item.planner']()}</strong>
							<p>12/06 · 18:00</p>
						</div>
						<div class="rounded-field bg-base-200 p-2">
							<strong>{m['demo_detail.family_walk']()}</strong>
							<p>19/06 · 10:00</p>
						</div>
					</div>
					<div class="space-y-2 rounded-box border border-base-300 p-2">
						<p class="font-bold">{m['app_nav.tasks']()}</p>
						<div class="rounded-field bg-base-200 p-2">{m['demo_item.tasks']()}</div>
						<p class="font-bold">{m['ui.your_lists']()}</p>
						<div class="rounded-field bg-base-200 p-2">{m['demo_item.lists']()}</div>
					</div>
				</div>
			{:else if currentPage === 'expenses'}
				<p class="text-base-content/70">{m['app_nav.expenses']()} › {m['demo_item.planner']()}</p>
				<div class="flex flex-wrap items-center justify-between gap-1">
					<strong class="text-base tracking-tight sm:text-xl">{m['demo_item.planner']()}</strong>
					{@render chip(m['screen.add_expense'](), 'add-expense', true)}
				</div>
				<div class="grid grid-cols-2 gap-2">
					<div class="rounded-box bg-neutral p-2 text-neutral-content">
						<p>{m['showcase.period_total']()}</p>
						<strong class="text-lg">{money.format(step === 2 ? 50 : 32)}</strong>
					</div>
					<div class="rounded-box border border-base-300 p-2">
						<p>{m['showcase.refund']()}</p>
						<strong>Noa → Álex · {money.format(step === 2 ? 25 : 16)}</strong>
					</div>
				</div>
				<div class="rounded-box border border-base-300 p-2">
					<p class="font-bold">{m['showcase.trend']()}</p>
					<div class="flex h-14 items-end gap-2 border-b border-base-300 sm:h-20">
						{#each [40, 65, step === 2 ? 98 : 31] as height, index (index)}
							<span
								class="w-7 rounded-t bg-primary/70 transition-[height] motion-reduce:transition-none"
								style:height={`${height}%`}
							></span>
						{/each}
					</div>
				</div>
				<div class="rounded-box border border-base-300 px-2">
					<div class="flex justify-between gap-1 border-b border-base-300 py-1.5 font-bold">
						<span>{m['screen.transactions_for_this_period']()}</span><span
							>{m['showcase.expense_event_label']()}</span
						>
					</div>
					<div class="flex justify-between gap-1 py-1.5">
						<span>{m['demo_item.expenses']()} · {money.format(32)}</span><span class="truncate"
							>{m['demo_item.planner']()}</span
						>
					</div>
					{#if step === 2}<div class="flex justify-between gap-1 border-t border-base-300 py-1.5">
							<span>{m['showcase.cake']()} · {money.format(18)}</span><span class="truncate"
								>{m['demo_item.planner']()}</span
							>
						</div>{/if}
				</div>
				{#if step === 1}
					<div class="demo-dialog">
						<strong>{m['screen.add_expense']()}</strong>
						<div class="grid grid-cols-2 gap-1">
							<span class="rounded-field border border-base-300 p-1.5">{m['showcase.cake']()}</span>
							<span class="rounded-field border border-base-300 p-1.5">{money.format(18)}</span>
						</div>
						<p>{m['showcase.expense_event_label']()} · {m['demo_item.planner']()}</p>
						<div class="text-right">
							{@render chip(m['showcase.record_expense'](), 'save-expense', true)}
						</div>
					</div>
				{/if}
			{:else if currentPage === 'wishlist'}
				<div class="flex flex-wrap items-center justify-between gap-1 rounded-box bg-base-200 p-2">
					<strong class="text-base tracking-tight sm:text-xl">Wishlist</strong>
					<div class="flex gap-1">
						{@render chip(m['feature.cards']())}
						{@render chip(m['feature.table']())}
						{@render chip(m['feature.add_gift'](), undefined, true)}
					</div>
				</div>
				<div class="flex flex-wrap gap-1">
					{@render chip(m['screen.wishlists']())}
					{@render chip(m['ui.my_history']())}
				</div>
				<div class="grid gap-2 sm:grid-cols-[6rem_minmax(0,1fr)]">
					<div class="flex items-center gap-1 sm:block sm:space-y-1">
						<strong class="mr-1">{m['feature.member']()}</strong>
						{#each ['Álex', 'Noa', 'Sam'] as name, index (name)}
							<div
								class="flex items-center gap-1 rounded-field p-0.5 sm:px-1"
								class:demo-selected={(step === 0 ? 0 : 1) === index}
								data-demo-click={index === 1 ? 'member' : undefined}
							>
								<span
									class="grid size-5 shrink-0 place-items-center rounded-full bg-base-200 font-bold"
									>{name[0]}</span
								><span class="hidden sm:inline">{name}</span>
							</div>
						{/each}
					</div>
					<div class="grid min-w-0 grid-cols-2 gap-1.5 sm:grid-cols-3 sm:gap-2">
						{#each gifts as [name, icon, price], index (name)}
							<div
								class="min-w-0 overflow-hidden rounded-box border border-base-300 {index === 2
									? 'hidden sm:block'
									: ''}"
							>
								<div class="grid h-14 place-items-center bg-base-200 text-xl sm:h-20 sm:text-3xl">
									{icon}
								</div>
								<div class="space-y-1 p-1.5 sm:p-2">
									<p class="truncate font-bold">{name}</p>
									<p class="text-primary">{money.format(price)}</p>
									{#if step === 3 && index === 0}<span class="font-bold text-success"
											>{m['ui.purchased']()}</span
										>
									{:else}{@render chip(
											m['showcase.view_details'](),
											index === 0 ? 'details' : undefined
										)}{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
				{#if step === 2}
					<div class="demo-dialog">
						<strong>{m['showcase.camera']()}</strong>
						<p class="text-primary">{money.format(55)}</p>
						<div class="text-right">
							{@render chip(m['showcase.mark_bought'](), 'purchase', true)}
						</div>
					</div>
				{/if}
			{:else}
				<div class="flex flex-wrap items-center justify-between gap-1">
					<strong class="text-base tracking-tight sm:text-xl">{m['ui.shared_lists']()}</strong>
					{@render chip(`+ ${m['module_settings.new_list']()}`, undefined, true)}
				</div>
				<div class="grid gap-2 sm:grid-cols-[1fr_2fr]">
					<div class="space-y-1 rounded-box border border-base-300 p-2">
						<p class="font-bold">{m['ui.your_lists']()}</p>
						<div class="rounded-field bg-primary/15 p-1.5">{m['demo_item.lists']()}</div>
					</div>
					<div class="space-y-2 rounded-box border border-base-300 p-2">
						<strong>{m['demo_item.lists']()}</strong>
						<div class="flex justify-between gap-1 border-b border-base-300 pb-2">
							<span class="grow rounded-field border border-base-300 p-1.5">{m['ui.name']()}</span>
							{@render chip(m['ui.add'](), undefined, true)}
						</div>
						{#each [m['demo_detail.bread'], m['demo_detail.yogurt'], m['showcase.apples']] as item, index (item)}
							<div class="flex items-center gap-2 rounded-field bg-base-200 p-1.5">
								<span
									class="grid size-4 place-items-center rounded border border-base-content/40"
									data-demo-click={['first-item', 'second-item'][index]}
									>{step > index ? '✓' : ''}</span
								>
								<span class:line-through={step > index}>{item}</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	</div>

	<span class="demo-pointer" bind:this={pointer}>
		<svg
			width="24"
			height="28"
			viewBox="0 0 24 28"
			fill="white"
			stroke="var(--color-primary)"
			stroke-width="1.25"
			stroke-linejoin="round"
		>
			<path
				d="M8 14V3a2 2 0 0 1 4 0v8-1a2 2 0 0 1 4 0v2a2 2 0 0 1 4 0v2a2 2 0 0 1 3 2v3a8 8 0 0 1-8 8h-2c-3 0-5-1.5-7-4l-4-5a2 2 0 0 1 3-2.5L8 18z"
			/>
		</svg>
	</span>
</div>

<style>
	.demo-selected {
		background: color-mix(in srgb, var(--color-primary) 15%, transparent);
	}
	.demo-dialog {
		position: absolute;
		inset: auto 0.75rem 0.75rem max(3.5rem, 29%);
		display: grid;
		gap: 0.5rem;
		max-width: 18rem;
		margin-inline: auto;
		border: 1px solid var(--color-primary);
		border-radius: var(--radius-box);
		background: var(--color-base-100);
		padding: 0.75rem;
		box-shadow: 0 0 0 100vmax color-mix(in srgb, var(--color-base-content) 17%, transparent);
	}

	.demo-pointer {
		position: absolute;
		z-index: 1;
		top: -2px;
		left: -10px;
		opacity: 0;
		pointer-events: none;
		transform-origin: 10px 2px;
		filter: drop-shadow(0 0 4px var(--color-primary));
	}
</style>
