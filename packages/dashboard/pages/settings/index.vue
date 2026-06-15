<template>
  <div class="p-6 space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-white">Settings</h1>
      <p class="text-sm text-slate-500 mt-1">Configure ScreenSentinel</p>
    </div>

    <div class="card">
      <h3 class="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-4">API Endpoints</h3>
      <div class="space-y-3">
        <div>
          <label class="text-xs text-slate-500 block mb-1">Token Service</label>
          <input class="input" :value="config.public.tokenApiUrl" disabled />
        </div>
        <div>
          <label class="text-xs text-slate-500 block mb-1">Extraction API</label>
          <input class="input" :value="config.public.extractionApiUrl" disabled />
        </div>
      </div>
    </div>

    <div class="card">
      <h3 class="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-4">SDK Embed Code</h3>
      <pre class="bg-slate-800 rounded-lg p-4 font-mono text-xs text-slate-300 overflow-x-auto">&lt;script src="https://cdn.screensentinel.io/v1/sentinel.min.js"&gt;&lt;/script&gt;
&lt;script&gt;
  ScreenSentinel.init({
    apiKey: 'ss_live_your_key',
    userId: getCurrentUser().id,
    tenantId: 'your-org',
  });
&lt;/script&gt;</pre>
    </div>

    <div class="card">
      <h3 class="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-4">Watermark Layers</h3>
      <div class="grid grid-cols-2 gap-3">
        <div v-for="layer in layers" :key="layer.name" class="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
          <div>
            <div class="text-sm text-white">{{ layer.name }}</div>
            <div class="text-xs text-slate-500">{{ layer.intensity }}</div>
          </div>
          <div class="w-2 h-2 rounded-full bg-emerald-500" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const config = useRuntimeConfig();
const layers = [
  { name: 'Sub-Pixel', intensity: '70%' },
  { name: 'Luminance', intensity: '50%' },
  { name: 'SVG Mesh', intensity: '60%' },
  { name: 'Macro Luminance', intensity: '80%' },
  { name: 'Structural Layout', intensity: '60%' },
  { name: 'Color Channel', intensity: '70%' },
  { name: 'Temporal', intensity: '100%' },
];
</script>
