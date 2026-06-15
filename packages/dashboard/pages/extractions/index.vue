<template>
  <div class="p-6 space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-white">Forensic Extraction</h1>
      <p class="text-sm text-slate-500 mt-1">Upload a leaked screenshot to identify the source</p>
    </div>

    <!-- Upload Zone -->
    <div
      class="card border-2 border-dashed transition-colors duration-200 cursor-pointer"
      :class="isDragging ? 'border-sentinel-500 bg-sentinel-500/5' : 'border-slate-700 hover:border-slate-600'"
      @dragover.prevent="isDragging = true"
      @dragleave="isDragging = false"
      @drop.prevent="handleDrop"
      @click="fileInput?.click()"
    >
      <div class="flex flex-col items-center py-10">
        <div class="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center mb-4">
          <svg class="w-8 h-8" :class="isDragging ? 'text-sentinel-400' : 'text-slate-500'" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
        </div>
        <div class="text-sm text-slate-300 font-medium">
          {{ isDragging ? 'Drop the image here' : 'Drag & drop a screenshot, or click to browse' }}
        </div>
        <div class="text-xs text-slate-600 mt-1">Supports PNG, JPEG, WebP · Max 20MB</div>
      </div>
      <input
        ref="fileInput"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        class="hidden"
        @change="handleFileSelect"
      />
    </div>

    <!-- Processing State -->
    <div v-if="isProcessing" class="card">
      <div class="flex items-center gap-4">
        <div class="w-10 h-10 rounded-lg bg-sentinel-600/20 flex items-center justify-center">
          <svg class="w-5 h-5 text-sentinel-400 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
        <div>
          <div class="text-sm font-medium text-white">Analyzing screenshot...</div>
          <div class="text-xs text-slate-500">Running 5-channel forensic extraction with Bayesian fusion</div>
        </div>
      </div>
      <div class="mt-4 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div class="h-full bg-sentinel-500 rounded-full animate-pulse" style="width: 60%" />
      </div>
    </div>

    <!-- Result -->
    <div v-if="result" class="space-y-4">
      <!-- Attribution Card -->
      <div class="card border-l-4" :class="confidenceBorderColor">
        <div class="flex items-start justify-between">
          <div>
            <div class="text-xs text-slate-500 uppercase tracking-wide mb-1">Attribution Result</div>
            <div class="text-xl font-bold text-white">{{ result.attribution?.user_id || 'Unknown' }}</div>
            <div class="text-sm text-slate-400 mt-1">
              Session: {{ result.attribution?.session_id || '—' }}
            </div>
            <div v-if="result.attribution?.watermark_id" class="text-xs text-slate-600 mt-1 font-mono">
              {{ result.attribution.watermark_id }}
            </div>
          </div>
          <div class="text-right">
            <div class="text-3xl font-bold" :class="confidenceTextColor">
              {{ confidencePercent }}%
            </div>
            <div class="text-xs mt-1" :class="confidenceTextColor">{{ confidenceLabel }}</div>
          </div>
        </div>
      </div>

      <!-- Per-Layer Confidence -->
      <div class="card">
        <h3 class="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-4">Per-Layer Confidence</h3>
        <div class="space-y-3">
          <LayerBar label="Macro Luminance" sublabel="Print-resilient zones" :value="result.per_layer_confidence?.macro_luminance || 0" />
          <LayerBar label="Structural Layout" sublabel="Spacing geometry" :value="result.per_layer_confidence?.structural_layout || 0" />
          <LayerBar label="Luminance" sublabel="Element brightness" :value="result.per_layer_confidence?.luminance || 0" />
          <LayerBar label="Color Channel" sublabel="RGB encoding" :value="result.per_layer_confidence?.color_channel || 0" />
          <LayerBar label="Sub-Pixel" sublabel="Micro-patterns" :value="result.per_layer_confidence?.subpixel || 0" />
          <LayerBar label="SVG Mesh" sublabel="Path curvature" :value="result.per_layer_confidence?.svg_mesh || 0" />
          <LayerBar label="Temporal" sublabel="Mutation epoch" :value="result.per_layer_confidence?.temporal || 0" />
        </div>
      </div>

      <!-- Degradation Analysis -->
      <div class="card">
        <h3 class="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-4">Degradation Analysis</h3>
        <div class="grid grid-cols-3 gap-4">
          <div>
            <div class="text-xs text-slate-600">Compression</div>
            <div class="text-sm text-white font-medium capitalize">{{ result.degradation_analysis?.compression_level || '—' }}</div>
          </div>
          <div>
            <div class="text-xs text-slate-600">Source Type</div>
            <div class="text-sm text-white font-medium">{{ formatSource(result.degradation_analysis?.estimated_source) }}</div>
          </div>
          <div>
            <div class="text-xs text-slate-600">JPEG Quality</div>
            <div class="text-sm text-white font-medium">{{ result.degradation_analysis?.estimated_jpeg_quality || '—' }}</div>
          </div>
          <div>
            <div class="text-xs text-slate-600">Perspective Distortion</div>
            <div class="text-sm text-white font-medium">{{ result.degradation_analysis?.perspective_distortion ? 'Yes' : 'No' }}</div>
          </div>
          <div>
            <div class="text-xs text-slate-600">Crop Detected</div>
            <div class="text-sm text-white font-medium">{{ result.degradation_analysis?.crop_detected ? 'Yes' : 'No' }}</div>
          </div>
          <div>
            <div class="text-xs text-slate-600">Processing Time</div>
            <div class="text-sm text-white font-medium">{{ result.processing_time_ms?.toFixed(0) || '—' }}ms</div>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex gap-3">
        <button class="btn-primary" @click="reset">New Extraction</button>
        <button class="btn-secondary" @click="copyResult">Copy JSON Result</button>
      </div>
    </div>

    <!-- History -->
    <div v-if="history.length > 0 && !result" class="card">
      <h3 class="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-4">Extraction History</h3>
      <div class="space-y-2">
        <div
          v-for="(item, i) in history"
          :key="i"
          class="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg cursor-pointer hover:bg-slate-800"
          @click="result = item"
        >
          <div>
            <div class="text-sm text-white font-medium">{{ item.attribution?.user_id }}</div>
            <div class="text-xs text-slate-500">{{ item.extraction_id }}</div>
          </div>
          <div class="text-sm font-bold" :class="getConfidenceColor(item.attribution?.confidence || 0)">
            {{ ((item.attribution?.confidence || 0) * 100).toFixed(1) }}%
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const { submitExtraction } = useApi();

