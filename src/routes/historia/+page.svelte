<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { getLocale } from '$paraglide/runtime';
	import LandingModulePreview from '$lib/components/layout/LandingModulePreview.svelte';

	const english = $derived(getLocale() === 'en');
	const copy = $derived(
		english
			? {
					login: 'Sign in',
					back: 'Original landing',
					nav: 'The family story',
					intro: 'A little more time together.',
					scroll: 'Scroll. The story starts at home.',
					dinner: 'It all starts around a table.',
					dinnerText: 'Stories from the day. Plans for tomorrow. And someone’s birthday coming up.',
					gifts: '“What would they really like?”',
					giftsText: 'Two people. Plenty of ideas. And the same question.',
					idea: '“Wait… I know where to look.”',
					wishText: 'Their ideas, all in one place. Choose a gift and keep the surprise.',
					shopping: 'A list. A team.',
					shoppingText: 'Add what’s missing. Tick it off as you shop. Everyone stays up to date.',
					games: 'Your turn. And one more round.',
					gamesText: 'Play together, wherever everyone happens to be.',
					events: 'Make room for the good days.',
					eventsText: 'Birthdays, appointments and that lunch you’ve been meaning to plan.',
					expenses: 'Sharing the moment. And the bill.',
					expensesText: 'Record expenses, choose who shares them and see suggested reimbursements.',
					more: 'And all the little things in between.',
					moreText:
						'Tasks, notes, meals, habits, documents… your family has its own way of doing things.',
					pricing: 'Your family. Your pace.',
					free: 'Start together',
					freePrice: 'Free',
					freeText: 'Members, Wishlist and games.',
					paid: 'The whole family toolkit',
					paidText: 'All the other modules, together in one family plan.',
					month: '/ month per family',
					cta: 'Create my family',
					paidCta: 'Start with my family',
					foot: 'A little less organising. A little more living.',
					labels: ['Home', 'Wishlist', 'Shopping', 'Games', 'Calendar', 'Expenses', 'Plans'],
					modules: ['Wishlist', 'Lists', 'Games', 'Calendar + Planner', 'Expenses'],
					descriptions: [
						'Gift ideas for each person, with surprises kept safe.',
						'Shared lists that keep up with everyone.',
						'A reason to spend another moment together.',
						'Your events and your everyday plans in one place.',
						'Shared expenses and clear suggested reimbursements.'
					]
				}
			: {
					login: 'Iniciar sesión',
					back: 'Landing original',
					nav: 'La historia de la familia',
					intro: 'Un poquito más de tiempo juntos.',
					scroll: 'Baja. La historia empieza en casa.',
					dinner: 'Todo empieza alrededor de una mesa.',
					dinnerText: 'Historias del día. Planes para mañana. Y un cumpleaños que se acerca.',
					gifts: '«¿Qué le hará ilusión de verdad?»',
					giftsText: 'Dos personas. Un montón de ideas. Y la misma pregunta.',
					idea: '«Espera… sé dónde mirar».',
					wishText: 'Sus ideas, todas juntas. Elige un regalo y guarda la sorpresa.',
					shopping: 'Una lista. Un equipo.',
					shoppingText: 'Añadid lo que falta. Marcadlo al comprar. Todos al día.',
					games: 'Tu turno. Y otra partida.',
					gamesText: 'Jugad juntos, esté cada uno donde esté.',
					events: 'Haced sitio a los días bonitos.',
					eventsText: 'Cumpleaños, citas y esa comida que tenéis pendiente.',
					expenses: 'Compartir el momento. Y la cuenta.',
					expensesText:
						'Registrad gastos, elegid a quién afectan y consultad los reembolsos sugeridos.',
					more: 'Y todo lo que pasa entre medias.',
					moreText: 'Tareas, notas, comidas, hábitos, documentos… cada familia tiene su manera.',
					pricing: 'Tu familia. A vuestro ritmo.',
					free: 'Empezad juntos',
					freePrice: 'Gratis',
					freeText: 'Miembros, Wishlist y juegos.',
					paid: 'Todo para organizaros',
					paidText: 'El resto de módulos, juntos en un plan familiar.',
					month: '/ mes por familia',
					cta: 'Crear mi familia',
					paidCta: 'Empezar con mi familia',
					foot: 'Un poco menos de organizar. Un poco más de vivir.',
					labels: ['Inicio', 'Wishlist', 'Compra', 'Juegos', 'Calendario', 'Gastos', 'Planes'],
					modules: ['Wishlist', 'Listas', 'Juegos', 'Calendario + Planner', 'Gastos'],
					descriptions: [
						'Ideas de regalo para cada persona, con las sorpresas a salvo.',
						'Listas compartidas que siguen el ritmo de todos.',
						'Una excusa para pasar otro ratito juntos.',
						'Los eventos y los planes del día a día, en un mismo sitio.',
						'Gastos compartidos y reembolsos sugeridos claros.'
					]
				}
	);
	const stops = ['inicio', 'wishlist', 'compra', 'juegos', 'eventos', 'gastos', 'planes'];
	let active = $state('inicio');
	let visible = $state<string[]>([]);
	let reducedMotion = $state(false);

	function parallax(node: HTMLElement) {
		let frame = 0;
		function draw() {
			frame = 0;
			const rect = node.getBoundingClientRect();
			const progress = Math.max(
				-1,
				Math.min(1, (innerHeight / 2 - rect.top - rect.height / 2) / innerHeight)
			);
			node.style.setProperty('--travel', reducedMotion ? '0px' : `${progress * 120}px`);
			node.style.setProperty('--drift', reducedMotion ? '0px' : `${progress * -36}px`);
		}
		function update() {
			if (!frame) frame = requestAnimationFrame(draw);
		}
		update();
		window.addEventListener('scroll', update, { passive: true });
		window.addEventListener('resize', update);
		return {
			destroy() {
				cancelAnimationFrame(frame);
				window.removeEventListener('scroll', update);
				window.removeEventListener('resize', update);
			}
		};
	}

	onMount(() => {
		const media = matchMedia('(prefers-reduced-motion: reduce)');
		function updateMotion() {
			reducedMotion = media.matches;
		}
		updateMotion();
		media.addEventListener('change', updateMotion);
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) continue;
					if (!visible.includes(entry.target.id)) visible = [...visible, entry.target.id];
				}
			},
			{ threshold: 0.18 }
		);
		const sections = [...document.querySelectorAll<HTMLElement>('.story-scene')];
		sections.forEach((section) => observer.observe(section));
		let frame = 0;
		function updateAnchor() {
			frame = 0;
			const current = sections
				.filter((section) => stops.includes(section.id))
				.reduce((closest, section) =>
					Math.abs(section.getBoundingClientRect().top) <
					Math.abs(closest.getBoundingClientRect().top)
						? section
						: closest
				);
			active = current.id;
		}
		function scroll() {
			if (!frame) frame = requestAnimationFrame(updateAnchor);
		}
		window.addEventListener('scroll', scroll, { passive: true });
		updateAnchor();
		return () => {
			observer.disconnect();
			media.removeEventListener('change', updateMotion);
			window.removeEventListener('scroll', scroll);
			cancelAnimationFrame(frame);
		};
	});
