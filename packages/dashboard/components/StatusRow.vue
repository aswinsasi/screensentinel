<template>
  <div class="flex items-center justify-between">
    <span class="text-sm text-slate-400">{{ label }}</span>
    <span class="flex items-center gap-1.5 text-xs font-medium" :class="statusClass">
      <span class="w-1.5 h-1.5 rounded-full" :class="dotClass" />
      {{ statusLabel }}
    </span>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ label: string; status: string }>();

const statusClass = computed(() => ({
  'text-emerald-400': props.status === 'online',
  'text-amber-400': props.status === 'checking',
  'text-red-400': props.status === 'offline',
}));

const dotClass = computed(() => ({
  'bg-emerald-400': props.status === 'online',
  'bg-amber-400 animate-pulse': props.status === 'checking',
  'bg-red-400': props.status === 'offline',
}));

const statusLabel = computed(() => {
  if (props.status === 'online') return 'Online';
  if (props.status === 'checking') return 'Checking...';
  return 'Offline';
});
</script>
