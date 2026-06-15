<template>
  <div class="p-6 space-y-6">
    <!-- Header -->
    <div>
      <h1 class="text-2xl font-bold text-white">Dashboard</h1>
      <p class="text-sm text-slate-500 mt-1">Forensic attribution overview</p>
    </div>

    <!-- Metric Cards -->
    <div class="grid grid-cols-4 gap-4">
      <div class="card">
        <div class="text-xs text-slate-500 uppercase tracking-wide">Active Sessions</div>
        <div class="text-3xl font-bold text-white mt-2">{{ stats.activeSessions }}</div>
        <div class="text-xs text-emerald-400 mt-1">Last 24 hours</div>
      </div>
      <div class="card">
        <div class="text-xs text-slate-500 uppercase tracking-wide">Extractions</div>
        <div class="text-3xl font-bold text-white mt-2">{{ stats.totalExtractions }}</div>
        <div class="text-xs text-sentinel-400 mt-1">Total performed</div>
      </div>
      <div class="card">
        <div class="text-xs text-slate-500 uppercase tracking-wide">Open Investigations</div>
        <div class="text-3xl font-bold text-white mt-2">{{ stats.openInvestigations }}</div>
        <div class="text-xs text-amber-400 mt-1">Pending review</div>
      </div>
      <div class="card">
        <div class="text-xs text-slate-500 uppercase tracking-wide">Avg Confidence</div>
        <div class="text-3xl font-bold text-white mt-2">{{ stats.avgConfidence }}%</div>
        <div class="text-xs text-emerald-400 mt-1">Extraction accuracy</div>
      </div>
    </div>

    <!-- Two Column Layout -->
    <div class="grid grid-cols-3 gap-4">
      <!-- Recent Extractions -->
      <div class="col-span-2 card">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-sm font-semibold text-slate-400 uppercase tracking-wide">Recent Extractions</h3>
          <NuxtLink to="/extractions" class="text-xs text-sentinel-400 hover:text-sentinel-300">View all →</NuxtLink>
        </div>
        <div v-if="recentExtractions.length === 0" class="text-center py-8 text-slate-600">
          No extractions yet. Upload a screenshot to get started.
        </div>
        <div v-else class="space-y-3">
          <div
            v-for="ext in recentExtractions"
            :key="ext.id"
            class="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg"
          >
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center">
                <svg class="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5" />
                </svg>
              </div>
              <div>
                <div class="text-sm text-white font-medium">{{ ext.user_id }}</div>
                <div class="text-xs text-slate-500">{{ ext.extraction_id }}</div>
              </div>
            </div>
            <div class="text-right">
              <div class="text-sm font-bold" :class="confidenceColor(ext.confidence)">
                {{ (ext.confidence * 100).toFixed(1) }}%
              </div>
              <div class="text-xs text-slate-600">{{ ext.time }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- System Status -->
      <div class="card">
        <h3 class="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-4">System Status</h3>
        <div class="space-y-3">
          <StatusRow label="Token Service" :status="services.token" />
          <StatusRow label="Extraction API" :status="services.extraction" />
          <StatusRow label="PostgreSQL" :status="services.database" />
          <StatusRow label="SDK CDN" :status="services.cdn" />
        </div>

        <div class="mt-6 pt-4 border-t border-slate-800">
          <h3 class="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">Quick Actions</h3>
          <div class="space-y-2">
            <NuxtLink to="/extractions" class="btn-primary block text-center text-sm">
              New Extraction
            </NuxtLink>
            <NuxtLink to="/investigations" class="btn-secondary block text-center text-sm">
              New Investigation
            </NuxtLink>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const stats = ref({
  activeSessions: 0,
  totalExtractions: 0,
  openInvestigations: 0,
  avgConfidence: 0,
});

const recentExtractions = ref<any[]>([]);

const services = ref({
  token: 'checking',
  extraction: 'checking',
  database: 'checking',
  cdn: 'online',
});

const { getExtractionHealth, getTokenHealth } = useApi();

onMounted(async () => {
  // Check services
  const [extHealth, tokenHealth] = await Promise.all([
    getExtractionHealth(),
    getTokenHealth(),
  ]);

  services.value.extraction = extHealth.status === 'ok' ? 'online' : 'offline';
  services.value.token = tokenHealth.status === 'ok' ? 'online' : 'offline';
  services.value.database = extHealth.status === 'ok' ? 'online' : 'offline';
});

function confidenceColor(confidence: number) {
  if (confidence >= 0.95) return 'text-emerald-400';
  if (confidence >= 0.85) return 'text-sentinel-400';
  if (confidence >= 0.7) return 'text-amber-400';
  return 'text-red-400';
}
</script>
