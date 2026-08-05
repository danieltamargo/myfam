<script lang="ts">
	import { onMount } from 'svelte';
	import * as m from '$paraglide/messages';
	import Particles from '$lib/components/magic/Particles.svelte';
	import WordRotate from '$lib/components/magic/WordRotate.svelte';

	let scrollY = 0;
	let isHovering = false;
	let heroElement: HTMLElement;

	let targetX = 0;
	let targetY = 0;
	let currentX = 0;
	let currentY = 0;

	const base1 = { x: 0.1, y: 0.1 };
	const base2 = { x: 0.8, y: 0.2 };
	const base3 = { x: 0.3, y: 0.2 };

	let rafId: number;
	let blobTextEl: HTMLElement;

	const serviceIcons = ['📅', '💰', '📋', '🍽️', '🎯', '📚'];

	function getQualities() {
		const qualities: string[] = [];
		let i = 0;
		while (true) {
			const key = `hero.description.qualities.${i}` as keyof typeof m;
			if (key in m) {
				qualities.push((m[key] as () => string)());
				i++;
			} else break;
		}
		return qualities;
	}

	$: qualities = getQualities();

	$: services = [
		{
			icon: serviceIcons[0],
			title: m['services.modules.calendar.title'](),
			description: m['services.modules.calendar.description']()
		},
		{
			icon: serviceIcons[1],
			title: m['services.modules.finances.title'](),
			description: m['services.modules.finances.description']()
		},
		{
			icon: serviceIcons[2],
			title: m['services.modules.tasks.title'](),
			description: m['services.modules.tasks.description']()
		},
		{
			icon: serviceIcons[3],
			title: m['services.modules.meals.title'](),
			description: m['services.modules.meals.description']()
		},
		{
			icon: serviceIcons[4],
			title: m['services.modules.goals.title'](),
			description: m['services.modules.goals.description']()
		},
		{
			icon: serviceIcons[5],
			title: m['services.modules.documents.title'](),
			description: m['services.modules.documents.description']()
		}
	];

	const featureIcons = ['👨‍👩‍👧‍👦', '⚡', '🔒'];

	$: features = [
		{
			title: m['features.items.multi_family.title'](),
			description: m['features.items.multi_family.description'](),
			image: featureIcons[0]
		},
		{
			title: m['features.items.real_time.title'](),
			description: m['features.items.real_time.description'](),
			image: featureIcons[1]
		},
		{
			title: m['features.items.privacy.title'](),
			description: m['features.items.privacy.description'](),
			image: featureIcons[2]
		}
	];

	onMount(() => {
		targetX = window.innerWidth / 2;
		targetY = window.innerHeight / 2;
		currentX = targetX;
		currentY = targetY;
		animateBlobs();
		const handleScroll = () => {
			scrollY = window.scrollY;
		};
		window.addEventListener('scroll', handleScroll);
		return () => {
			window.removeEventListener('scroll', handleScroll);
			cancelAnimationFrame(rafId);
		};
	});

	$: rotation = (scrollY / 10) % 360;

	function handleMouseMove(event: MouseEvent) {
		if (!heroElement) return;
		const rect = heroElement.getBoundingClientRect();
		targetX = event.clientX - rect.left;
		targetY = event.clientY - rect.top;
		isHovering = true;
	}

	function handleTextMouseMove(event: MouseEvent) {
		if (!blobTextEl) return;
		const rect = blobTextEl.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const y = event.clientY - rect.top;

		blobTextEl.style.setProperty('--x', `${x}px`);
		blobTextEl.style.setProperty('--y', `${y}px`);
	}

	function resetTextBlob() {
		if (!blobTextEl) return;
		blobTextEl.style.setProperty('--x', `-500px`);
		blobTextEl.style.setProperty('--y', `-500px`);
	}

	function resetBlobs() {
		if (!heroElement) return;
		isHovering = false;
		const rect = heroElement.getBoundingClientRect();
		targetX = rect.width / 2;
		targetY = rect.height / 2;
	}

	function animateBlobs() {
		const speed = 0.08;

		currentX += (targetX - currentX) * speed;
		currentY += (targetY - currentY) * speed;

		const rect = heroElement?.getBoundingClientRect();

		if (rect) {
			const b1 = document.querySelector('.blob-1') as HTMLElement;
			const b2 = document.querySelector('.blob-2') as HTMLElement;
			const b3 = document.querySelector('.blob-3') as HTMLElement;

			const basePos1 = { x: rect.width * base1.x, y: rect.height * base1.y };
			const basePos2 = { x: rect.width * base2.x, y: rect.height * base2.y };
			const basePos3 = { x: rect.width * base3.x, y: rect.height * base3.y };

			const force = isHovering ? 1 : 0;

			if (b1) {
				const x = basePos1.x + (currentX - basePos1.x) * force;
				const y = basePos1.y + (currentY - basePos1.y) * force;
				b1.style.transform = `translate(${x - 200}px, ${y - 200}px)`;
			}

			if (b2) {
				const x = basePos2.x + (currentX - basePos2.x) * force;
				const y = basePos2.y + (currentY - basePos2.y) * force;
				b2.style.transform = `translate(${x - 250}px, ${y - 250}px)`;
			}

			if (b3) {
				const x = basePos3.x + (currentX - basePos3.x) * force;
				const y = basePos3.y + (currentY - basePos3.y) * force;
				b3.style.transform = `translate(${x - 300}px, ${y - 300}px) scale(${isHovering ? 1.2 : 1})`;
			}
		}

		rafId = requestAnimationFrame(animateBlobs);
	}
