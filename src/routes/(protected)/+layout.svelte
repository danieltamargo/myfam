<script lang="ts">
  import Header from '$lib/components/layout/Header.svelte';

  interface Props {
    data: {
      user: any;
      session: any;
      families: Array<{
        id: string;
        name: string;
        role: string;
      }>;
      notifications: Array<any>;
    };
    children: any;
  }

  let { data, children }: Props = $props();
</script>

<div class="min-h-screen flex flex-col">
  <Header user={data.user} families={data.families} notifications={data.notifications} />

  <main class="flex-1">
    {@render children()}
  </main>
</div>