</script>

<svelte:head>
	<title>MyFamily · {copy.intro}</title>
	<meta name="description" content={copy.foot} />
</svelte:head>

{#snippet moduleName(index: number, scene: string)}
	<div class="module-name" class:entered={visible.includes(scene)}>
		<button
			class="letter-title"
			type="button"
			aria-label={copy.modules[index]}
			aria-describedby={`module-summary-${index}`}
		>
			{#each [...copy.modules[index]] as letter, position (position)}
				<span
					aria-hidden="true"
					style:--delay={`${((position * 7) % 11) * 45}ms`}
					style:--angle={`${position % 2 ? -12 : 12}deg`}>{letter === ' ' ? '\u00a0' : letter}</span
				>
			{/each}
		</button>
		<p id={`module-summary-${index}`} class="module-summary">{copy.descriptions[index]}</p>
	</div>
{/snippet}

<div class="paper-story" class:reduced-motion={reducedMotion}>
	<a class="skip-story" href="#planes">{copy.pricing}</a>
	<header class="story-header">
		<a href={resolve('/')} class="wordmark" aria-label={copy.back}>MyFamily</a>
		<a class="story-login" href={resolve('/login')}>{copy.login}</a>
	</header>
	<nav class="story-nav" class:on-dark={active === 'planes'} aria-label={copy.nav}>
		{#each stops as stop, index (stop)}
			<a
				href={`#${stop}`}
				aria-label={copy.labels[index]}
				class:current={active === stop}
				aria-current={active === stop ? 'location' : undefined}
			>
				<span class="nav-dot"></span><span class="nav-label">{copy.labels[index]}</span>
			</a>
		{/each}
	</nav>

	<main>
		<section id="inicio" class="story-scene opening" use:parallax>
			<div class="opening-copy"><p>{copy.intro}</p></div>
			<img
				class="hanging-sign"
				src="/images/story/sign.png"
				alt="MyFamily"
				width="1774"
				height="887"
				fetchpriority="high"
			/>
			<div class="scroll-cue"><span></span>{copy.scroll}</div>
			<div class="paper-floor"></div>
		</section>

		<section
			id="mesa"
			class="story-scene dinner"
			class:entered={visible.includes('mesa')}
			use:parallax
		>
			<div class="scene-copy">
				<h1>{copy.dinner}</h1>
				<p>{copy.dinnerText}</p>
			</div>
			<div class="stage">
				<span class="paper-orbit"></span><img
					class="cast"
					src="/images/story/dinner.png"
					alt=""
					width="1752"
					height="897"
					loading="lazy"
				/>
			</div>
		</section>

		<section
			id="regalo"
			class="story-scene puzzling"
			class:entered={visible.includes('regalo')}
			use:parallax
		>
			<div class="scene-copy">
				<h2>{copy.gifts}</h2>
				<p>{copy.giftsText}</p>
			</div>
			<div class="stage">
				<span class="paper-circle"></span><img
					class="cast"
					src="/images/story/gifts.png"
					alt=""
					width="1536"
					height="1024"
					loading="lazy"
				/>
			</div>
		</section>

		<section
			id="wishlist"
			class="story-scene wishlist"
			class:entered={visible.includes('wishlist')}
			use:parallax
		>
			<div class="scene-copy">
				<h2>{copy.idea}</h2>
				<p>{copy.wishText}</p>
				{@render moduleName(0, 'wishlist')}
			</div>
			<div class="wishlist-stage">
				<img
					class="idea-cast"
					src="/images/story/idea.png"
					alt=""
					width="1220"
					height="1289"
					loading="lazy"
				/>
				<div class="phone">
					<div class="phone-camera"></div>
					<div class="phone-screen">
						<LandingModulePreview
							module="wishlist"
							playing={visible.includes('wishlist') && active === 'wishlist' && !reducedMotion}
						/>
					</div>
					<span class="phone-home"></span>
				</div>
			</div>
		</section>

		<section
			id="compra"
			class="story-scene shopping"
			class:entered={visible.includes('compra')}
			use:parallax
		>
			<div class="scene-copy">
				<h2>{copy.shopping}</h2>
				<p>{copy.shoppingText}</p>
				{@render moduleName(1, 'compra')}
			</div>
			<div class="stage">
				<span class="paper-circle"></span><img
					class="cast"
					src="/images/story/shopping.png"
					alt=""
					width="1536"
					height="1024"
					loading="lazy"
				/><span class="paper-tag">✓</span>
			</div>
		</section>

		<section
			id="juegos"
			class="story-scene games"
			class:entered={visible.includes('juegos')}
			use:parallax
		>
			<div class="scene-copy">
				<h2>{copy.games}</h2>
				<p>{copy.gamesText}</p>
				{@render moduleName(2, 'juegos')}
			</div>
			<div class="stage">
				<span class="paper-orbit"></span><img
					class="cast"
					src="/images/story/games.png"
					alt=""
					width="1536"
					height="1024"
					loading="lazy"
				/><span class="paper-tag">6</span>
			</div>
		</section>

		<section
			id="eventos"
			class="story-scene events"
			class:entered={visible.includes('eventos')}
			use:parallax
		>
			<div class="scene-copy">
				<h2>{copy.events}</h2>
				<p>{copy.eventsText}</p>
				{@render moduleName(3, 'eventos')}
			</div>
			<div class="stage">
				<span class="paper-circle"></span><img
					class="cast"
					src="/images/story/events.png"
					alt=""
					width="1536"
					height="1024"
					loading="lazy"
				/>
			</div>
		</section>

		<section
			id="gastos"
			class="story-scene expenses"
			class:entered={visible.includes('gastos')}
			use:parallax
		>
			<div class="scene-copy">
				<h2>{copy.expenses}</h2>
				<p>{copy.expensesText}</p>
				{@render moduleName(4, 'gastos')}
			</div>
			<div class="stage">
				<span class="paper-orbit"></span><img
					class="cast"
					src="/images/story/expenses.png"
					alt=""
					width="1536"
					height="1024"
					loading="lazy"
				/>
			</div>
		</section>

		<section
			id="muchomas"
			class="story-scene more"
			class:entered={visible.includes('muchomas')}
			use:parallax
		>
			<div class="scene-copy">
				<h2>{copy.more}</h2>
				<p>{copy.moreText}</p>
			</div>
			<div class="paper-notes" aria-hidden="true">
				{#each english ? ['Cook something', 'Remember', 'Make plans', 'Take care'] : ['Cocinar algo', 'Recordar', 'Hacer planes', 'Cuidarnos'] as note, index (note)}
					<span
						style:--note-angle={`${index % 2 ? 8 : -7}deg`}
						style:--note-delay={`${index * -0.8}s`}>{note}</span
					>
				{/each}
			</div>
		</section>

		<section id="planes" class="story-scene pricing" class:entered={visible.includes('planes')}>
			<h2>{copy.pricing}</h2>
			<div class="pricing-grid">
				<article class="price-card">
					<p class="plan-title">{copy.free}</p>
					<strong class="price">{copy.freePrice}</strong>
					<p>{copy.freeText}</p>
					<a href={resolve('/register')}>{copy.cta}</a>
				</article>
				<article class="price-card full-plan">
					<p class="plan-title">{copy.paid}</p>
					<p class="price">8 €<span>{copy.month}</span></p>
					<p>{copy.paidText}</p>
					<ul>
						<li>{english ? 'Calendar and Planner' : 'Calendario y Planner'}</li>
						<li>{english ? 'Expenses and lists' : 'Gastos y listas'}</li>
						<li>
							{english
								? 'Tasks, notes, meals, habits and documents'
								: 'Tareas, notas, comidas, hábitos y documentos'}
						</li>
					</ul>
					<a href={resolve('/register')}>{copy.paidCta}</a>
				</article>
			</div>
			<footer>
				<a href={resolve('/')}>MyFamily</a>
				<p>{copy.foot}</p>
			</footer>
		</section>
	</main>
</div>

<style>
	.paper-story {
		--ink: #27372f;
		--cream: #f7f2e6;
		--rust: #b64c34;
		--sage: #b9c7a6;
		background: var(--cream);
		color: var(--ink);
		overflow: clip;
		font-family: 'Nunito', system-ui, sans-serif;
	}
	.story-header {
		position: absolute;
		inset: 0 0 auto;
		z-index: 20;
		height: 5rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 11rem 0 6vw;
	}
	.wordmark {
		font-size: 1.4rem;
		font-weight: 900;
		letter-spacing: -0.07em;
	}
	.story-login {
		font-size: 0.8rem;
		border-bottom: 1px solid currentColor;
		padding-block: 0.65rem;
	}
	.skip-story {
		position: fixed;
		z-index: 60;
		top: 0.5rem;
		left: 0.5rem;
		padding: 0.75rem;
		background: var(--ink);
		color: white;
		transform: translateY(-150%);
	}
	.skip-story:focus {
		transform: none;
	}
	.story-nav {
		position: fixed;
		z-index: 30;
		top: 50%;
		left: 1.25rem;
		transform: translateY(-50%);
		display: grid;
		gap: 0.15rem;
	}
	.story-nav a {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		min-height: 44px;
		font-size: 0.7rem;
		font-weight: 800;
	}
	.story-nav.on-dark {
		--ink: #f7f2e6;
		--cream: #27372f;
	}
	.nav-dot {
		width: 7px;
		height: 7px;
		border: 1px solid var(--ink);
		border-radius: 50%;
		transition:
			transform 0.25s,
			background 0.25s;
	}
	.nav-label {
		max-width: 0;
		overflow: hidden;
		opacity: 0;
		transition:
			opacity 0.2s,
			max-width 0.2s;
		background: var(--cream);
	}
	.story-nav:hover .nav-label,
	.story-nav:focus-within .nav-label,
	.current .nav-label {
		max-width: 8rem;
		opacity: 1;
	}
	.current .nav-dot {
		background: var(--rust);
		border-color: var(--rust);
		transform: scale(1.5);
	}
	.story-scene {
		min-height: 110svh;
		position: relative;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		padding: 8rem max(7vw, 2rem);
		scroll-margin-top: 0;
	}
	.opening {
		min-height: 100svh;
		padding-top: 4rem;
	}
	.opening-copy {
		position: relative;
		z-index: 2;
		text-align: center;
		font-size: clamp(1rem, 2vw, 1.4rem);
		font-weight: 700;
		margin-top: 3rem;
	}
	.hanging-sign {
		width: min(70vw, 880px);
		height: auto;
		margin-top: -1rem;
		transform-origin: 50% 0;
		animation: sign-swing 7s ease-in-out infinite;
		position: relative;
		z-index: 1;
	}
	.scroll-cue {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		font-size: 0.75rem;
		margin-top: 1rem;
	}
	.scroll-cue span {
		height: 3rem;
		width: 1px;
		background: var(--rust);
		animation: thread 2s ease-in-out infinite;
		transform-origin: top;
	}
	.paper-floor {
		position: absolute;
		bottom: -1px;
		height: 13%;
		width: 110%;
		background: #e9ddc5;
		clip-path: polygon(
			0 35%,
			12% 48%,
			30% 25%,
			48% 46%,
			68% 28%,
			86% 50%,
			100% 30%,
			100% 100%,
			0 100%
		);
	}
	.scene-copy {
		text-align: center;
		max-width: 46rem;
		z-index: 3;
		position: relative;
	}
	h1,
	h2 {
		font-size: clamp(2.4rem, 5.2vw, 5.2rem);
		font-weight: 900;
		line-height: 1.06;
		letter-spacing: -0.055em;
		text-wrap: balance;
	}
	.scene-copy > p {
		max-width: 32rem;
		margin: 1.4rem auto 0;
		font-size: clamp(0.95rem, 1.4vw, 1.15rem);
		line-height: 1.7;
		text-wrap: balance;
	}
	.stage {
		position: relative;
		width: min(100%, 1000px);
		margin-top: 2rem;
	}
	.cast {
		position: relative;
		z-index: 2;
		width: 100%;
		height: auto;
		transform: translateY(var(--travel, 0px));
		animation: cast-breathe 6s ease-in-out infinite;
	}
	.paper-circle,
	.paper-orbit {
		position: absolute;
		inset: 8% 18%;
		background: #e3b95e;
		border-radius: 49% 51% 45% 55%;
		transform: translate(var(--drift, 0px), calc(var(--travel, 0px) * -0.6)) rotate(-7deg);
	}
	.paper-orbit {
		background: var(--sage);
		inset: 20% 8% 0;
		border-radius: 50%;
	}
	.dinner {
		background: #e9ddc5;
		padding-top: 5rem;
	}
	.puzzling {
		background: #efd9c9;
	}
	.wishlist {
		background: #f7f2e6;
	}
	.shopping {
		background: #dfe5d4;
	}
	.games {
		background: #efcf89;
	}
	.events {
		background: #f0ddcf;
	}
	.expenses {
		background: #dfe5d4;
	}
	.module-name {
		position: relative;
		display: inline-block;
		margin-top: 1.5rem;
		padding-bottom: 3.5rem;
		max-width: 100%;
	}
	.letter-title {
		display: inline-flex;
		flex-wrap: wrap;
		justify-content: center;
		font-weight: 900;
		color: var(--rust);
		font-size: clamp(1.6rem, 3vw, 2.5rem);
		letter-spacing: -0.04em;
		transition: transform 0.2s;
		cursor: help;
	}
	.letter-title span {
		display: inline-block;
	}
	.entered .letter-title span {
		animation: letters 0.65s var(--delay) both cubic-bezier(0.2, 0.8, 0.2, 1);
	}
	.module-summary {
		position: absolute;
		z-index: 10;
		top: calc(100% - 3.4rem);
		left: 50%;
		transform: translate(-50%, 0.5rem) rotate(-2deg);
		width: min(22rem, 78vw);
		border: 1px solid #d4cbb8;
		background: #fffaf0;
		box-shadow: 4px 5px 0 #27372f15;
		padding: 0.8rem 1rem;
		font-size: 0.8rem;
		font-weight: 600;
		line-height: 1.5;
		opacity: 0;
		visibility: hidden;
		transition:
			opacity 0.2s,
			transform 0.2s;
	}
	.module-name:hover .letter-title,
	.module-name:focus-within .letter-title {
		transform: translateY(-7px);
	}
	.module-name:hover .module-summary,
	.module-name:focus-within .module-summary {
		opacity: 1;
		visibility: visible;
		transform: translate(-50%, 0) rotate(-2deg);
	}
	.wishlist-stage {
		display: flex;
		width: min(100%, 1000px);
		align-items: center;
		justify-content: center;
		position: relative;
	}
	.idea-cast {
		width: 65%;
		height: auto;
		margin-right: -7%;
		transform: translateY(var(--travel, 0px));
	}
	.phone {
		position: relative;
		width: 310px;
		flex-shrink: 0;
		border: 8px solid var(--ink);
		border-radius: 2.5rem;
		background: var(--ink);
		padding: 1.7rem 0 1.2rem;
		transform: rotate(5deg) translateY(calc(var(--travel, 0px) * -0.5));
		box-shadow: 12px 18px 0 #27372f12;
	}
	.phone-screen {
		overflow: hidden;
		border-radius: 1rem;
		background: white;
		height: 23rem;
	}
	.phone-screen :global(.presentation) {
		border: 0;
		border-radius: 0;
		height: 23rem;
	}
	.phone-camera {
		position: absolute;
		width: 3rem;
		height: 0.25rem;
		border-radius: 1rem;
		background: #889289;
		top: 0.7rem;
		left: calc(50% - 1.5rem);
	}
	.phone-home {
		display: block;
		width: 3rem;
		height: 0.2rem;
		background: #889289;
		position: absolute;
		bottom: 0.5rem;
		left: calc(50% - 1.5rem);
	}
	.paper-tag {
		position: absolute;
		z-index: 4;
		top: 15%;
		right: 8%;
		width: 4rem;
		aspect-ratio: 1;
		display: grid;
		place-items: center;
		background: #fffaf0;
		color: var(--rust);
		box-shadow: 3px 5px 0 #27372f1c;
		font-size: 2rem;
		font-weight: 900;
		animation: tag-wobble 4s ease-in-out infinite;
	}
	.more {
		min-height: 85svh;
	}
	.paper-notes {
		display: flex;
		justify-content: center;
		flex-wrap: wrap;
		gap: 1.5rem;
		margin-top: 4rem;
		transform: translateY(var(--travel, 0px));
	}
	.paper-notes span {
		display: grid;
		place-items: center;
		width: 9rem;
		height: 7rem;
		background: #efcf89;
		transform: rotate(var(--note-angle));
		font-size: 1.1rem;
		font-weight: 800;
		box-shadow: 4px 6px 0 #27372f12;
		animation: note-float 5s var(--note-delay) ease-in-out infinite;
	}
	.paper-notes span:nth-child(even) {
		background: var(--sage);
	}
	.pricing {
		background: var(--ink);
		color: var(--cream);
		min-height: 100svh;
		padding-top: 7rem;
	}
	.pricing > h2 {
		text-align: center;
		max-width: 50rem;
	}
	.pricing-grid {
		display: grid;
		grid-template-columns: 1fr 1.1fr;
		gap: 1.5rem;
		max-width: 55rem;
		width: 100%;
		margin-top: 4rem;
		align-items: start;
	}
	.price-card {
		padding: 2rem;
		border: 1px solid #f7f2e652;
		border-radius: 0.5rem;
	}
	.full-plan {
		background: #f5e5bb;
		color: var(--ink);
		transform: rotate(1deg);
		border: 0;
	}
	.plan-title {
		font-size: 1rem;
		font-weight: 800;
	}
	.price {
		display: block;
		font-size: 3.8rem;
		font-weight: 900;
		letter-spacing: -0.06em;
		margin-block: 1rem;
	}
	.price span {
		display: block;
		font-size: 0.8rem;
		font-weight: 600;
		letter-spacing: 0;
	}
	.price-card > p:not(.price, .plan-title),
	.price-card li {
		font-size: 0.9rem;
		line-height: 1.7;
	}
	.price-card ul {
		padding-left: 1rem;
		list-style: disc;
		margin-top: 1rem;
	}
	.price-card a {
		display: flex;
		justify-content: center;
		align-items: center;
		padding: 0.9rem;
		min-height: 44px;
		margin-top: 2rem;
		background: var(--cream);
		color: var(--ink);
		border-radius: 0.25rem;
		font-weight: 800;
		font-size: 0.9rem;
	}
	.full-plan a {
		background: var(--rust);
		color: white;
	}
	footer {
		width: 100%;
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 1rem;
		max-width: 55rem;
		margin-top: 5rem;
		font-size: 0.8rem;
	}
	footer a {
		font-weight: 900;
		font-size: 1.1rem;
	}
	a:focus-visible,
	button:focus-visible {
		outline: 3px solid currentColor;
		outline-offset: 5px;
	}
	@keyframes sign-swing {
		0%,
		100% {
			rotate: -4deg;
			scale: 0.98;
			filter: hue-rotate(-7deg);
		}
		50% {
			rotate: 4deg;
			scale: 1.025;
			filter: hue-rotate(12deg);
		}
	}
	@keyframes thread {
		50% {
			scale: 1 0.6;
		}
	}
	@keyframes cast-breathe {
		0%,
		100% {
			rotate: -0.6deg;
		}
		50% {
			rotate: 0.6deg;
		}
	}
	@keyframes tag-wobble {
		0%,
		100% {
			rotate: -9deg;
			translate: 0 -4px;
		}
		50% {
			rotate: 8deg;
			translate: 0 5px;
		}
	}
	@keyframes note-float {
		50% {
			translate: 0 -10px;
		}
	}
	@keyframes letters {
		from {
			opacity: 0;
			transform: translateY(1.2rem) rotate(var(--angle));
		}
		to {
			opacity: 1;
			transform: none;
		}
	}
	@media (prefers-reduced-motion: no-preference) {
		:global(html:has(.paper-story)) {
			scroll-behavior: smooth;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.paper-story *,
		.paper-story *::before {
			animation: none !important;
			transition: none !important;
		}
		.cast,
		.idea-cast,
		.paper-notes {
			transform: none;
		}
	}
	@media (max-width: 700px) {
		.story-header {
			padding-left: 1.3rem;
			padding-right: 8.5rem;
		}
		.wordmark {
			font-size: 1.1rem;
		}
		.story-login {
			font-size: 0.68rem;
		}
		.story-nav {
			left: 0.5rem;
			gap: 0;
		}
		.story-nav a {
			gap: 0.3rem;
			width: 44px;
		}
		.nav-label {
			display: none;
		}
		.story-scene {
			min-height: 90svh;
			padding: 5rem 1.6rem 5rem 2.2rem;
		}
		.opening {
			min-height: 100svh;
		}
		.hanging-sign {
			width: 105%;
			max-width: none;
			margin-block: 2rem;
		}
		.opening-copy {
			font-size: 0.95rem;
		}
		.stage {
			width: 120%;
			max-width: none;
			margin-top: 3rem;
		}
		.wishlist-stage {
			flex-direction: column;
		}
		.idea-cast {
			width: 90%;
			margin: 0 0 -1rem -12%;
		}
		.phone {
			width: min(280px, 100%);
		}
		.pricing-grid {
			grid-template-columns: 1fr;
			margin-top: 2.5rem;
		}
		.price-card {
			padding: 1.5rem;
		}
		.full-plan {
			transform: rotate(0);
		}
		.paper-notes {
			gap: 1rem;
		}
		.paper-notes span {
			width: 7.5rem;
			height: 6rem;
			font-size: 0.95rem;
		}
	}
</style>
