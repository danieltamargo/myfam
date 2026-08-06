<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Avatar from '$lib/components/ui/Avatar.svelte';

	interface Comment {
		id: string;
		content: string;
		created_at: string;
		updated_at: string;
		author_id: string;
		profiles: {
			id: string;
			display_name: string;
			avatar_url: string | null;
		};
	}

	interface Member {
		user_id: string;
		profiles: {
			id: string;
			display_name: string;
			avatar_url: string | null;
		};
	}

	interface Props {
		itemId: string;
		comments: Comment[];
		members: Member[];
		currentUserId: string;
		itemOwnerId: string;
	}

	type CommentSegment = { type: 'text'; value: string } | { type: 'mention'; value: string };

	let { itemId, comments, members, currentUserId, itemOwnerId }: Props = $props();

	let newComment = $state('');
	let isSubmitting = $state(false);
	let showMentionSuggestions = $state(false);
	let mentionFilter = $state('');
	let cursorPosition = $state(0);

	// Filter members for @mentions (exclude item owner and current user)
	let mentionableMembers = $derived(
		members.filter((m) => m.user_id !== itemOwnerId && m.user_id !== currentUserId)
	);

	// Filtered suggestions based on what user is typing
	let filteredSuggestions = $derived.by(() => {
		if (!showMentionSuggestions || !mentionFilter) return mentionableMembers;

		const filter = mentionFilter.toLowerCase();
		return mentionableMembers.filter((m) => m.profiles.display_name.toLowerCase().includes(filter));
	});

	// Handle textarea input to detect @mentions
	function handleInput(e: Event) {
		const target = e.target as HTMLTextAreaElement;
		newComment = target.value;
		cursorPosition = target.selectionStart;

		// Check if we're typing an @mention
		const textBeforeCursor = newComment.substring(0, cursorPosition);
		const mentionMatch = textBeforeCursor.match(/@(\w*)$/);

		if (mentionMatch) {
			showMentionSuggestions = true;
			mentionFilter = mentionMatch[1];
		} else {
			showMentionSuggestions = false;
			mentionFilter = '';
		}
	}

	// Insert mention when user clicks a suggestion
	function insertMention(member: Member) {
		const textBeforeCursor = newComment.substring(0, cursorPosition);
		const textAfterCursor = newComment.substring(cursorPosition);

		// Remove the partial @mention
		const beforeMention = textBeforeCursor.replace(/@\w*$/, '');

		// Insert mention with special format: @{{user_id:display_name}}
		// This allows us to support names with spaces and extract user IDs later
		const mentionText = `@{{${member.user_id}:${member.profiles.display_name}}}`;
		newComment = beforeMention + mentionText + ' ' + textAfterCursor;

		showMentionSuggestions = false;
		mentionFilter = '';

		// Focus back on textarea
		setTimeout(() => {
			const textareaElement = document.querySelector<HTMLTextAreaElement>(
				`#gift-comment-${CSS.escape(itemId)}`
			);
			textareaElement?.focus();
			const newCursorPos = beforeMention.length + mentionText.length + 1;
			textareaElement?.setSelectionRange(newCursorPos, newCursorPos);
		}, 0);
	}

	// Handle keyboard navigation in suggestions
	function handleKeydown(e: KeyboardEvent) {
		if (showMentionSuggestions && filteredSuggestions.length > 0) {
			if (e.key === 'Escape') {
				showMentionSuggestions = false;
				e.preventDefault();
			}
			// You could add arrow key navigation here if desired
		}
	}

	// Format date
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

	// Parse mention tokens into data so Svelte escapes every stored value as text.
	function parseCommentSegments(text: string): CommentSegment[] {
		const segments: CommentSegment[] = [];
		const mentionPattern = /@\{\{[^:}]+:([^}]+)\}\}|@([\p{L}\p{N}_-]+)/gu;
		let cursor = 0;

		for (const match of text.matchAll(mentionPattern)) {
			const index = match.index ?? 0;
			if (index > cursor) {
				segments.push({ type: 'text', value: text.slice(cursor, index) });
			}

			segments.push({ type: 'mention', value: match[1] ?? match[2] ?? '' });
			cursor = index + match[0].length;
		}

		if (cursor < text.length) {
			segments.push({ type: 'text', value: text.slice(cursor) });
		}

		return segments.length > 0 ? segments : [{ type: 'text', value: text }];
	}

	// Reset form
	function resetForm() {
		newComment = '';
		showMentionSuggestions = false;
		mentionFilter = '';
	}
