<script lang="ts">
  import { page } from '$app/stores';
  import { createClient } from '$lib/supabase';
  import { goto } from '$app/navigation';

  interface Props {
    user?: {
      email?: string;
      user_metadata?: {
        avatar_url?: string;
        full_name?: string;
      };
    };
  }

  let { user }: Props = $props();

  const supabase = createClient();

  async function signOut() {
    await supabase.auth.signOut();
    goto('/login');
  }

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: '🏠' },
    { href: '/profile', label: 'Profile', icon: '👤' }
  ];

  const isActive = $derived((href: string) => {
    return $page.url.pathname === href || $page.url.pathname.startsWith(href + '/');
  });
</script>

<header class="navbar bg-base-200 shadow-md px-4">
  <div class="navbar-start">
    <a href="/" class="btn btn-ghost text-xl font-bold">
      MyFamily
    </a>
  </div>

  <div class="navbar-center hidden lg:flex">
    <ul class="menu menu-horizontal px-1 gap-2">
      {#each navItems as item}
        <li>
          <a
            href={item.href}
            class="btn btn-ghost {isActive(item.href) ? 'btn-active' : ''}"
          >
            <span class="text-lg">{item.icon}</span>
            {item.label}
          </a>
        </li>
      {/each}
    </ul>
  </div>

  <div class="navbar-end gap-2">
    {#if user}
      <div class="dropdown dropdown-end">
        <div tabindex="0" role="button" class="btn btn-ghost btn-circle avatar">
          <div class="w-10 rounded-full ring ring-primary ring-offset-base-100 ring-offset-2">
            {#if user.user_metadata?.avatar_url}
              <img
                src={user.user_metadata.avatar_url}
                alt="Avatar"
              />
            {:else}
              <div class="bg-primary text-primary-content w-full h-full flex items-center justify-center text-lg font-bold">
                {user.email?.[0].toUpperCase() || '?'}
              </div>
            {/if}
          </div>
        </div>
        <ul
          tabindex="0"
          class="menu menu-sm dropdown-content mt-3 z-[1] p-2 shadow bg-base-200 rounded-box w-52"
        >
          <li class="menu-title">
            <span>{user.user_metadata?.full_name || user.email}</span>
          </li>
          <li><a href="/profile">Profile Settings</a></li>
          <li><button onclick={signOut} class="text-error">Sign Out</button></li>
        </ul>
      </div>
    {/if}

    <!-- Mobile menu -->
    <div class="dropdown dropdown-end lg:hidden">
      <div tabindex="0" role="button" class="btn btn-ghost btn-circle">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7" />
        </svg>
      </div>
      <ul tabindex="0" class="menu menu-sm dropdown-content mt-3 z-[1] p-2 shadow bg-base-200 rounded-box w-52">
        {#each navItems as item}
          <li>
            <a
              href={item.href}
              class="{isActive(item.href) ? 'active' : ''}"
            >
              <span class="text-lg">{item.icon}</span>
              {item.label}
            </a>
          </li>
        {/each}
      </ul>
    </div>
  </div>
</header>
