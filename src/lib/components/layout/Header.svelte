<script lang="ts">
  import { page } from '$app/stores';
  import { createClient } from '$lib/supabase';
  import { goto } from '$app/navigation';
  import { activeFamily } from '$lib/stores/familyStore';
  import NotificationBell from './NotificationBell.svelte';

  interface Props {
    user?: {
      id?: string;
      email?: string;
      user_metadata?: {
        avatar_url?: string;
        full_name?: string;
      };
    };
    families?: Array<{
      id: string;
      name: string;
      role: string;
    }>;
    notifications?: Array<any>;
  }

  let { user, families = [], notifications = [] }: Props = $props();

  const supabase = createClient();

  async function signOut() {
    await supabase.auth.signOut();
    activeFamily.clear(); // Limpiar familia activa al cerrar sesión
    goto('/login');
  }

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: '🏠' },
    { href: '/families', label: 'My Families', icon: '👨‍👩‍👧‍👦' },
    { href: '/profile', label: 'Profile Settings', icon: '⚙️' }
  ];

  const isActive = $derived((href: string) => {
    return $page.url.pathname === href || $page.url.pathname.startsWith(href + '/');
  });

  function selectFamily(familyId: string) {
    const family = families.find(f => f.id === familyId);
    if (family) {
      activeFamily.set(family);
      goto(`/family/${familyId}`);
    }
  }
</script>

<header class="navbar bg-base-200 shadow-md px-4">
  <div class="navbar-start">
    <a href="/dashboard" class="btn btn-ghost text-xl font-bold">
      MyFamily
    </a>
  </div>

  <div class="navbar-center">
    {#if $activeFamily}
      <div class="dropdown">
        <div tabindex="0" role="button" class="btn btn-ghost gap-2">
          <span class="text-lg">👨‍👩‍👧‍👦</span>
          <span class="font-semibold">{$activeFamily.name}</span>
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        <ul tabindex="0" class="dropdown-content menu p-2 shadow bg-base-200 rounded-box w-64 mt-2 z-[1]">
          <li class="menu-title">
            <span>Switch Family</span>
          </li>
          {#each families as family}
            <li>
              <button
                onclick={() => selectFamily(family.id)}
                class="flex justify-between {family.id === $activeFamily?.id ? 'active' : ''}"
              >
                <span>{family.name}</span>
                <span class="badge badge-sm">{family.role}</span>
              </button>
            </li>
          {/each}
          <div class="divider my-1"></div>
          <li>
            <a href="/families" class="text-primary gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Manage Families
            </a>
          </li>
        </ul>
      </div>
    {/if}
  </div>

  <div class="navbar-end gap-2">
    {#if user}
      <!-- Notifications Bell -->
      {#if user.id}
        <NotificationBell notifications={notifications} userId={user.id} />
      {/if}

      <div class="dropdown dropdown-end">
        <div tabindex="-1" role="button" class="btn btn-ghost btn-circle avatar">
          <div class="w-10 rounded-full ring ring-primary ring-offset-base-100 ring-offset-2">
            {#if user.user_metadata?.avatar_url}
              <img
                src={user.user_metadata.avatar_url}
                alt="Avatar"
                referrerpolicy="no-referrer"
                crossorigin="anonymous"
              />
            {:else}
              <div class="bg-primary text-primary-content w-full h-full flex items-center justify-center text-lg font-bold">
                {user.email?.[0].toUpperCase() || '?'}
              </div>
            {/if}
          </div>
        </div>
        <ul
          tabindex="-1"
          class="menu menu-sm dropdown-content mt-3 z-[1] p-2 shadow bg-base-200 rounded-box w-52"
        >
          <li class="menu-title">
            <span>{user.user_metadata?.full_name || user.email}</span>
          </li>
          <div class="divider my-1"></div>
          {#each navItems as item}
            <li>
              <a
                href={item.href}
                class="{isActive(item.href) ? 'active' : ''}"
              >
                <span>{item.icon}</span>
                {item.label}
              </a>
            </li>
          {/each}
          <div class="divider my-1"></div>
          <li><button onclick={signOut} class="text-error">
            <span>🚪</span>
            Sign Out
          </button></li>
        </ul>
      </div>
    {/if}
  </div>
</header>
