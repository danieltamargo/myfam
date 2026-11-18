<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import LandingModulePreview from '$lib/components/layout/LandingModulePreview.svelte';
	import { fly } from 'svelte/transition';
	import { MODULE_CATALOG, type ModuleId } from '$lib/config/modules';
	import * as m from '$paraglide/messages';

	const modules = ['calendar', 'expenses', 'wishlist', 'lists'] as const;
	const wheel = ['calendar', 'tasks', 'expenses', 'wishlist', 'meals', 'lists'] as const;
	const scenes = [
		'planner',
		'calendar',
		'tasks',
		'lists',
		'wishlist',
		'members',
		'expenses'
	] as const;
	const members = [
		{ name: 'Álex', initials: 'Á', color: 'bg-primary/15' },
		{ name: 'Noa', initials: 'N', color: 'bg-secondary/20' },
		{ name: 'Sam', initials: 'S', color: 'bg-warning/20' }
	];
	const reasons = ['shared', 'flexible', 'private'] as const;
	let wheelSection: HTMLElement;
	let carousel: HTMLElement;
	let activeModule = $state(0);
	let carouselVisible = $state(false);
	let pageVisible = $state(true);
	const moduleId = $derived(modules[activeModule]);
	const slideDuration = 5000;
	let rotation = $state(0);
	let scene = $state(0);
	let demoReady = $state(false);
	let reducedMotion = $state(false);
	const currentScene = $derived(scenes[scene]);

	function reveal(node: HTMLElement) {
		if (
			!('IntersectionObserver' in window) ||
			matchMedia('(prefers-reduced-motion: reduce)').matches
		)
			return;
		const observer = new IntersectionObserver(
			([entry]) => {
				if (!entry?.isIntersecting) return;
				node.classList.remove('waiting');
				observer.disconnect();
			},
			{ threshold: 0.12 }
		);
		node.classList.add('waiting');
		observer.observe(node);
		return { destroy: () => observer.disconnect() };
	}

	onMount(() => {
		demoReady = true;
		const motion = matchMedia('(prefers-reduced-motion: reduce)');
		let frame = 0;
		function updateWheel() {
			frame = 0;
			const rect = wheelSection.getBoundingClientRect();
			const progress = (innerHeight - rect.top) / (innerHeight + rect.height);
			rotation = reducedMotion ? 0 : Math.max(0, Math.min(progress, 1)) * 300;
		}
		function scroll() {
			if (!frame) frame = requestAnimationFrame(updateWheel);
		}
		function updateMotion() {
			reducedMotion = motion.matches;
			scroll();
		}
		updateMotion();
		motion.addEventListener('change', updateMotion);
		window.addEventListener('scroll', scroll, { passive: true });
		window.addEventListener('resize', scroll);
		const timer = window.setInterval(() => {
			if (!reducedMotion && !document.hidden) scene = (scene + 1) % scenes.length;
		}, 3500);
		function updateVisibility() {
			pageVisible = !document.hidden;
		}
		updateVisibility();
		document.addEventListener('visibilitychange', updateVisibility);
		const observer =
			'IntersectionObserver' in window
				? new IntersectionObserver(
						([entry]) => {
							carouselVisible = Boolean(entry?.isIntersecting);
						},
						{ threshold: 0.01 }
					)
				: null;
		observer?.observe(carousel);
		if (!observer) carouselVisible = true;
		return () => {
			clearInterval(timer);
			document.removeEventListener('visibilitychange', updateVisibility);
			observer?.disconnect();
			cancelAnimationFrame(frame);
			window.removeEventListener('scroll', scroll);
			window.removeEventListener('resize', scroll);
			motion.removeEventListener('change', updateMotion);
		};
	});

	$effect(() => {
		if (!carouselVisible || reducedMotion || !pageVisible) return;
		const next = (activeModule + 1) % modules.length;
		const timer = window.setTimeout(() => (activeModule = next), slideDuration);
		return () => window.clearTimeout(timer);
	});
</script>

