<script setup lang="ts">
import ColorAverageOverlay from "./ColorAverageOverlay.vue";
import ColorAverageControls from "./ColorAverageControls.vue";
import ColorAverageTable from "./ColorAverageTable.vue";
defineProps<{
  overlay?: boolean;
  controlsOnly?: boolean;
  tableOnly?: boolean;
}>();
</script>

<template>
  <ColorAverageOverlay v-if="overlay" />
  <ColorAverageControls v-else-if="controlsOnly" />
  <ColorAverageTable v-else-if="tableOnly" />
  <div v-else />
</template>
