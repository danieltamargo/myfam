<script lang="ts">
  import { onMount } from 'svelte';
  import * as m from '$paraglide/messages';
  import Particles from '$components/magic/Particles.svelte';
  import WordRotate from '$components/magic/WordRotate.svelte';

  let scrollY = 0;
  let isHovering = false;
  let heroElement: HTMLElement;

  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;

  const base1 = { x: 0.10, y: 0.10 };
  const base2 = { x: 0.80, y: 0.20 };
  const base3 = { x: 0.30, y: 0.20 };

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
    { icon: serviceIcons[0], title: m['services.modules.calendar.title'](), description: m['services.modules.calendar.description']() },
    { icon: serviceIcons[1], title: m['services.modules.finances.title'](), description: m['services.modules.finances.description']() },
    { icon: serviceIcons[2], title: m['services.modules.tasks.title'](), description: m['services.modules.tasks.description']() },
    { icon: serviceIcons[3], title: m['services.modules.meals.title'](), description: m['services.modules.meals.description']() },
    { icon: serviceIcons[4], title: m['services.modules.goals.title'](), description: m['services.modules.goals.description']() },
    { icon: serviceIcons[5], title: m['services.modules.documents.title'](), description: m['services.modules.documents.description']() }
  ];

  const featureIcons = ['👨‍👩‍👧‍👦', '⚡', '🔒'];

  $: features = [
    { title: m['features.items.multi_family.title'](), description: m['features.items.multi_family.description'](), image: featureIcons[0] },
    { title: m['features.items.real_time.title'](), description: m['features.items.real_time.description'](), image: featureIcons[1] },
    { title: m['features.items.privacy.title'](), description: m['features.items.privacy.description'](), image: featureIcons[2] }
  ];

  onMount(() => {
    targetX = window.innerWidth / 2;
    targetY = window.innerHeight / 2;
    currentX = targetX;
    currentY = targetY;
    animateBlobs();
    const handleScroll = () => { scrollY = window.scrollY; };
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
    class="hero min-h-screen relative overflow-hidden z-0"
    aria-label="Hero Section"
    role="banner"
    on:mousemove={handleMouseMove}
    on:mouseenter={handleMouseMove}
    on:mouseleave={resetBlobs}
  >
    <div class="hero-content text-center w-full max-w-7xl px-4 relative z-20">
      <div class="w-full">
        <div class="mb-8">
          <h1 class="text-5xl md:text-7xl lg:text-8xl font-black leading-tight">
            <span class="relative z-10">
              <span
                bind:this={blobTextEl}
                class="interactive-blob-text inline-block relative z-10"
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
        
        <p class="text-xl md:text-3xl lg:text-4xl mb-6 font-semibold text-base-content/90 max-w-4xl mx-auto relative z-20 pointer-events-none">
          {m['hero.subtitle']()}
        </p>

        <p class="text-base md:text-lg lg:text-xl mb-2 max-w-2xl mx-auto text-base-content/60 leading-relaxed relative z-20 pointer-events-none">
          {@html m['hero.description.text']()}
        </p>

        <div class="overflow-hidden relative z-20 pointer-events-none">
          <WordRotate class="text-4xl font-bold mb-12 text-primary/80" words={qualities} />
        </div>

        <div class="flex gap-4 justify-center flex-wrap relative z-20">
          <a
            href="/login"
            class="btn btn-primary btn-lg text-lg px-8 shadow-lg hover:shadow-xl transition-all hover:scale-105 relative z-20"
          >
            {m['hero.cta_primary']()}
          </a>
          <a
            href="/features"
            class="btn btn-outline btn-lg text-lg px-8 hover:scale-105 transition-all relative z-20"
          >
            {m['hero.cta_secondary']()}
          </a>
        </div>

        <div class="flex gap-4 justify-center flex-wrap mt-16 opacity-70 relative z-20">
          <div class="badge badge-lg badge-ghost gap-2">Multi-family</div>
          <div class="badge badge-lg badge-ghost gap-2">Real-time sync</div>
          <div class="badge badge-lg badge-ghost gap-2">Secure & private</div>
        </div>
      </div>
    </div>

    <div class="absolute inset-0 overflow-hidden pointer-events-none z-0">
      <div class="blob blob-1 absolute w-96 h-96 bg-primary rounded-full blur-3xl opacity-30"></div>
      <div class="blob blob-2 absolute w-[500px] h-[500px] bg-secondary rounded-full blur-3xl opacity-25"></div>
      <div class="blob blob-3 absolute w-[600px] h-[600px] bg-accent rounded-full blur-3xl opacity-20"></div>
    </div>

    <Particles className="absolute inset-0 pointer-events-none z-0" refresh={true} />
  </section>

  <section class="py-32 relative bg-base-300">
    <div class="container mx-auto px-4">
      <div class="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">

        <div class="space-y-6 lg:pr-8">
          <h2 class="text-4xl lg:text-5xl font-bold">{m['services.title']()}</h2>
          <p class="text-lg lg:text-xl text-base-content/70">{m['services.description']()}</p>

          <div class="space-y-4">
            <div class="flex items-start gap-3">
              <div class="badge badge-primary badge-lg">✓</div>
              <div>
                <h3 class="font-semibold text-lg">{m['services.benefits.modular.title']()}</h3>
                <p class="text-base-content/60">{m['services.benefits.modular.description']()}</p>
              </div>
            </div>
            <div class="flex items-start gap-3">
              <div class="badge badge-primary badge-lg">✓</div>
              <div>
                <h3 class="font-semibold text-lg">{m['services.benefits.easy.title']()}</h3>
                <p class="text-base-content/60">{m['services.benefits.easy.description']()}</p>
              </div>
            </div>
            <div class="flex items-start gap-3">
              <div class="badge badge-primary badge-lg">✓</div>
              <div>
                <h3 class="font-semibold text-lg">{m['services.benefits.synced.title']()}</h3>
                <p class="text-base-content/60">{m['services.benefits.synced.description']()}</p>
              </div>
            </div>
          </div>
        </div>

        <div class="hidden lg:flex relative h-[700px] items-center justify-end overflow-hidden">
          <div class="relative w-[800px] h-[800px] translate-x-1/2">
            {#each services as service, i}
              {@const angle = (i * 60) + (rotation * 2.5)}
              {@const radius = 280}
              {@const x = Math.cos((angle * Math.PI) / 180) * radius}
              {@const y = Math.sin((angle * Math.PI) / 180) * radius}
              <div class="absolute top-1/2 left-1/2 transition-all duration-500 ease-out"
                style="transform: translate(calc(-50% + {x}px), calc(-50% + {y}px));">
                <div class="card bg-base-100 shadow-xl w-48 hover:scale-110 transition-transform cursor-pointer">
                  <div class="card-body items-center text-center p-6">
                    <div class="text-5xl mb-3">{service.icon}</div>
                    <h3 class="card-title text-base">{service.title}</h3>
                  </div>
                </div>
              </div>
            {/each}

            <div class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
              <div class="w-40 h-40 rounded-full bg-linear-to-br from-primary to-secondary flex items-center justify-center shadow-2xl"></div>
            </div>
          </div>

          <div class="absolute inset-y-0 right-0 w-32 bg-linear-to-l from-base-300 to-transparent pointer-events-none"></div>
        </div>

        <div class="lg:hidden overflow-hidden relative">
          <div class="flex gap-4 animate-carousel-mobile">
            {#each [...services, ...services, ...services] as service}
              <div class="shrink-0 w-64">
                <div class="card bg-base-100 shadow-xl h-full">
                  <div class="card-body items-center text-center">
                    <div class="text-5xl mb-3">{service.icon}</div>
                    <h3 class="card-title">{service.title}</h3>
                    <p class="text-sm text-base-content/70">{service.description}</p>
                  </div>
                </div>
              </div>
            {/each}
          </div>

          <div class="absolute inset-y-0 left-0 w-32 bg-linear-to-r from-base-300 via-base-300/80 to-transparent pointer-events-none z-10"></div>
          <div class="absolute inset-y-0 right-0 w-32 bg-linear-to-l from-base-300 via-base-300/80 to-transparent pointer-events-none z-10"></div>
        </div>

      </div>
    </div>
  </section>

  <section class="py-32">
    <div class="container mx-auto px-4">
      <div class="text-center mb-16">
        <h2 class="text-5xl font-bold mb-4">{m['features.title']()}</h2>
        <p class="text-xl text-base-content/70 max-w-2xl mx-auto">{m['features.subtitle']()}</p>
      </div>

      <div class="relative grid md:grid-cols-3 gap-8">
        {#each features as feature}
          <div class="hover-3d z-1">
            <div class="card bg-base-100 shadow-xl hover:shadow-2xl transition-shadow">
              <div class="card-body items-center text-center">
                <div class="text-6xl mb-4">{feature.image}</div>
                <h3 class="card-title text-2xl mb-2">{feature.title}</h3>
                <p class="text-base-content/70">{feature.description}</p>
              </div>
            </div>
            <div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <section class="py-32 overflow-x-clip">
    <div class="max-w-5xl relative mx-auto">
      <div class="container mx-auto px-4 text-center relative z-10 max-w-4xl">
        <h2 class="text-5xl font-bold mb-6">{m['cta.title']()}</h2>
        <p class="text-xl text-base-content/70 mb-12 max-w-2xl mx-auto">{m['cta.description']()}</p>
        <div class="flex gap-4 justify-center flex-wrap">
          <a href="/login" class="btn btn-primary btn-lg">{m['cta.button_primary']()}</a>
          <a href="/contact" class="btn btn-outline btn-lg">{m['cta.button_secondary']()}</a>
        </div>
      </div>
  
      <div class="absolute inset-0 opacity-10">
        <div class="absolute -top-48 -right-20 w-96 h-96 bg-primary rounded-full blur-3xl"></div>
        <div class="absolute -bottom-48 -left-20 w-96 h-96 bg-secondary rounded-full blur-3xl"></div>
      </div>
    </div>
  </section>

  <footer class="footer footer-center p-10 bg-base-200 text-base-content">
    <div>
      <div class="text-4xl mb-2">🏠</div>
      <p class="font-bold text-lg">{m['hero.title']()}</p>
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
  :global(html) { scroll-behavior: smooth; }
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
    content: "";
    position: absolute;
    top: -200px;       
    bottom: -200px;   
    left: -200px; 
    right: -200px;
    pointer-events: auto; 
  }

  .blob { transition: transform 0.4s ease-out; }
  .animate-carousel-mobile {
    animation: carousel-mobile 15s linear infinite;
  }

  .animate-carousel-mobile:hover {
    animation-play-state: paused;
  }

  @keyframes carousel-mobile {
    0% { transform: translateX(0); }
    100% { transform: translateX(calc(-33.333%)); }
  }
</style>