</script>

<div class="space-y-4">
	<!-- Comments Header -->
	<div class="flex items-center justify-between">
		<h4 class="text-lg font-semibold">Comentarios ({comments.length})</h4>
	</div>

	<!-- New Comment Form -->
	<form
		method="POST"
		action="?/createComment"
		use:enhance={() => {
			isSubmitting = true;
			return async ({ result, update }) => {
				await update();
				if (result.type === 'success') {
					resetForm();
					await invalidateAll();
				}
				isSubmitting = false;
			};
		}}
	>
		<input type="hidden" name="item_id" value={itemId} />

		<div class="form-control relative">
			<textarea
				id={`gift-comment-${itemId}`}
				name="content"
				bind:value={newComment}
				oninput={handleInput}
				onkeydown={handleKeydown}
				class="textarea-bordered textarea min-h-[100px] w-full focus:textarea-primary"
				placeholder="Escribe un comentario... Usa @ para mencionar a alguien"
				disabled={isSubmitting}
				required
			></textarea>
		</div>

		<!-- Mention Suggestions Dropdown (outside form-control for better visibility) -->
		{#if showMentionSuggestions && filteredSuggestions.length > 0}
			<div class="relative">
				<div
					class="absolute top-0 left-0 z-[200] max-h-64 w-80 overflow-y-auto rounded-lg border-2 border-primary bg-base-100 shadow-2xl"
				>
					<div class="p-2">
						<p class="px-2 py-1 text-xs font-semibold text-base-content/70">Mencionar a:</p>
						{#each filteredSuggestions as member (member.user_id)}
							<button
								type="button"
								class="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-primary hover:text-primary-content"
								onclick={() => insertMention(member)}
							>
								<Avatar
									src={member.profiles.avatar_url}
									name={member.profiles.display_name}
									size="sm"
								/>
								<span class="text-sm font-medium">{member.profiles.display_name}</span>
							</button>
						{/each}
					</div>
				</div>
			</div>
		{/if}

		<div class="mt-2 flex justify-end">
			<button
				type="submit"
				class="btn gap-2 btn-sm btn-primary"
				disabled={isSubmitting || !newComment.trim()}
			>
				{#if isSubmitting}
					<span class="loading loading-xs loading-spinner"></span>
					Enviando...
				{:else}
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
						<line x1="22" y1="2" x2="11" y2="13"></line>
						<polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
					</svg>
					Enviar
				{/if}
			</button>
		</div>
	</form>

	<!-- Comments List -->
	<div class="space-y-3">
		{#if comments.length === 0}
			<div class="py-8 text-center text-base-content/50">
				<p class="text-sm">No hay comentarios todavía</p>
			</div>
		{:else}
			{#each comments as comment (comment.id)}
				<div class="space-y-2 rounded-lg bg-base-200 p-4">
					<!-- Comment Header -->
					<div class="flex items-start justify-between gap-2">
						<div class="flex items-center gap-2">
							<Avatar
								src={comment.profiles.avatar_url}
								name={comment.profiles.display_name}
								size="sm"
							/>
							<div>
								<p class="text-sm font-semibold">{comment.profiles.display_name}</p>
								<p class="text-xs text-base-content/60">{formatDate(comment.created_at)}</p>
							</div>
						</div>

						<!-- Delete button (only for comment author) -->
						{#if comment.author_id === currentUserId}
							<form
								method="POST"
								action="?/deleteComment"
								use:enhance={() => {
									return async ({ result, update }) => {
										await update();
										if (result.type === 'success') {
											await invalidateAll();
										}
									};
								}}
							>
								<input type="hidden" name="comment_id" value={comment.id} />
								<button
									type="submit"
									class="btn text-error btn-ghost btn-xs"
									title="Eliminar comentario"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-4 w-4"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
									>
										<polyline points="3 6 5 6 21 6"></polyline>
										<path
											d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
										></path>
									</svg>
								</button>
							</form>
						{/if}
					</div>

					<!-- Comment content and mentions are always rendered as escaped text nodes. -->
					<p class="text-sm whitespace-pre-wrap">
						{#each parseCommentSegments(comment.content) as segment, index (index)}
							{#if segment.type === 'mention'}
								<span class="font-semibold text-primary">@{segment.value}</span>
							{:else}
								{segment.value}
							{/if}
						{/each}
					</p>
				</div>
			{/each}
		{/if}
	</div>
</div>
