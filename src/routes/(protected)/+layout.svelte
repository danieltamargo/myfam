<script lang="ts">
  import Header from '$lib/components/layout/Header.svelte';

  interface Props {
    data: {
      user: any;
      session: any;
    };
    children: any;
  }

  let { data, children }: Props = $props();
</script>

<div class="min-h-screen flex flex-col">
  <Header user={data.user} />

  <main class="flex-1">
    {@render children()}
  </main>
</div>
