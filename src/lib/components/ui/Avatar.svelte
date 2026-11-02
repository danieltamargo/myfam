<script lang="ts">
	interface Props {
		src?: string | null;
		name?: string | null;
		size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
		class?: string;
	}

	let { src = null, name = null, size = 'md', class: className = '' }: Props = $props();
	let failedSrc = $state<string | null>(null);

	function trackImageFailure(image: HTMLImageElement) {
		const markFailed = () => {
			failedSrc = image.getAttribute('src');
		};
		image.addEventListener('error', markFailed);
		if (image.complete && image.naturalWidth === 0) markFailed();
		return () => image.removeEventListener('error', markFailed);
	}

	const sizeClasses = {
		xs: 'w-8 h-8 text-xs',
		sm: 'w-12 h-12 text-sm',
		md: 'w-16 h-16 text-lg',
		lg: 'w-24 h-24 text-2xl',
		xl: 'w-32 h-32 text-4xl'
	};

	const getInitials = (displayName: string | null) => {
		if (!displayName) return '?';

		const parts = displayName.trim().split(' ');
		if (parts.length >= 2) {
			return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
		}
		return displayName.substring(0, 2).toUpperCase();
	};

	const getColorFromName = (displayName: string | null) => {
		if (!displayName) return 'bg-base-300 text-base-content';

		const colors = [
			'bg-primary text-primary-content',
			'bg-neutral text-neutral-content',
			'bg-accent text-accent-content',
			'bg-info text-info-content',
			'bg-success text-success-content',
			'bg-warning text-warning-content',
			'bg-error text-error-content'
		];

		let hash = 0;
		for (let i = 0; i < displayName.length; i++) {
			hash = displayName.charCodeAt(i) + ((hash << 5) - hash);
		}

		return colors[Math.abs(hash) % colors.length];
	};

	const initials = $derived(getInitials(name));
	const bgColor = $derived(getColorFromName(name));
	const avatarSize = $derived(sizeClasses[size]);
</script>

<div class="avatar {className}">
	<div class="{avatarSize} overflow-hidden rounded-full">
		{#if src && src !== failedSrc}
			<img {src} alt={name || 'Avatar'} referrerpolicy="no-referrer" {@attach trackImageFailure} />
		{:else}
			<div class="{bgColor} flex h-full w-full items-center justify-center font-semibold">
				{initials}
			</div>
		{/if}
	</div>
</div>
