<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from "vue";
import {
  ColorAverage,
  ColorAverageControls,
  ColorAverageTable,
  useColorAverageStore,
} from "@/features/color-analysis";
import {
  useVjStore,
  SourceOptionsPanel,
  CompositorCanvas,
  Crossfader,
  Bank,
} from "@/features/vj";

const canvasRef = ref<HTMLCanvasElement | null>(null);
let removeServersListener: (() => void) | null = null;

const servers = ref<Array<{ index: number; name: string }>>([]);
const selectedIndex = ref<number | null>(null);

const colorStore = useColorAverageStore();
const vj = useVjStore();

function onMixerReady(canvas: HTMLCanvasElement): void {
  canvasRef.value = canvas;
  // Register compositor getter for single-context averaging
  colorStore.attachCompositorGetter(() => vj.compositor);
}

onMounted(() => {
  // Start Syphon discovery
  window.syphon.start();

  // Subscribe, then read current list
  removeServersListener = window.syphon.onServersChanged((list) => {
    servers.value = list;
    if (selectedIndex.value == null && list.length > 0) {
      selectedIndex.value = list[list.length - 1].index;
    }
  });
  servers.value = window.syphon.getServers();
  if (selectedIndex.value == null && servers.value.length > 0) {
    selectedIndex.value = servers.value[servers.value.length - 1].index;
  }
});

watch(selectedIndex, (idx) => {
  if (typeof idx === "number") {
    window.syphon.selectServer(idx);
  }
});

onBeforeUnmount(() => {
  if (removeServersListener) removeServersListener();
  window.syphon.stop();
});
</script>

<template>
  <r-grid columns="12" gap="12" style="padding: 12px">
    <r-cell span="3" sm="12">
      <SourceOptionsPanel side="left" />
    </r-cell>
    <r-cell span="6" sm="12">
      <div style="display: grid; gap: 12px">
        <div style="position: relative; height: 320px; background: #000">
          <CompositorCanvas @ready="onMixerReady" />
          <ColorAverage overlay />
        </div>
        <Crossfader />
      </div>
    </r-cell>
    <r-cell span="3" sm="12">
      <SourceOptionsPanel side="right" />
    </r-cell>
  </r-grid>

  <r-grid columns="12" gap="12" style="padding: 12px">
    <r-cell span="6" sm="12">
      <Bank side="left" />
    </r-cell>
    <r-cell span="6" sm="12">
      <Bank side="right" />
    </r-cell>
  </r-grid>

  <r-grid columns="12" gap="12" style="padding: 12px">
    <r-cell span="8" sm="12">
      <ColorAverageTable />
    </r-cell>
    <r-cell span="4" sm="12">
      <ColorAverageControls />
    </r-cell>
  </r-grid>
</template>
