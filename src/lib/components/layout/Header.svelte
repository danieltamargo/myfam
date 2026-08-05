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
		activeFamily?: {
			id: string;
			name: string;
			role: string;
		} | null;
		notifications?: Array<any>;
	}

	let {
		user,
		families = [],
		activeFamily: initialActiveFamily = null,
		notifications = []
	}: Props = $props();

	const supabase = createClient();

	// Initialize active family from server data
	$effect(() => {
		if (initialActiveFamily && !$activeFamily) {
			activeFamily.set(initialActiveFamily);
		} else if (families.length > 0 && !$activeFamily) {
			// Fallback: select first family if no active family
			activeFamily.set(families[0]);
		}
	});

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

	const isActive = (href: string) => {
		return $page.url.pathname === href || $page.url.pathname.startsWith(href + '/');
	};

	async function selectFamily(familyId: string) {
		const family = families.find((f) => f.id === familyId);
		if (family && user?.id) {
			// Update local store
			activeFamily.set(family);

			// Update database to persist across devices
			await supabase.from('profiles').update({ active_family_id: familyId }).eq('id', user.id);

			goto(`/family/${familyId}`);
		}
	}
</script>

<header class="navbar bg-base-200 px-4 shadow-md">
	<div class="navbar-start">
		<a href="/dashboard" class="btn text-xl font-bold btn-ghost"> MyFamily </a>
	</div>

	<div class="navbar-center">
		{#if $activeFamily}
			<div class="dropdown">
				<div tabindex="0" role="button" class="btn gap-2 btn-ghost">
					<span class="text-lg">👨‍👩‍👧‍👦</span>
					<span class="font-semibold">{$activeFamily.name}</span>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M19 9l-7 7-7-7"
						/>
					</svg>
				</div>
				<ul
					tabindex="0"
					class="dropdown-content menu z-[1] mt-2 w-64 rounded-box bg-base-200 p-2 shadow"
				>
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
						<a href="/families" class="gap-2 text-primary">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4 w-4"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
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
				<NotificationBell {notifications} userId={user.id} />
			{/if}

			<div class="dropdown dropdown-end">
				<div tabindex="-1" role="button" class="btn avatar btn-circle btn-ghost">
					<div class="w-10 rounded-full ring ring-primary ring-offset-2 ring-offset-base-100">
						{#if user.user_metadata?.avatar_url}
							<img
								src={user.user_metadata.avatar_url}
								alt="Avatar"
								referrerpolicy="no-referrer"
								crossorigin="anonymous"
							/>
						{:else}
							<div
								class="flex h-full w-full items-center justify-center bg-primary text-lg font-bold text-primary-content"
							>
								{user.email?.[0].toUpperCase() || '?'}
							</div>
						{/if}
					</div>
				</div>
				<ul
					tabindex="-1"
					class="dropdown-content menu z-1 mt-3 w-52 overflow-x-hidden overflow-y-auto menu-sm rounded-box bg-base-200 p-2 shadow"
				>
					<li class="max-w-full overflow-hidden menu-title text-ellipsis whitespace-nowrap">
						<span>{user.user_metadata?.full_name || user.email}</span>
					</li>
					<div class="divider my-1"></div>
					{#each navItems as item}
						<li>
							<a href={item.href} class={isActive(item.href) ? 'active' : ''}>
								<span>{item.icon}</span>
								{item.label}
							</a>
						</li>
					{/each}
					<div class="divider my-1"></div>
					<li>
						<button onclick={signOut} class="text-error">
							<span>🚪</span>
							Sign Out
						</button>
					</li>
				</ul>
			</div>
		{/if}
	</div>
</header>