</script>

<svelte:window bind:scrollY />

<div class="min-h-screen bg-linear-to-b from-base-100 to-base-200">
	<section
		bind:this={heroElement}
		class="relative z-0 hero min-h-screen overflow-hidden"
		aria-label="Hero Section"
		role="banner"
		on:mousemove={handleMouseMove}
		on:mouseenter={handleMouseMove}
		on:mouseleave={resetBlobs}
	>
		<div class="relative hero-content z-20 w-full max-w-7xl px-4 text-center">
			<div class="w-full">
				<div class="mb-8">
					<h1 class="text-5xl leading-tight font-black md:text-7xl lg:text-8xl">
						<span class="relative z-10">
							<span
								bind:this={blobTextEl}
								class="interactive-blob-text relative z-10 inline-block"
								role="img"
								aria-label={m['hero.title']()}
								on:mousemove={handleTextMouseMove}
								on:mouseenter={handleTextMouseMove}
								on:mouseleave={resetTextBlob}
							>
								{m['hero.title']()}
							</span>
						</span>
					</h1>
				</div>

				<p
					class="pointer-events-none relative z-20 mx-auto mb-6 max-w-4xl text-xl font-semibold text-base-content/90 md:text-3xl lg:text-4xl"
				>
					{m['hero.subtitle']()}
				</p>

				<p
					class="pointer-events-none relative z-20 mx-auto mb-2 max-w-2xl text-base leading-relaxed text-base-content/60 md:text-lg lg:text-xl"
				>
					{@html m['hero.description.text']()}
				</p>

				<div class="pointer-events-none relative z-20 overflow-hidden">
					<WordRotate class="mb-12 text-4xl font-bold text-primary/80" words={qualities} />
				</div>

				<div class="relative z-20 flex flex-wrap justify-center gap-4">
					<a
						href="/login"
						class="btn relative z-20 px-8 text-lg shadow-lg transition-all btn-lg btn-primary hover:scale-105 hover:shadow-xl"
					>
						{m['hero.cta_primary']()}
					</a>
					<a
						href="/features"
						class="btn relative z-20 px-8 text-lg transition-all btn-outline btn-lg hover:scale-105"
					>
						{m['hero.cta_secondary']()}
					</a>
				</div>

				<div class="relative z-20 mt-16 flex flex-wrap justify-center gap-4 opacity-70">
					<div class="badge gap-2 badge-ghost badge-lg">Multi-family</div>
					<div class="badge gap-2 badge-ghost badge-lg">Real-time sync</div>
					<div class="badge gap-2 badge-ghost badge-lg">Secure & private</div>
				</div>
			</div>
		</div>

		<div class="pointer-events-none absolute inset-0 z-0 overflow-hidden">
			<div class="blob blob-1 absolute h-96 w-96 rounded-full bg-primary opacity-30 blur-3xl"></div>
			<div
				class="blob blob-2 absolute h-[500px] w-[500px] rounded-full bg-secondary opacity-25 blur-3xl"
			></div>
			<div
				class="blob blob-3 absolute h-[600px] w-[600px] rounded-full bg-accent opacity-20 blur-3xl"
			></div>
		</div>

		<Particles className="absolute inset-0 pointer-events-none z-0" refresh={true} />
	</section>

	<section class="relative bg-base-300 py-32">
		<div class="container mx-auto px-4">
			<div class="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
				<div class="space-y-6 lg:pr-8">
					<h2 class="text-4xl font-bold lg:text-5xl">{m['services.title']()}</h2>
					<p class="text-lg text-base-content/70 lg:text-xl">{m['services.description']()}</p>

					<div class="space-y-4">
						<div class="flex items-start gap-3">
							<div class="badge badge-lg badge-primary">✓</div>
							<div>
								<h3 class="text-lg font-semibold">{m['services.benefits.modular.title']()}</h3>
								<p class="text-base-content/60">{m['services.benefits.modular.description']()}</p>
							</div>
						</div>
						<div class="flex items-start gap-3">
							<div class="badge badge-lg badge-primary">✓</div>
							<div>
								<h3 class="text-lg font-semibold">{m['services.benefits.easy.title']()}</h3>
								<p class="text-base-content/60">{m['services.benefits.easy.description']()}</p>
							</div>
						</div>
						<div class="flex items-start gap-3">
							<div class="badge badge-lg badge-primary">✓</div>
							<div>
								<h3 class="text-lg font-semibold">{m['services.benefits.synced.title']()}</h3>
								<p class="text-base-content/60">{m['services.benefits.synced.description']()}</p>
							</div>
						</div>
					</div>
				</div>

				<div class="relative hidden h-[700px] items-center justify-end overflow-hidden lg:flex">
					<div class="relative h-[800px] w-[800px] translate-x-1/2">
						{#each services as service, i}
							{@const angle = i * (360 / services.length) + rotation * 2.5}
							{@const radius = 280}
							{@const x = Math.cos((angle * Math.PI) / 180) * radius}
							{@const y = Math.sin((angle * Math.PI) / 180) * radius}
							<div
								class="absolute top-1/2 left-1/2 transition-all duration-500 ease-out"
								style="transform: translate(calc(-50% + {x}px), calc(-50% + {y}px));"
							>
								<div
									class="group card w-48 cursor-pointer bg-base-100 shadow-xl transition-transform hover:scale-110"
								>
									<div class="card-body items-center p-6 text-center">
										<div class="mb-3 text-5xl">{service.icon}</div>
										<h3 class="card-title text-base">{service.title}</h3>
										<p
											class="max-h-0 overflow-hidden opacity-0 transition-all duration-500 ease-out group-hover:mt-2 group-hover:max-h-40 group-hover:opacity-100"
										>
											{service.description}
										</p>
									</div>
								</div>
							</div>
						{/each}

						<div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 transform">
							<div
								class="flex h-40 w-40 items-center justify-center rounded-full bg-linear-to-br from-primary to-secondary shadow-2xl"
							></div>
						</div>
					</div>

					<div
						class="pointer-events-none absolute inset-y-0 right-0 w-32 bg-linear-to-l from-base-300 to-transparent"
					></div>
				</div>

				<div class="relative overflow-hidden lg:hidden">
					<div
						class="animate-carousel-mobile flex gap-4"
						style="
            --item-width: 16rem;       /* w-64 */
            --item-gap: 1rem;          /* gap-4 = 1rem */
            --section-items: 6;        /* elementos reales */
            --shift: calc((var(--item-width) + var(--item-gap)) * var(--section-items));
          "
					>
						{#each [...services, ...services, ...services] as service}
							<div class="w-64 shrink-0">
								<div class="card h-full bg-base-100 shadow-xl">
									<div class="card-body items-center text-center">
										<div class="mb-3 text-5xl">{service.icon}</div>
										<h3 class="card-title">{service.title}</h3>
										<p class="text-sm text-base-content/70">{service.description}</p>
									</div>
								</div>
							</div>
						{/each}
					</div>
					<!-- <div class="absolute inset-y-0 top-0 h-8 w-full bg-linear-to-b from-base-300 to-transparent pointer-events-none"></div>
          <div class="absolute inset-y-0 top-full -translate-y-full h-8 w-full bg-linear-to-t from-base-300 to-transparent pointer-events-none"></div> -->
					<div
						class="pointer-events-none absolute inset-y-0 left-0 w-32 bg-linear-to-r from-base-300 to-transparent"
					></div>
					<div
						class="pointer-events-none absolute inset-y-0 right-0 z-10 w-32 bg-linear-to-l from-base-300 via-base-300/80 to-transparent"
					></div>
				</div>
			</div>
		</div>
	</section>

	<section class="py-32">
		<div class="container mx-auto px-4">
			<div class="mb-16 text-center">
				<h2 class="mb-4 text-5xl font-bold">{m['features.title']()}</h2>
				<p class="mx-auto max-w-2xl text-xl text-base-content/70">{m['features.subtitle']()}</p>
			</div>

			<div class="relative grid gap-8 md:grid-cols-3">
				{#each features as feature}
					<div class="hover-3d z-1">
						<div class="card bg-base-100 shadow-xl transition-shadow hover:shadow-2xl">
							<div class="card-body items-center text-center">
								<div class="mb-4 text-6xl">{feature.image}</div>
								<h3 class="mb-2 card-title text-2xl">{feature.title}</h3>
								<p class="text-base-content/70">{feature.description}</p>
							</div>
						</div>
						<div></div>
						<div></div>
						<div></div>
						<div></div>
						<div></div>
						<div></div>
						<div></div>
						<div></div>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<section class="overflow-x-clip py-32">
		<div class="relative mx-auto max-w-5xl">
			<div class="relative z-10 container mx-auto max-w-4xl px-4 text-center">
				<h2 class="mb-6 text-5xl font-bold">{m['cta.title']()}</h2>
				<p class="mx-auto mb-12 max-w-2xl text-xl text-base-content/70">{m['cta.description']()}</p>
				<div class="flex flex-wrap justify-center gap-4">
					<a href="/login" class="btn btn-lg btn-primary">{m['cta.button_primary']()}</a>
					<a href="/contact" class="btn btn-outline btn-lg">{m['cta.button_secondary']()}</a>
				</div>
			</div>

			<div class="absolute inset-0 opacity-10">
				<div class="absolute -top-48 -right-20 h-96 w-96 rounded-full bg-primary blur-3xl"></div>
				<div
					class="absolute -bottom-48 -left-20 h-96 w-96 rounded-full bg-secondary blur-3xl"
				></div>
			</div>
		</div>
	</section>

	<footer class="footer-center footer bg-base-200 p-10 text-base-content">
		<div>
			<div class="mb-2 text-4xl">🏠</div>
			<p class="text-lg font-bold">{m['hero.title']()}</p>
			<p class="text-base-content/70">{m['footer.tagline']()}</p>
		</div>
		<div>
			<div class="grid grid-flow-col gap-4">
				<a href="/features" class="link link-hover">{m['footer.links.features']()}</a>
				<a href="/contact" class="link link-hover">{m['footer.links.contact']()}</a>
				<a href="/login" class="link link-hover">{m['footer.links.login']()}</a>
			</div>
		</div>
	</footer>
</div>

<style>
	:global(html) {
		scroll-behavior: smooth;
	}
	.interactive-blob-text {
		--x: -500px;
		--y: -500px;

		--base-color: #3b82f6;
		--hover-color: #e879f9;

		background-image: radial-gradient(
			circle 500px at var(--x) var(--y),
			var(--hover-color),
			var(--base-color) 70%
		);

		background-clip: text;
		-webkit-background-clip: text;

		color: transparent;
		transition: background-image 0.05s linear;
		pointer-events: none;
	}

	.interactive-blob-text::before {
		content: '';
		position: absolute;
		top: -200px;
		bottom: -200px;
		left: -200px;
		right: -200px;
		pointer-events: auto;
	}

	.blob {
		transition: transform 0.4s ease-out;
	}
	.animate-carousel-mobile {
		animation: carousel-mobile 20s linear infinite;
	}

	.animate-carousel-mobile:hover {
		animation-play-state: paused;
	}

	@keyframes carousel-mobile {
		0% {
			transform: translateX(0);
		}
		100% {
			transform: translateX(calc(var(--shift) * -1));
		}
	}
</style>
