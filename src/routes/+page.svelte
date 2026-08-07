<script lang="ts">
	import { resolve } from '$app/paths';
	import * as m from '$paraglide/messages';
</script>

<svelte:head>
	<title>{m['meta.title']()}</title>
	<meta name="description" content={m['meta.description']()} />
	<meta name="theme-color" content="#f4a261" />
</svelte:head>

<a
	href="#main-content"
	class="btn fixed top-3 left-3 z-50 -translate-y-24 btn-primary focus:translate-y-0"
>
	{m['nav.skip']()}
</a>

<div class="min-h-screen overflow-x-clip bg-base-100 text-base-content">
	<header class="relative z-30 border-b border-base-300/70 bg-base-100/90 backdrop-blur">
		<nav
			class="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-4 px-5 sm:px-8"
			aria-label="MyFamily"
		>
			<a
				href={resolve('/')}
				class="group inline-flex min-h-12 items-center gap-3 rounded-field font-black"
			>
				<span
					class="grid size-10 rotate-[-4deg] place-items-center rounded-box bg-primary text-xl text-primary-content shadow-sm transition-transform group-hover:rotate-0"
					aria-hidden="true">⌂</span
				>
				<span class="text-xl tracking-tight">MyFamily</span>
			</a>

			<div class="hidden items-center gap-1 md:flex">
				<a href="#modules" class="btn btn-ghost">{m['nav.modules']()}</a>
				<a href="#privacy" class="btn btn-ghost">{m['nav.privacy']()}</a>
			</div>

			<div class="flex items-center gap-2">
				<a href={resolve('/login')} class="btn hidden btn-ghost sm:inline-flex"
					>{m['nav.login']()}</a
				>
				<a href={resolve('/register')} class="btn btn-primary">{m['nav.create_account']()}</a>
			</div>
		</nav>
	</header>

	<main id="main-content">
		<section class="paper-grid relative isolate overflow-hidden border-b border-base-300/70">
			<div
				class="pointer-events-none absolute -top-20 -left-24 size-72 rounded-full bg-warning/25 blur-3xl"
				aria-hidden="true"
			></div>
			<div
				class="pointer-events-none absolute top-24 -right-24 size-80 rounded-full bg-info/20 blur-3xl"
				aria-hidden="true"
			></div>

			<div
				class="relative mx-auto grid min-h-[calc(100svh-5rem)] max-w-7xl items-center gap-14 px-5 py-16 sm:px-8 lg:grid-cols-[1.04fr_0.96fr] lg:py-24"
			>
				<div class="max-w-3xl">
					<p class="mb-5 text-sm font-black tracking-[0.18em] text-primary uppercase">
						{m['hero.eyebrow']()}
					</p>
					<h1
						class="max-w-4xl text-5xl leading-[0.98] font-black tracking-[-0.045em] sm:text-6xl lg:text-7xl"
					>
						{m['hero.title']()}
					</h1>
					<p class="mt-7 max-w-2xl text-lg leading-relaxed text-base-content/70 sm:text-xl">
						{m['hero.subtitle']()}
					</p>

					<div class="mt-9 flex flex-col gap-3 sm:flex-row">
						<a href={resolve('/register')} class="btn btn-lg btn-primary sm:min-w-56">
							{m['hero.cta_primary']()}
						</a>
						<a href="#modules" class="btn btn-outline btn-lg sm:min-w-48">
							{m['hero.cta_secondary']()}
						</a>
					</div>

					<ul
						class="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold text-base-content/70"
					>
						<li class="inline-flex items-center gap-2">
							<span aria-hidden="true">●</span>{m['hero.trust_private']()}
						</li>
						<li class="inline-flex items-center gap-2">
							<span aria-hidden="true">●</span>{m['hero.trust_modular']()}
						</li>
						<li class="inline-flex items-center gap-2">
							<span aria-hidden="true">●</span>{m['hero.trust_control']()}
						</li>
					</ul>
				</div>

				<div class="relative mx-auto w-full max-w-xl" aria-label={m['preview.aria_label']()}>
					<div
						class="absolute -top-5 -right-2 z-10 rotate-3 rounded-field bg-warning px-4 py-2 text-sm font-black text-warning-content shadow-md"
					>
						{m['preview.label']()}
					</div>
					<div class="rounded-[2rem] border border-base-300 bg-base-100 p-5 shadow-2xl sm:p-7">
						<div class="mb-6 flex items-center justify-between gap-4 border-b border-base-300 pb-5">
							<div>
								<p class="text-xs font-black tracking-[0.16em] text-base-content/70 uppercase">
									MyFamily
								</p>
								<h2 class="mt-1 text-2xl font-black">{m['preview.title']()}</h2>
							</div>
							<div class="avatar avatar-placeholder" aria-hidden="true">
								<div class="w-12 rounded-full bg-neutral text-neutral-content"><span>MF</span></div>
							</div>
						</div>

						<div class="space-y-3">
							<div
								class="grid grid-cols-[auto_1fr] gap-4 rounded-box border border-info/25 bg-info/10 p-4"
							>
								<div class="rounded-field bg-info px-3 py-2 text-sm font-black text-info-content">
									{m['preview.event_time']()}
								</div>
								<div>
									<p class="text-xs font-bold text-base-content/70">
										{m['modules.planning.title']()}
									</p>
									<p class="font-bold">{m['preview.event_title']()}</p>
								</div>
							</div>
							<div
								class="grid grid-cols-[auto_1fr] gap-4 rounded-box border border-success/25 bg-success/10 p-4"
							>
								<span class="text-2xl" aria-hidden="true">✓</span>
								<div>
									<p class="text-xs font-bold text-base-content/70">{m['preview.task_label']()}</p>
									<p class="font-bold">{m['preview.task_title']()}</p>
								</div>
							</div>
							<div class="grid gap-3 sm:grid-cols-2">
								<div class="rounded-box border border-base-300 bg-base-200 p-4">
									<p class="text-xs font-bold text-base-content/70">
										{m['preview.expense_label']()}
									</p>
									<p class="mt-1 font-bold">{m['preview.expense_title']()}</p>
								</div>
								<div class="rounded-box border border-secondary/25 bg-secondary/10 p-4">
									<p class="text-xs font-bold text-base-content/70">
										{m['preview.wishlist_label']()}
									</p>
									<p class="mt-1 font-bold">{m['preview.wishlist_title']()}</p>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</section>

		<section id="modules" class="scroll-mt-20 bg-base-200 py-20 sm:py-28">
			<div class="mx-auto max-w-7xl px-5 sm:px-8">
				<div class="max-w-3xl">
					<p class="text-sm font-black tracking-[0.18em] text-primary uppercase">
						{m['modules.eyebrow']()}
					</p>
					<h2 class="mt-4 text-4xl leading-tight font-black tracking-tight sm:text-5xl">
						{m['modules.title']()}
					</h2>
					<p class="mt-5 text-lg leading-relaxed text-base-content/70">
						{m['modules.description']()}
					</p>
				</div>

				<div class="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					<article class="card bg-base-100 card-border">
						<div class="card-body">
							<span class="text-4xl" aria-hidden="true">🎁</span>
							<h3 class="mt-2 card-title">{m['modules.wishlist.title']()}</h3>
							<p class="text-base-content/70">{m['modules.wishlist.description']()}</p>
						</div>
					</article>
					<article class="card bg-base-100 card-border">
						<div class="card-body">
							<span class="text-4xl" aria-hidden="true">🗓️</span>
							<h3 class="mt-2 card-title">{m['modules.planning.title']()}</h3>
							<p class="text-base-content/70">{m['modules.planning.description']()}</p>
						</div>
					</article>
					<article class="card bg-base-100 card-border">
						<div class="card-body">
							<span class="text-4xl" aria-hidden="true">💶</span>
							<h3 class="mt-2 card-title">{m['modules.expenses.title']()}</h3>
							<p class="text-base-content/70">{m['modules.expenses.description']()}</p>
						</div>
					</article>
					<article class="card bg-base-100 card-border">
						<div class="card-body">
							<span class="text-4xl" aria-hidden="true">🔐</span>
							<h3 class="mt-2 card-title">{m['modules.private.title']()}</h3>
							<p class="text-base-content/70">{m['modules.private.description']()}</p>
						</div>
					</article>
					<article class="card bg-base-100 card-border">
						<div class="card-body">
							<span class="text-4xl" aria-hidden="true">🌱</span>
							<h3 class="mt-2 card-title">{m['modules.wellbeing.title']()}</h3>
							<p class="text-base-content/70">{m['modules.wellbeing.description']()}</p>
						</div>
					</article>
					<article class="card bg-base-100 card-border">
						<div class="card-body">
							<span class="text-4xl" aria-hidden="true">🧭</span>
							<h3 class="mt-2 card-title">{m['modules.planner.title']()}</h3>
							<p class="text-base-content/70">{m['modules.planner.description']()}</p>
						</div>
					</article>
				</div>
			</div>
		</section>

		<section id="privacy" class="scroll-mt-20 py-20 sm:py-28">
			<div
				class="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-start"
			>
				<div class="lg:sticky lg:top-28">
					<p class="text-sm font-black tracking-[0.18em] text-primary uppercase">
						{m['privacy.eyebrow']()}
					</p>
					<h2 class="mt-4 text-4xl leading-tight font-black tracking-tight sm:text-5xl">
						{m['privacy.title']()}
					</h2>
					<p class="mt-5 text-lg leading-relaxed text-base-content/70">
						{m['privacy.description']()}
					</p>
				</div>

				<ol class="space-y-4">
					<li
						class="grid gap-4 rounded-box border border-base-300 bg-base-100 p-6 shadow-sm sm:grid-cols-[4rem_1fr]"
					>
						<span class="text-5xl font-black text-primary/70" aria-hidden="true">01</span>
						<div>
							<h3 class="text-2xl font-black">{m['privacy.family_title']()}</h3>
							<p class="mt-2 text-base-content/70">{m['privacy.family_description']()}</p>
						</div>
					</li>
					<li
						class="grid gap-4 rounded-box border border-base-300 bg-base-100 p-6 shadow-sm sm:grid-cols-[4rem_1fr]"
					>
						<span class="text-5xl font-black text-primary/70" aria-hidden="true">02</span>
						<div>
							<h3 class="text-2xl font-black">{m['privacy.collection_title']()}</h3>
							<p class="mt-2 text-base-content/70">{m['privacy.collection_description']()}</p>
						</div>
					</li>
					<li
						class="grid gap-4 rounded-box border border-base-300 bg-base-100 p-6 shadow-sm sm:grid-cols-[4rem_1fr]"
					>
						<span class="text-5xl font-black text-primary/70" aria-hidden="true">03</span>
						<div>
							<h3 class="text-2xl font-black">{m['privacy.item_title']()}</h3>
							<p class="mt-2 text-base-content/70">{m['privacy.item_description']()}</p>
						</div>
					</li>
				</ol>
			</div>
		</section>

		<section class="px-5 pb-20 sm:px-8 sm:pb-28">
			<div
				class="relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-neutral px-6 py-14 text-neutral-content sm:px-12 sm:py-16"
			>
				<div
					class="pointer-events-none absolute -right-16 -bottom-28 size-72 rounded-full border-[3rem] border-primary/35"
					aria-hidden="true"
				></div>
				<div class="relative max-w-3xl">
					<h2 class="text-4xl leading-tight font-black tracking-tight sm:text-5xl">
						{m['cta.title']()}
					</h2>
					<p class="mt-5 text-lg leading-relaxed text-neutral-content/75">
						{m['cta.description']()}
					</p>
					<div class="mt-8 flex flex-col gap-3 sm:flex-row">
						<a href={resolve('/register')} class="btn btn-lg btn-primary"
							>{m['cta.button_primary']()}</a
						>
						<a href={resolve('/login')} class="btn text-neutral-content btn-outline btn-lg"
							>{m['cta.button_secondary']()}</a
						>
					</div>
				</div>
			</div>
		</section>
	</main>

	<footer class="border-t border-base-300 bg-base-200">
		<div
			class="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-10 sm:px-8 md:flex-row md:items-center md:justify-between"
		>
			<div>
				<p class="text-xl font-black">MyFamily</p>
				<p class="mt-1 text-sm text-base-content/65">{m['footer.tagline']()}</p>
			</div>
			<nav class="flex flex-wrap gap-x-6 gap-y-3 text-sm font-bold" aria-label="Footer">
				<a href="#modules" class="link link-hover">{m['nav.modules']()}</a>
				<a href="#privacy" class="link link-hover">{m['nav.privacy']()}</a>
				<a href={resolve('/login')} class="link link-hover">{m['footer.login']()}</a>
			</nav>
		</div>
	</footer>
</div>

<style>
	.paper-grid {
		background-image:
			linear-gradient(color-mix(in oklab, currentColor 5%, transparent) 1px, transparent 1px),
			linear-gradient(90deg, color-mix(in oklab, currentColor 5%, transparent) 1px, transparent 1px);
		background-size: 32px 32px;
	}
</style>
