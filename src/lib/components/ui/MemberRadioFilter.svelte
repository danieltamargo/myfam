<script lang="ts">
	import Avatar from './Avatar.svelte';
	import { onMount } from 'svelte';
	let ready = $state(false);
	onMount(() => {
		ready = true;
	});
	let {
		name,
		label,
		members,
		value = '',
		autoSubmit = false,
		onselect
	}: {
		name: string;
		label: string;
		members: { id: string; displayName: string; avatarUrl: string | null }[];
		value?: string;
		autoSubmit?: boolean;
		onselect?: (value: string) => void;
	} = $props();
	function select(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		onselect?.(input.value);
		if (autoSubmit) input.form?.requestSubmit();
	}
</script>

<fieldset class="min-w-0">
	<legend class="mb-2 text-xs font-medium">{label}</legend>
	<div class="flex max-w-full flex-wrap items-center gap-2">
		<label class="cursor-pointer" title="Todas las personas">
			<input
				type="radio"
				{name}
				value=""
				checked={!value}
				onchange={select}
				class="peer sr-only"
				disabled={!ready}
			/>
			<span
				class="flex min-h-12 min-w-12 items-center justify-center rounded-full border border-base-300 px-3 text-sm peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-content peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary"
				>Todos</span
			>
		</label>
		{#each members as member (member.id)}
			<label class="cursor-pointer" title={member.displayName}>
				<input
					type="radio"
					{name}
					value={member.id}
					checked={value === member.id}
					disabled={!ready}
					onchange={select}
					class="peer sr-only"
				/>
				<span
					class="block rounded-full border-2 border-transparent peer-checked:border-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary"
				>
					<span class="sr-only">{member.displayName}</span>
					<span aria-hidden="true"
						><Avatar name={member.displayName} src={member.avatarUrl} size="sm" /></span
					>
				</span>
			</label>
		{/each}
	</div>
</fieldset>
