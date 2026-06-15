<template>
  <div class="p-6 space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-white">Investigations</h1>
        <p class="text-sm text-slate-500 mt-1">Manage forensic leak investigations</p>
      </div>
      <button class="btn-primary" @click="showCreate = true">+ New Investigation</button>
    </div>

    <div v-if="showCreate" class="card border border-sentinel-600/30">
      <h3 class="text-lg font-semibold text-white mb-4">New Investigation</h3>
      <div class="space-y-3">
        <input v-model="form.title" class="input" placeholder="Investigation title" />
        <textarea v-model="form.description" class="input h-24 resize-none" placeholder="Description..." />
        <input v-model="form.source_url" class="input" placeholder="Source URL (where leak was found)" />
        <select v-model="form.severity" class="input">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
        <div class="flex gap-2">
          <button class="btn-primary" @click="create">Create</button>
          <button class="btn-secondary" @click="showCreate = false">Cancel</button>
        </div>
      </div>
    </div>

    <div v-if="investigations.length === 0 && !showCreate" class="card text-center py-12">
      <div class="text-slate-600 text-sm">No investigations yet</div>
      <button class="btn-primary mt-4" @click="showCreate = true">Create your first investigation</button>
    </div>

    <div v-else class="space-y-3">
      <div v-for="inv in investigations" :key="inv.id" class="card flex items-center justify-between">
        <div>
          <div class="flex items-center gap-2">
            <h3 class="text-sm font-semibold text-white">{{ inv.title }}</h3>
            <span class="badge-yellow">{{ inv.severity }}</span>
            <span class="badge-blue">{{ inv.status }}</span>
          </div>
          <p class="text-xs text-slate-500 mt-1">{{ inv.description || 'No description' }}</p>
        </div>
        <div class="text-xs text-slate-600 font-mono">{{ inv.id?.slice(0, 12) }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const { getInvestigations, createInvestigation } = useApi();
const showCreate = ref(false);
const investigations = ref<any[]>([]);
const form = ref({ title: '', description: '', source_url: '', severity: 'medium' });

onMounted(async () => { investigations.value = await getInvestigations(); });

async function create() {
  if (!form.value.title) return;
  const result = await createInvestigation(form.value);
  investigations.value.unshift(result);
  showCreate.value = false;
  form.value = { title: '', description: '', source_url: '', severity: 'medium' };
}
</script>
