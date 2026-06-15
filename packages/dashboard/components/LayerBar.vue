<template>
  <div>
    <div class="flex items-center justify-between mb-1">
      <div>
        <span class="text-sm text-slate-300">{{ label }}</span>
        <span class="text-xs text-slate-600 ml-2">{{ sublabel }}</span>
      </div>
      <span class="text-sm font-bold font-mono" :class="barColor">{{ percent }}%</span>
    </div>
    <div class="h-2 bg-slate-800 rounded-full overflow-hidden">
      <div class="h-full rounded-full transition-all duration-700 ease-out" :class="bgColor" :style="{ width: percent + '%' }" />
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ label: string; sublabel: string; value: number }>();

const percent = computed(() => (props.value * 100).toFixed(1));

const barColor = computed(() => {
  if (props.value >= 0.9) return 'text-emerald-400';
  if (props.value >= 0.7) return 'text-sentinel-400';
  if (props.value >= 0.5) return 'text-amber-400';
  if (props.value > 0) return 'text-red-400';
  return 'text-slate-600';
});

const bgColor = computed(() => {
  if (props.value >= 0.9) return 'bg-emerald-500';
  if (props.value >= 0.7) return 'bg-sentinel-500';
  if (props.value >= 0.5) return 'bg-amber-500';
  if (props.value > 0) return 'bg-red-500';
  return 'bg-slate-700';
});
</script>
