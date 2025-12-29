<script lang="ts">
  import { page } from '$app/stores';

  interface Props {
    data: {
      family: {
        id: string;
        name: string;
        createdAt: string;
        createdBy: string;
      };
      userRole: string;
    };
    children: any;
  }

  let { data, children }: Props = $props();

  const modules = [
    { id: 'members', name: 'Members', icon: '👥', href: `/family/${data.family.id}/members`, required: true },
    { id: 'wishlist', name: 'Wishlist', icon: '🎁', href: `/family/${data.family.id}/wishlist` },
    { id: 'events', name: 'Events', icon: '📅', href: `/family/${data.family.id}/events`, disabled: true },
    { id: 'expenses', name: 'Expenses', icon: '💰', href: `/family/${data.family.id}/expenses`, disabled: true }
  ];

  const isActive = $derived((href: string) => {
    return $page.url.pathname === href;
  });
</script>

<div class="container mx-auto max-w-7xl p-4">
  <!-- Module Navigation -->
  <div class="tabs tabs-boxed bg-base-200 mb-4 p-2 rounded-lg">
    {#each modules.filter(module => !module.disabled) as module}
      <a
        href={module.href}
        class="tab gap-2 {isActive(module.href) ? 'tab-active' : ''} {module.disabled ? 'tab-disabled' : ''}"
        class:pointer-events-none={module.disabled}
      >
        <span class="text-lg">{module.icon}</span>
        {module.name}
        <!-- {#if module.required}
          <span class="badge badge-xs badge-primary">Required</span>
        {/if}
        {#if module.disabled}
          <span class="badge badge-xs">Coming Soon</span>
        {/if} -->
      </a>
    {/each}
  </div>

  <!-- Module Content -->
  <div>
    {@render children()}
  </div>
</div>
