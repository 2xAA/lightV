<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useVjStore } from "../stores/vj";

const store = useVjStore();
const servers = ref<Array<{ index: number; name: string }>>([]);
const serverIndex = ref<number | null>(null);

function refreshServers(): void {
  window.syphon.start();
  servers.value = window.syphon.getServers();
}

onMounted(() => {
  refreshServers();
  if (servers.value.length > 0)
    serverIndex.value = servers.value[servers.value.length - 1].index;
  window.syphon.onServersChanged((list) => {
    servers.value = list;
    if (serverIndex.value == null && list.length > 0)
      serverIndex.value = list[list.length - 1].index;
  });
});

async function loadToDeckB(): Promise<void> {
  if (typeof serverIndex.value === "number") {
    await store.loadSyphonIntoDeck("B", serverIndex.value);
  }
}
</script>

<template>
  <div style="display: flex; gap: 8px; align-items: center">
    <label>
      Syphon to Deck B:
      <select v-model.number="serverIndex">
        <option v-for="s in servers" :key="s.index" :value="s.index">
          {{ s.name }}
        </option>
      </select>
    </label>
    <button @click="refreshServers">Refresh</button>
    <button :disabled="serverIndex == null" @click="loadToDeckB">Load</button>
  </div>
</template>
