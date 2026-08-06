<script lang="ts">
	interface EventTag {
		id: string;
		name: string;
		icon: string | null;
	}

	let {
		name,
		description = null,
		price = null,
		currency = 'EUR',
		priority = 0,
		desiredQuantity = 1,
		imageSrc = null,
		links = [],
		events = [],
		ownerName = null,
		preview = false
	}: {
		name: string;
		description?: string | null;
		price?: number | null;
		currency?: string;
		priority?: number;
		desiredQuantity?: number;
		imageSrc?: string | null;
		links?: string[];
		events?: EventTag[];
		ownerName?: string | null;
		preview?: boolean;
	} = $props();

	const safeCurrency = $derived(/^[A-Z]{3}$/.test(currency) ? currency : 'EUR');
	const safeLinks = $derived(links.filter(isHttpsLink));

	function isHttpsLink(value: string): boolean {
		try {
			return new URL(value).protocol === 'https:';
		} catch {
			return false;
		}
	}

	function linkLabel(value: string): string {
		try {
			return new URL(value).hostname.replace(/^www\./, '');
		} catch {
			return 'Enlace';
		}
	}

	function formattedPrice(): string {
		if (price === null || !Number.isFinite(price)) return 'Sin precio';
		return new Intl.NumberFormat('es-ES', {
			style: 'currency',
			currency: safeCurrency
		}).format(price);
	}

	function priorityLabel(): string {
		return (
			{
				2: 'Muy alta',
				1: 'Alta',
				0: 'Normal',
				'-1': 'Baja'
			}[priority] ?? 'Normal'
		);
	}

	function priorityClass(): string {
		return (
			{
				2: 'badge-error',
				1: 'badge-warning',
				0: 'badge-info',
				'-1': 'badge-ghost'
			}[priority] ?? 'badge-info'
		);
	}
</script>

<article class="space-y-5" aria-label={preview ? 'Vista previa segura del regalo' : name}>
	{#if imageSrc}
		<figure class="overflow-hidden rounded-box bg-base-200">
			<img src={imageSrc} alt={name} class="max-h-72 w-full object-cover" />
		</figure>
	{/if}

	<header class="space-y-1">
		<h3 class="text-xl leading-tight font-bold text-base-content">
			{name.trim() || 'Tu regalo aparecerá aquí'}
		</h3>
		{#if ownerName}
			<p class="text-sm text-base-content/60">Deseado por {ownerName}</p>
		{/if}
	</header>

	<div class="flex flex-wrap gap-2" aria-label="Resumen del regalo">
		<span class="badge badge-soft badge-primary">{formattedPrice()}</span>
		<span class="badge badge-soft {priorityClass()}">{priorityLabel()}</span>
		{#if desiredQuantity > 1}
			<span class="badge badge-soft badge-neutral">Cantidad: {desiredQuantity}</span>
		{/if}
	</div>

	{#if description?.trim()}
		<p class="text-sm whitespace-pre-wrap text-base-content/75">{description}</p>
	{:else if preview}
		<p class="text-sm text-base-content/45">
			Añade una descripción para aclarar modelo, talla o color.
		</p>
	{/if}

	{#if events.length > 0}
		<div class="space-y-2">
			<p class="text-xs font-semibold tracking-wide text-base-content/55 uppercase">Eventos</p>
			<div class="flex flex-wrap gap-2">
				{#each events as event (event.id)}
					<span class="badge badge-outline">
						{event.icon ?? '🎁'}
						{event.name}
					</span>
				{/each}
			</div>
		</div>
	{/if}

	{#if safeLinks.length > 0}
		<div class="space-y-2">
			<p class="text-xs font-semibold tracking-wide text-base-content/55 uppercase">
				Enlaces seguros
			</p>
			<div class="flex flex-wrap gap-2">
				{#each safeLinks as link (link)}
					<a
						href={link}
						target="_blank"
						rel="noopener noreferrer"
						class="badge gap-1 badge-soft badge-primary"
					>
						<span aria-hidden="true">↗</span>
						{linkLabel(link)}
					</a>
				{/each}
			</div>
		</div>
	{/if}

	{#if preview}
		<p class="border-t border-base-300 pt-3 text-xs text-base-content/50">
			La vista previa usa texto escapado y solo muestra enlaces HTTPS.
		</p>
	{/if}
</article>
