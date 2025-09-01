<script setup lang="ts">
import { computed } from "vue";
import { useVjStore } from "../stores/vj";

const store = useVjStore();
const value = computed({
  get: () => store.crossfade,
  set: (v: number) => store.setCrossfade(v),
});
</script>

<template>
  <div style="display: grid; gap: 6px; align-items: center">
    <label style="font-size: 12px">Crossfader</label>
    <input type="range" min="0" max="1" step="0.001" v-model.number="value" />
  </div>
</template>
