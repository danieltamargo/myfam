<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { createClient } from '$lib/supabase';

	interface Notification {
		id: string;
		type: string;
		title: string;
		message: string | null;
		link: string | null;
		read: boolean;
		created_at: string;
	}

	interface Props {
		notifications: Notification[];
		userId: string;
	}

	let { notifications, userId }: Props = $props();

	let showOnlyUnread = $state(true);
	let unreadCount = $derived(notifications.filter((n) => !n.read).length);
	let showDropdown = $state(false);
	let localNotifications = $state<Notification[]>(notifications);

	// Filtered notifications based on toggle
	let filteredNotifications = $derived(
		showOnlyUnread ? localNotifications.filter((n) => !n.read) : localNotifications
	);

	const supabase = createClient();

	// Subscribe to real-time notifications
	onMount(() => {
		const channel = supabase
			.channel('notifications')
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'notifications',
					filter: `user_id=eq.${userId}`
				},
				async (payload) => {
					console.log('Notification change:', payload);
					await invalidateAll();
				}
			)
			.subscribe();

		return () => {
			supabase.removeChannel(channel);
		};
	});

	// Update local notifications when props change
	$effect(() => {
		localNotifications = notifications;
	});

	async function markAsRead(notificationId: string) {
		const { error } = await supabase
			.from('notifications')
			.update({ read: true })
			.eq('id', notificationId);

		if (!error) {
			await invalidateAll();
		}
	}

	async function markAllAsRead() {
		const { error } = await supabase
			.from('notifications')
			.update({ read: true })
			.eq('user_id', userId)
			.eq('read', false);

		if (!error) {
			await invalidateAll();
		}
	}

	async function deleteNotification(notificationId: string) {
		const { error } = await supabase.from('notifications').delete().eq('id', notificationId);

		if (!error) {
			await invalidateAll();
		}
	}

	function formatDate(dateString: string): string {
		const date = new Date(dateString);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 1) return 'Ahora mismo';
		if (diffMins < 60) return `Hace ${diffMins} min`;
		if (diffHours < 24) return `Hace ${diffHours}h`;
		if (diffDays < 7) return `Hace ${diffDays}d`;

		return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
	}

	function getNotificationIcon(type: string): string {
		switch (type) {
			case 'mention':
				return '💬';
			case 'comment':
				return '📝';
			case 'invitation':
				return '📨';
			case 'gift_status':
				return '🎁';
			case 'family_join':
				return '👨‍👩‍👧‍👦';
			default:
				return '🔔';
		}
	}

	function handleNotificationClick(notification: Notification) {
		markAsRead(notification.id);
		if (notification.link) {
			window.location.href = notification.link;
		}
		showDropdown = false;
	}
</script>

<div class="relative">
	<!-- Bell Button -->
	<button
		type="button"
		class="btn btn-circle btn-ghost"
		onclick={() => (showDropdown = !showDropdown)}
	>
		<div class="indicator">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-5 w-5"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
				/>
			</svg>
			{#if unreadCount > 0}
				<span class="indicator-item badge badge-xs badge-error">{unreadCount}</span>
			{/if}
		</div>
	</button>

	<!-- Dropdown Content -->
	{#if showDropdown}
		<div
			class="absolute top-full right-0 z-100 mt-2 flex max-h-125 w-96 flex-col overflow-hidden rounded-box border border-base-300 bg-base-200 shadow-xl"
		>
			<!-- Header -->
			<div class="border-b border-base-300 p-4">
				<div class="mb-3 flex items-center justify-between">
					<h3 class="text-lg font-semibold">Notificaciones</h3>
					{#if unreadCount > 0}
						<button onclick={markAllAsRead} class="btn text-primary btn-ghost btn-xs">
							Marcar todas como leídas
						</button>
					{/if}
				</div>

				<!-- Toggle filter -->
				<div class="flex gap-2">
					<button
						onclick={() => (showOnlyUnread = true)}
						class="btn btn-xs {showOnlyUnread ? 'btn-primary' : 'btn-ghost'}"
					>
						Sin leer ({unreadCount})
					</button>
					<button
						onclick={() => (showOnlyUnread = false)}
						class="btn btn-xs {!showOnlyUnread ? 'btn-primary' : 'btn-ghost'}"
					>
						Todas ({localNotifications.length})
					</button>
				</div>
			</div>

			<!-- Notifications List -->
			<div class="flex-1 overflow-y-auto">
				{#if filteredNotifications.length === 0}
					<div class="p-8 text-center text-base-content/50">
						<div class="mb-2 text-4xl">🔔</div>
						<p class="text-sm">No hay notificaciones</p>
					</div>
				{:else}
					<div class="divide-y divide-base-300">
						{#each filteredNotifications as notification (notification.id)}
							<div class="relative {!notification.read ? 'bg-primary/10' : ''}">
								<!-- Main notification area (clickable) -->
								<div
									role="button"
									tabindex="0"
									onclick={() => handleNotificationClick(notification)}
									onkeydown={(e) => {
										if (e.key === 'Enter' || e.key === ' ') {
											handleNotificationClick(notification);
										}
									}}
									class="flex cursor-pointer items-start gap-2 px-4 py-3 transition-colors hover:bg-base-200/50"
								>
									<span class="text-xl">{getNotificationIcon(notification.type)}</span>
									<div class="min-w-0 flex-1">
										<p
											class="text-left text-sm font-semibold {!notification.read
												? 'text-primary'
												: ''}"
										>
											{notification.title}
										</p>
										{#if notification.message}
											<p class="truncate text-left text-xs text-base-content/70">
												{notification.message}
											</p>
										{/if}
										<p class="mt-1 text-xs text-base-content/50">
											{formatDate(notification.created_at)}
										</p>
									</div>
								</div>

								<!-- Action buttons (absolute positioned) -->
								<div class="absolute top-3 right-2 flex items-center gap-1">
									{#if !notification.read}
										<button
											onclick={(e) => {
												e.stopPropagation();
												markAsRead(notification.id);
											}}
											class="btn btn-ghost btn-xs"
											title="Marcar como leída"
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="h-4 w-4"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
											>
												<polyline points="20 6 9 17 4 12"></polyline>
											</svg>
										</button>
									{/if}
									<button
										onclick={(e) => {
											e.stopPropagation();
											deleteNotification(notification.id);
										}}
										class="btn text-error btn-ghost btn-xs"
										title="Eliminar"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-4 w-4"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
										>
											<line x1="18" y1="6" x2="6" y2="18"></line>
											<line x1="6" y1="6" x2="18" y2="18"></line>
										</svg>
									</button>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<!-- Click outside to close -->
{#if showDropdown}
	<button
		class="fixed inset-0 z-[99]"
		onclick={() => (showDropdown = false)}
		aria-label="Close notifications"
	></button>
{/if}
