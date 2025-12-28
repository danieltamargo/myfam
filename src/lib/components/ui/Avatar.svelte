<script lang="ts">
  interface Props {
    src?: string | null;
    name?: string | null;
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    class?: string;
  }

  let { src = null, name = null, size = 'md', class: className = '' }: Props = $props();

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
    if (!displayName) return 'bg-base-300';

    const colors = [
      'bg-primary',
      'bg-secondary',
      'bg-accent',
      'bg-info',
      'bg-success',
      'bg-warning',
      'bg-error'
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
  <div class="{avatarSize} rounded-full overflow-hidden">
    {#if src}
      <img
        src={src}
        alt={name || 'Avatar'}
        referrerpolicy="no-referrer"
        crossorigin="anonymous"
        onerror={(e) => {
          // Si falla la carga, ocultar la imagen
          e.currentTarget.style.display = 'none';
        }}
      />
    {:else}
      <div class="{bgColor} w-full h-full flex items-center justify-center text-white font-semibold">
        {initials}
      </div>
    {/if}
  </div>
</div>
