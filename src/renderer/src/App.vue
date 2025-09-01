<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from "vue";
import ColorAverage from "./components/ColorAverage.vue";
import CompositorCanvas from "./components/CompositorCanvas.vue";
import Crossfader from "./components/Crossfader.vue";
import AddImageSource from "./components/AddImageSource.vue";

const canvasRef = ref<HTMLCanvasElement | null>(null);
// let removeFrameListener: (() => void) | null = null
let removeServersListener: (() => void) | null = null;

const servers = ref<Array<{ index: number; name: string }>>([]);
const selectedIndex = ref<number | null>(null);

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

  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // removeFrameListener = window.syphon.onFrame(({ buffer, width, height }) => {
  //   if (canvas.width !== width) canvas.width = width
  //   if (canvas.height !== height) canvas.height = height

  //   // Create a fresh Uint8ClampedArray to satisfy DOM types
  //   const clamped = new Uint8ClampedArray(buffer.length)
  //   clamped.set(buffer)
  //   const imageData = new ImageData(clamped, width, height)
  //   ctx.putImageData(imageData, 0, 0)
  // })
});

watch(selectedIndex, (idx) => {
  if (typeof idx === "number") {
    window.syphon.selectServer(idx);
  }
});

onBeforeUnmount(() => {
  // if (removeFrameListener) removeFrameListener()
  if (removeServersListener) removeServersListener();
  window.syphon.stop();
});
</script>

<template>
  <div style="padding: 12px; display: flex; gap: 16px; align-items: center">
    <label>
      Syphon server:
      <select v-model.number="selectedIndex">
        <option v-for="s in servers" :key="s.index" :value="s.index">
          {{ s.name }}
        </option>
      </select>
    </label>
  </div>

  <div style="padding: 12px; display: grid; gap: 12px">
    <div style="height: 320px; background: #000"><CompositorCanvas /></div>
    <Crossfader />
    <AddImageSource />
  </div>

  <ColorAverage />
</template>
