<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import ThemeToggle from '$lib/components/util/ThemeToggler.svelte';
	import ToastManager from '$lib/components/util/ToastManager.svelte';
  import { invalidate } from '$app/navigation';
  import { onMount } from 'svelte';
  import { createClient } from '$lib/supabase';
	
  interface Props {
    data: {
      session: any;
      user: any;
    };
    children: any;
  }

  let { data, children }: Props = $props();

  const supabase = createClient();

  onMount(() => {
    // Listen for auth changes
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.expires_at !== data.session?.expires_at) {
          invalidate('supabase:auth');
        }
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  });
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<ThemeToggle />
<ToastManager />