{#snippet sketch(id: ModuleId, loop: boolean)}
	<div class="sketch grid min-h-33 content-start gap-2" class:sketch-loop={loop}>
		<div class="flex items-center justify-between gap-2 text-xs font-semibold">
			{#if loop}<span>{m[`app_nav.${id}`]()}</span>{/if}
			<span class="sketch-edit ml-auto rounded-field bg-primary/10 px-2 py-1 text-primary"
				>{m[`demo_action.${id}`]()}</span
			>
		</div>
		{#if id === 'wishlist'}
			<div class="grid grid-cols-2 gap-2">
				{#each [{ icon: '🎲', title: m['demo_item.wishlist']() }, { icon: '📚', title: m['demo_detail.books']() }] as gift, index (gift.title)}
					<div class="min-w-0 overflow-hidden rounded-lg border border-base-300">
						<div
							class="grid h-11 place-items-center bg-secondary/15 text-xl sm:h-18 sm:text-3xl"
							aria-hidden="true"
						>
							{gift.icon}
						</div>
						<div class="space-y-1 p-1.5 sm:p-2">
							<p class="text-xs font-semibold break-words">{gift.title}</p>
							{#if index === 0}
								<span
									class="sketch-bought inline-block rounded-field bg-success/20 px-1.5 py-1 text-[.62rem] font-semibold"
									>{m['ui.purchased']()}</span
								>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{:else if id === 'members'}
			<ul class="space-y-1">
				{#each members as member (member.name)}
					<li class="flex items-center gap-2 rounded-lg bg-base-200 p-1.5 text-xs">
						<span
							class="grid size-6 shrink-0 place-items-center rounded-full font-semibold {member.color}"
							aria-hidden="true">{member.initials}</span
						>
						<span>{member.name}</span>
					</li>
				{/each}
				<li
					class="sketch-result flex items-center gap-2 rounded-lg border border-dashed border-base-300 p-1.5 text-xs"
				>
					<span
						class="grid size-6 shrink-0 place-items-center rounded-full bg-success/20 font-semibold"
						aria-hidden="true">C</span
					>
					<span>Cris · {m['demo_status.members']()}</span>
				</li>
			</ul>
		{:else if id === 'lists'}
			<ul class="space-y-1">
				{#each [m['demo_item.lists'](), m['demo_detail.bread'](), m['demo_detail.yogurt']()] as item, index (item)}
					<li
						class="sketch-list-row flex items-center gap-2 rounded-lg bg-base-200 px-2 py-1.5 text-xs"
						class:sketch-list-complete={index < 2}
						style:--item-delay={`${index * 440}ms`}
					>
						<span
							class="relative grid size-3.5 shrink-0 place-items-center rounded-sm border border-base-content/35"
							data-demo-click={loop && index < 2 ? '' : undefined}
							aria-hidden="true"
						>
							{#if index < 2}<span class="sketch-tick absolute text-success">✓</span>{/if}
						</span>
						<span>{item}</span>
					</li>
				{/each}
			</ul>
		{:else}
			{#if id === 'calendar'}
				<div class="grid grid-cols-7 gap-1" aria-hidden="true">
					{#each loop ? Array.from({ length: 28 }, (_, i) => i + 1) : [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25] as day (day)}
						<span
							class="rounded-field bg-base-200 py-1 text-center text-[.65rem]"
							class:sketch-selected={day === 15 || day === 19}>{day}</span
						>
					{/each}
				</div>
				<p class="flex items-center gap-2 rounded-lg bg-base-200 px-2 py-1.5 text-xs">
					<span class="size-2 shrink-0 rounded-full bg-secondary" aria-hidden="true"></span>{m[
						'demo_item.planner'
					]()}
				</p>
			{:else if id === 'expenses' || id === 'habits'}
				<div class="flex h-7 items-end gap-1" aria-hidden="true">
					{#each [35, 65, 45, 85, 60, 95] as height (height)}
						<span class="sketch-bar flex-1 rounded-t-sm bg-primary/35" style:height={`${height}%`}
						></span>
					{/each}
				</div>
			{:else if id === 'tasks' || id === 'planner'}
				<div class="flex items-center gap-2 rounded-lg border border-base-300 px-2 py-1.5 text-xs">
					<span aria-hidden="true">{id === 'tasks' ? '☐' : '◷'}</span>
					{m['demo_detail.family_walk']()}
				</div>
			{:else}
				<div class="flex gap-1" aria-hidden="true">
					<span class="h-1.5 w-12 rounded-full bg-base-300"></span>
					<span class="h-1.5 w-7 rounded-full bg-base-300"></span>
				</div>
			{/if}
			<div
				class="sketch-result grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-lg bg-base-200 px-2 py-2 text-[.7rem] sm:text-xs"
			>
				<span aria-hidden="true">{MODULE_CATALOG[id].icon}</span>
				<div class="min-w-0">
					<p class="font-semibold break-words">{m[`demo_item.${id}`]()}</p>
					<p class="text-base-content/70">
						{id === 'tasks' ? m['landing.done']() : m[`demo_status.${id}`]()}
					</p>
				</div>
			</div>
		{/if}
	</div>
{/snippet}

<svelte:head>
	<title>{m['meta.title']()}</title>
	<meta name="description" content={m['meta.description']()} />
</svelte:head>

<a
	href="#main-content"
	class="btn fixed top-3 left-3 z-50 -translate-y-24 btn-primary focus:translate-y-0"
>
	{m['nav.skip']()}
</a>

<div class="min-h-screen overflow-x-clip bg-base-100 text-base-content">
	<header class="border-b border-base-300/70">
		<nav
			class="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 pr-27 pl-4 sm:pr-32 sm:pl-8"
			aria-label="MyFamily"
		>
			<a href={resolve('/')} class="inline-flex items-center gap-2 rounded-field text-lg font-bold">
				<span
					class="hidden size-8 -rotate-6 place-items-center rounded-lg bg-primary text-primary-content sm:grid"
					aria-hidden="true">⌂</span
				>
				MyFamily
			</a>
			<a href={resolve('/login')} class="btn whitespace-nowrap btn-sm btn-primary"
				>{m['nav.login']()}</a
			>
		</nav>
	</header>

	<main id="main-content">
		<section class="hero-paper">
			<div
				class="mx-auto grid max-w-7xl items-center gap-12 px-5 py-18 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:py-28"
			>
				<div>
					<h1
						class="max-w-3xl text-[clamp(2.7rem,7vw,5.4rem)] leading-[0.98] font-black tracking-[-0.055em]"
					>
						{m['landing.title']()}
					</h1>
					<p class="mt-6 max-w-lg text-lg leading-relaxed text-base-content/75">
						{m['landing.intro']()}
					</p>
				</div>
				<div
					class="mx-auto grid w-full max-w-lg grid-cols-[minmax(5.2rem,.9fr)_minmax(0,2.6fr)] overflow-hidden rounded-[1.5rem] border border-base-300 bg-base-100 shadow-xl"
					role="region"
					aria-label={m['preview.aria_label']()}
				>
					<div class="flex flex-col gap-1 border-r border-base-300 bg-base-200 p-2 sm:p-3">
						<p class="mb-2 px-1 text-xs font-bold">MyFamily</p>
						{#each scenes as item, index (item)}
							<button
								type="button"
								class="btn justify-start gap-1 px-1 text-left text-[.61rem] btn-xs sm:px-2 sm:text-xs"
								class:btn-primary={scene === index}
								class:btn-ghost={scene !== index}
								aria-pressed={scene === index}
								disabled={!demoReady}
								onclick={() => (scene = index)}
							>
								<span class="hidden sm:inline" aria-hidden="true">{MODULE_CATALOG[item].icon}</span>
								{m[`app_nav.${item}`]()}
							</button>
						{/each}
					</div>
					<div class="min-w-0 p-3 sm:p-5">
						<p class="border-b border-base-300 pb-3 text-sm font-bold">{m['preview.label']()}</p>
						{#key currentScene}
							<div class="preview-scene grid min-h-59 content-start gap-3 pt-4">
								<h2 class="text-base font-bold sm:text-lg">{m[`app_nav.${currentScene}`]()}</h2>
								{@render sketch(currentScene, false)}
							</div>
						{/key}
					</div>
				</div>
			</div>
		</section>

		<section id="modules" bind:this={wheelSection} class="bg-base-200">
			<div
				class="mx-auto grid max-w-7xl items-center gap-8 px-5 py-14 sm:px-8 lg:grid-cols-2 lg:py-20"
			>
				<div class="reveal" use:reveal>
					<h2 class="max-w-lg text-4xl leading-tight font-black tracking-tight sm:text-5xl">
						{m['landing.modules']()}
					</h2>
					<p class="mt-4 max-w-md text-lg text-base-content/75">{m['landing.module_intro']()}</p>
				</div>
				<div class="wheel-window reveal lg:-mr-8" use:reveal aria-hidden="true">
					<div class="wheel">
						{#each wheel as id, index (id)}
							<div class="wheel-spoke" style:--angle={`${index * 60 + rotation}deg`}>
								<div class="wheel-card">
									<span>{MODULE_CATALOG[id].icon}</span>
									<span>{m[`app_nav.${id}`]()}</span>
								</div>
							</div>
						{/each}
					</div>
				</div>
			</div>
		</section>

		<section class="reveal mx-auto max-w-5xl px-5 py-16 sm:px-8" aria-labelledby="module-cards">
			<h2 id="module-cards" class="mb-5 text-3xl font-black tracking-tight">
				{m['landing.explore']()}
			</h2>
			<div class="mb-4 flex flex-wrap gap-2">
				{#each modules as id, index (id)}
					<button
						type="button"
						class="btn btn-circle"
						class:btn-primary={moduleId === id}
						aria-label={m[`app_nav.${id}`]()}
						title={m[`app_nav.${id}`]()}
						aria-pressed={moduleId === id}
						disabled={!demoReady}
						onclick={() => (activeModule = index)}
					>
						<span aria-hidden="true">{MODULE_CATALOG[id].icon}</span>
					</button>
				{/each}
			</div>
			<div class="grid overflow-clip rounded-box" bind:this={carousel}>
				{#key moduleId}
					<article
						class="module-card col-start-1 row-start-1 grid min-w-0 grid-rows-[8rem_auto] gap-4 rounded-box border border-base-300 p-4 sm:grid-rows-[6.5rem_auto] sm:p-6"
						in:fly={{
							x: reducedMotion ? 0 : '-100%',
							duration: reducedMotion ? 0 : 280,
							opacity: 1
						}}
						out:fly={{
							x: reducedMotion ? 0 : '100%',
							duration: reducedMotion ? 0 : 280,
							opacity: 1
						}}
					>
						<div>
							<h3 class="text-xl font-bold sm:text-2xl">
								{moduleId === 'calendar'
									? m['showcase.calendar_planner']()
									: m[`app_nav.${moduleId}`]()}
							</h3>
							<p class="mt-2 text-sm text-base-content/75">{m[`landing.${moduleId}`]()}</p>
							{#if moduleId === 'expenses'}<p class="mt-2 text-sm text-base-content/75">
									{m['showcase.expense_event']()}
								</p>{/if}
						</div>
						<LandingModulePreview
							module={moduleId}
							playing={carouselVisible && pageVisible && !reducedMotion}
						/>
					</article>
				{/key}
			</div>
		</section>

		<section class="bg-base-200">
			<div class="reveal mx-auto max-w-7xl px-5 py-16 sm:px-8" use:reveal>
				<h2 class="text-4xl font-black tracking-tight">{m['landing.why']()}</h2>
				<div class="mt-7 grid gap-5 md:grid-cols-3">
					{#each reasons as reason (reason)}
						<article class="rounded-box bg-base-100 p-6">
							<h3 class="text-xl font-bold">{m[`landing.why_${reason}`]()}</h3>
							<p class="mt-2 text-base-content/75">{m[`landing.why_${reason}_detail`]()}</p>
						</article>
					{/each}
				</div>
			</div>
		</section>
	</main>
	<footer class="mx-auto max-w-7xl px-5 py-8 text-sm font-semibold sm:px-8">MyFamily</footer>
</div>

<style>
	.hero-paper {
		background:
			radial-gradient(
				ellipse at 86% 20%,
				color-mix(in oklab, var(--color-secondary) 21%, transparent),
				transparent 55%
			),
			radial-gradient(
				ellipse at 8% 90%,
				color-mix(in oklab, var(--color-warning) 18%, transparent),
				transparent 55%
			);
	}
	.wheel-window {
		position: relative;
		min-height: clamp(17rem, 39vw, 30rem);
		overflow: hidden;
		mask-image:
			linear-gradient(to right, transparent, black 9%, black 85%, transparent),
			linear-gradient(to bottom, transparent, black 12%, black 84%, transparent);
		mask-composite: intersect;
	}
	.wheel {
		position: absolute;
		top: 10%;
		left: 15%;
		width: min(174%, 49rem);
		aspect-ratio: 1;
		container-type: inline-size;
	}
	.wheel::before {
		content: '';
		position: absolute;
		inset: 14%;
		border: 1px dashed var(--color-base-content);
		opacity: 0.24;
		border-radius: 50%;
	}
	.wheel-spoke {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: rotate(var(--angle)) translateX(35cqw) rotate(calc(-1 * var(--angle)));
	}
	.wheel-card {
		transform: translate(-50%, -50%);
		display: grid;
		place-items: center;
		width: 27cqw;
		min-height: 18cqw;
		padding: 0.35rem;
		border-radius: 0.85rem;
		background: var(--color-base-100);
		box-shadow: 0 0.35rem 0.85rem color-mix(in oklab, var(--color-base-content) 13%, transparent);
		font-size: clamp(0.78rem, 3cqw, 1.15rem);
		font-weight: 700;
	}
	.wheel-card span:first-child {
		font-size: clamp(1.25rem, 5.5cqw, 2.4rem);
	}
	.wheel-spoke:hover {
		z-index: 1;
	}
	.wheel-card:hover {
		scale: 1.12;
	}
	.module-card {
		background: color-mix(in oklab, var(--color-secondary) 10%, var(--color-base-100));
	}
	.module-card:nth-child(3n + 2) {
		background: color-mix(in oklab, var(--color-warning) 13%, var(--color-base-100));
	}
	.module-card:nth-child(3n) {
		background: color-mix(in oklab, var(--color-success) 10%, var(--color-base-100));
	}
	.sketch-selected {
		background: color-mix(in oklab, var(--color-primary) 17%, var(--color-base-100));
		color: var(--color-primary);
		font-weight: 700;
	}
	@media (prefers-reduced-motion: no-preference) {
		.wheel-card {
			transition: scale 170ms ease;
		}
		.sketch-bought {
			animation: demo-result 420ms 800ms both;
		}
		.sketch-loop .sketch-bought {
			animation: demo-result-loop 4500ms ease infinite;
		}
		.sketch-list-complete {
			animation: check-and-clear 3s var(--item-delay) both;
		}
		.sketch-loop .sketch-list-complete {
			animation: check-and-clear 4.5s var(--item-delay) infinite;
		}
		.sketch-tick {
			animation: show-tick 3s var(--item-delay) both;
		}
		.sketch-loop .sketch-tick {
			animation: show-tick 4.5s var(--item-delay) infinite;
		}
		.reveal {
			transition:
				opacity 520ms ease,
				translate 520ms ease;
		}
		.reveal:global(.waiting) {
			opacity: 0;
			translate: 0 1rem;
		}
		.preview-scene {
			animation: arrive 370ms ease both;
		}
		.sketch-edit {
			animation: edit-pulse 1600ms ease both;
		}
		.sketch-result {
			animation: demo-result 650ms 450ms ease both;
		}
		.sketch-bar {
			transform-origin: bottom;
			animation: grow-bar 650ms 400ms ease both;
		}
		.sketch-loop .sketch-edit {
			animation: edit-pulse 4500ms ease infinite;
		}
		.sketch-loop .sketch-result {
			animation: demo-result-loop 4500ms ease infinite;
		}
		.module-card {
			transition: translate 190ms ease;
		}
		.module-card:hover {
			translate: 0 -0.25rem;
		}
	}
	@keyframes check-and-clear {
		0%,
		32% {
			opacity: 1;
			translate: 0;
			max-height: 2.5rem;
		}
		42%,
		52% {
			opacity: 0.68;
			text-decoration: line-through;
		}
		65%,
		100% {
			opacity: 0;
			translate: 0.55rem 0;
			max-height: 0;
			padding-block: 0;
			overflow: hidden;
		}
	}
	@keyframes show-tick {
		0%,
		30% {
			opacity: 0;
		}
		38%,
		100% {
			opacity: 1;
		}
	}
	@keyframes edit-pulse {
		0%,
		100% {
			opacity: 0.75;
		}
		20%,
		45% {
			opacity: 1;
			scale: 1.04;
		}
	}
	@keyframes demo-result {
		from {
			opacity: 0;
			translate: 0 0.35rem;
		}
		to {
			opacity: 1;
			translate: 0 0;
		}
	}
	@keyframes demo-result-loop {
		0%,
		12% {
			opacity: 0;
			translate: 0 0.35rem;
		}
		28%,
		86% {
			opacity: 1;
			translate: 0 0;
		}
		100% {
			opacity: 0;
		}
	}
	@keyframes grow-bar {
		from {
			scale: 1 0.25;
		}
		to {
			scale: 1 1;
		}
	}
	@keyframes arrive {
		from {
			opacity: 0;
			translate: 0.5rem 0;
		}
		to {
			opacity: 1;
			translate: 0 0;
		}
	}
</style>
