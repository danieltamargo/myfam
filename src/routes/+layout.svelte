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
		const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
			if (
				(event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') &&
				session?.access_token !== data.session?.access_token
			) {
				void invalidate('supabase:auth').catch(() => {
					console.error('Could not refresh authentication state.');
				});
			}
		});

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
