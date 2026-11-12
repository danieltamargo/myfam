<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import ThemeToggle from '$lib/components/util/ThemeToggler.svelte';
	import ToastManager from '$lib/components/util/ToastManager.svelte';
	import { invalidate } from '$app/navigation';
	import { onMount } from 'svelte';
	import { createClient } from '$lib/supabase';
	import { getLocale, setLocale } from '$paraglide/runtime';

	interface Props {
		data: {
			session: any;
			user: any;
		};
		children: any;
	}

	let { data, children }: Props = $props();

	const supabase = createClient();
	let languageReady = $state(false);
	let languageError = $state(false);
	let changingLanguage = $state(false);

	async function changeLanguage(event: Event) {
		const select = event.currentTarget as HTMLSelectElement;
		const locale = select.value;
		if (locale !== 'es' && locale !== 'en') return;
		changingLanguage = true;
		languageError = false;
		if (data.user) {
			const { error } = await supabase.auth.updateUser({ data: { locale } });
			if (error) {
				select.value = getLocale();
				languageError = true;
				changingLanguage = false;
				return;
			}
		}
		await setLocale(locale);
		changingLanguage = false;
	}

	onMount(() => {
		languageReady = true;
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
<div class="fixed right-18 bottom-4 z-50 flex flex-col items-end gap-1">
	{#if languageError}
		<p class="max-w-56 rounded-box bg-base-100 p-2 text-sm text-error shadow" role="alert">
			{getLocale() === 'es' ? 'No se pudo guardar el idioma.' : 'Could not save your language.'}
		</p>
	{/if}
	<select
		class="select w-auto bg-base-100 select-sm shadow"
		aria-label={getLocale() === 'es' ? 'Idioma' : 'Language'}
		value={getLocale()}
		onchange={changeLanguage}
		disabled={!languageReady || changingLanguage}
	>
		<option value="es" lang="es">Español</option>
		<option value="en" lang="en">English</option>
	</select>
</div>
<ToastManager />