const fileInput = ref<HTMLInputElement | null>(null);
const isDragging = ref(false);
const isProcessing = ref(false);
const result = ref<any>(null);
const history = ref<any[]>([]);

async function processFile(file: File) {
  if (!file.type.startsWith('image/')) return;
  if (file.size > 20 * 1024 * 1024) {
    alert('File too large. Maximum 20MB.');
    return;
  }

  isProcessing.value = true;
  result.value = null;

  try {
    const data = await submitExtraction(file);
    result.value = data;
    history.value.unshift(data);
  } catch (err: any) {
    alert('Extraction failed: ' + err.message);
  } finally {
    isProcessing.value = false;
  }
}

function handleDrop(e: DragEvent) {
  isDragging.value = false;
  const file = e.dataTransfer?.files[0];
  if (file) processFile(file);
}

function handleFileSelect(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) processFile(file);
}

function reset() {
  result.value = null;
  if (fileInput.value) fileInput.value.value = '';
}

function copyResult() {
  navigator.clipboard.writeText(JSON.stringify(result.value, null, 2));
}

// Confidence helpers
const confidencePercent = computed(() =>
  ((result.value?.attribution?.confidence || 0) * 100).toFixed(1)
);

const confidenceLabel = computed(() => {
  const c = result.value?.attribution?.confidence || 0;
  if (c >= 0.95) return 'Definitive Attribution';
  if (c >= 0.85) return 'High Confidence';
  if (c >= 0.7) return 'Moderate Confidence';
  if (c >= 0.5) return 'Low Confidence';
  return 'Inconclusive';
});

const confidenceBorderColor = computed(() => {
  const c = result.value?.attribution?.confidence || 0;
  if (c >= 0.95) return 'border-emerald-500';
  if (c >= 0.85) return 'border-blue-500';
  if (c >= 0.7) return 'border-amber-500';
  return 'border-red-500';
});

const confidenceTextColor = computed(() => {
  const c = result.value?.attribution?.confidence || 0;
  if (c >= 0.95) return 'text-emerald-400';
  if (c >= 0.85) return 'text-blue-400';
  if (c >= 0.7) return 'text-amber-400';
  return 'text-red-400';
});

function getConfidenceColor(c: number) {
  if (c >= 0.95) return 'text-emerald-400';
  if (c >= 0.85) return 'text-blue-400';
  if (c >= 0.7) return 'text-amber-400';
  return 'text-red-400';
}

function formatSource(source: string) {
  const map: Record<string, string> = {
    screenshot_tool: 'Screenshot Tool',
    phone_camera: 'Phone Camera',
    screen_recording: 'Screen Recording',
    unknown: 'Unknown',
  };
  return map[source] || source || '—';
}
</script>
