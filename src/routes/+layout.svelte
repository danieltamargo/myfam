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
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, _session) => {
        // Only invalidate on actual auth events, don't use session data
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
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