<template>
  <div class="p-6 space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-white">Watermark Sessions</h1>
        <p class="text-sm text-slate-500 mt-1">Active and recent watermark sessions</p>
      </div>
      <button class="btn-secondary text-xs" @click="loadSessions">Refresh</button>
    </div>

    <div class="card overflow-hidden p-0">
      <table class="w-full">
        <thead>
          <tr class="border-b border-slate-800">
            <th class="text-left text-xs text-slate-500 uppercase tracking-wide px-4 py-3">User</th>
            <th class="text-left text-xs text-slate-500 uppercase tracking-wide px-4 py-3">Session</th>
            <th class="text-left text-xs text-slate-500 uppercase tracking-wide px-4 py-3">Watermark ID</th>
            <th class="text-left text-xs text-slate-500 uppercase tracking-wide px-4 py-3">Page</th>
            <th class="text-left text-xs text-slate-500 uppercase tracking-wide px-4 py-3">Created</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="sessions.length === 0">
            <td colspan="5" class="text-center py-12 text-slate-600 text-sm">No sessions yet</td>
          </tr>
          <tr v-for="s in sessions" :key="s.watermark_id" class="border-b border-slate-800/50 hover:bg-slate-800/30">
            <td class="px-4 py-3 text-sm text-white font-medium">{{ s.user_id }}</td>
            <td class="px-4 py-3 text-xs text-slate-400 font-mono">{{ s.session_id }}</td>
            <td class="px-4 py-3 text-xs text-slate-500 font-mono">{{ s.watermark_id }}</td>
            <td class="px-4 py-3 text-sm text-slate-400">{{ s.page_context || '/' }}</td>
            <td class="px-4 py-3 text-xs text-slate-500">{{ new Date(s.created_at).toLocaleString() }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="text-xs text-slate-600">{{ sessions.length }} sessions</div>
  </div>
</template>

<script setup lang="ts">
const { getRecentSessions } = useApi();
const sessions = ref<any[]>([]);
async function loadSessions() { sessions.value = await getRecentSessions(); }
onMounted(loadSessions);
</script>
