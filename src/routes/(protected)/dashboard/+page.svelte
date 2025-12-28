<script lang="ts">
  interface Props {
    data: {
      user: any;
    };
  }

  let { data }: Props = $props();
</script>

<div class="container mx-auto max-w-6xl p-8">
  <div class="mb-8">
    <h1 class="text-4xl font-bold">Welcome back!</h1>
    <p class="text-base-content/70 mt-2">
      Hi {data.user?.email}, this is your dashboard
    </p>
  </div>

  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    <!-- Families Card -->
    <div class="card bg-base-100 shadow-xl hover:shadow-2xl transition-shadow">
      <div class="card-body">
        <h2 class="card-title">
          <span class="text-3xl">👨‍👩‍👧‍👦</span>
          Families
        </h2>
        <p class="text-base-content/70">Manage your family groups and members</p>
        <div class="card-actions justify-end mt-4">
          <a href="/families" class="btn btn-primary btn-sm">View Families</a>
        </div>
      </div>
    </div>

    <!-- Wishlist Card -->
    <div class="card bg-base-100 shadow-xl hover:shadow-2xl transition-shadow">
      <div class="card-body">
        <h2 class="card-title">
          <span class="text-3xl">🎁</span>
          Wishlist
        </h2>
        <p class="text-base-content/70">Gift registry and shopping lists</p>
        <div class="card-actions justify-end mt-4">
          <a href="/families" class="btn btn-primary btn-sm">Go to Families</a>
        </div>
      </div>
    </div>

    <!-- Profile Card -->
    <div class="card bg-base-100 shadow-xl hover:shadow-2xl transition-shadow">
      <div class="card-body">
        <h2 class="card-title">
          <span class="text-3xl">⚙️</span>
          Profile
        </h2>
        <p class="text-base-content/70">Manage your account settings</p>
        <div class="card-actions justify-end mt-4">
          <a href="/profile" class="btn btn-primary btn-sm">View Profile</a>
        </div>
      </div>
    </div>
  </div>

  <!-- Recent Activity -->
  <div class="mt-8">
    <h2 class="text-2xl font-bold mb-4">Recent Activity</h2>
    <div class="card bg-base-100 shadow-xl">
      <div class="card-body">
        <div class="flex flex-col gap-4">
          <div class="flex items-center gap-4 p-4 bg-base-200 rounded-lg">
            <div class="text-2xl">👋</div>
            <div class="flex-1">
              <p class="font-semibold">Welcome to MyFamily!</p>
              <p class="text-sm text-base-content/70">Get started by creating your first family</p>
            </div>
            <div class="text-xs text-base-content/50">Just now</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
