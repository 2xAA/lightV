<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from "vue";
import {
  ColorAverage,
  ColorAverageControls,
  ColorAverageTable,
  useColorAverageStore,
  ColorAnalysisSessionProvider,
} from "@/features/color-analysis";
import {
  useVjStore,
  VjSessionProvider,
  SourceOptionsPanel,
  CompositorCanvas,
  Crossfader,
  Bank,
  SessionControls,
} from "@/features/vj";
import { SessionManager } from "@/shared/session";

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

onMounted(async () => {
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

  // Register session providers
  SessionManager.registerProvider("vj", new VjSessionProvider(vj));
  SessionManager.registerProvider(
    "colorAnalysis",
    new ColorAnalysisSessionProvider(colorStore),
  );

  // Load complete session after both apps are initialized
  setTimeout(async () => {
    await SessionManager.loadSession();
  }, 500);
});

watch(selectedIndex, (idx) => {
  if (typeof idx === "number") {
    window.syphon.selectServer(idx);
  }
});

onBeforeUnmount(() => {
  if (removeServersListener) removeServersListener();
  window.syphon.stop();

  // Unregister session providers
  SessionManager.unregisterProvider("vj");
  SessionManager.unregisterProvider("colorAnalysis");
});
</script>

<template>
  <div style="padding: 12px 12px 0 12px">
    <SessionControls />
  </div>
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
