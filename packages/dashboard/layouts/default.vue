<template>
  <div class="flex h-screen overflow-hidden">
    <!-- Sidebar -->
    <aside class="w-64 bg-slate-900 border-r border-slate-800 flex flex-col flex-shrink-0">
      <!-- Logo -->
      <div class="p-5 border-b border-slate-800">
        <NuxtLink to="/" class="flex items-center gap-3">
          <div class="w-9 h-9 bg-sentinel-600 rounded-lg flex items-center justify-center">
            <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <div>
            <div class="text-sm font-bold text-white">ScreenSentinel</div>
            <div class="text-[10px] text-slate-500 uppercase tracking-wider">Forensic Attribution</div>
          </div>
        </NuxtLink>
      </div>

      <!-- Navigation -->
      <nav class="flex-1 p-3 space-y-1 overflow-y-auto">
        <NavItem to="/" icon="dashboard" label="Dashboard" />
        <NavItem to="/extractions" icon="extract" label="Extractions" />
        <NavItem to="/investigations" icon="investigate" label="Investigations" />
        <NavItem to="/sessions" icon="sessions" label="Sessions" />
        <NavItem to="/reports" icon="reports" label="Reports" />

        <div class="pt-4 pb-2">
          <div class="text-[10px] text-slate-600 uppercase tracking-wider px-3">System</div>
        </div>
        <NavItem to="/settings" icon="settings" label="Settings" />
      </nav>

      <!-- Status -->
      <div class="p-4 border-t border-slate-800">
        <div class="flex items-center gap-2 text-xs text-slate-500">
          <span class="w-2 h-2 rounded-full" :class="systemOnline ? 'bg-emerald-500' : 'bg-red-500'" />
          {{ systemOnline ? 'System Online' : 'System Offline' }}
        </div>
        <div class="text-[10px] text-slate-600 mt-1">v0.1.0 · Agent Viscro</div>
      </div>
    </aside>

    <!-- Main Content -->
    <main class="flex-1 overflow-y-auto">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
const systemOnline = ref(true);
const { getExtractionHealth } = useApi();

let healthInterval: ReturnType<typeof setInterval> | null = null;

onMounted(async () => {
  const health = await getExtractionHealth();
  systemOnline.value = health.status === 'ok';

  healthInterval = setInterval(async () => {
    const health = await getExtractionHealth();
    systemOnline.value = health.status === 'ok';
  }, 30000);
});

onUnmounted(() => {
  if (healthInterval) clearInterval(healthInterval);
});
</script>
