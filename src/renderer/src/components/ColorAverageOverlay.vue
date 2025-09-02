<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";
import { useColorAverageStore } from "../stores/colorAverage";

const stageRef = ref<HTMLElement | null>(null);
const backgroundCanvasRef = ref<HTMLCanvasElement | null>(null);
const webglCanvasRef = ref<HTMLCanvasElement | null>(null);
const fabricCanvasRef = ref<HTMLCanvasElement | null>(null);

const store = useColorAverageStore();

onMounted(async () => {
  await store.init({
    stage: stageRef.value as HTMLElement,
    backgroundCanvas: backgroundCanvasRef.value as HTMLCanvasElement,
    webglCanvas: webglCanvasRef.value as HTMLCanvasElement,
    fabricCanvas: fabricCanvasRef.value as HTMLCanvasElement,
  });
});

onBeforeUnmount(() => {
  // Shared instance: do not reset app on unmount
});
</script>

<template>
  <div style="position: absolute; inset: 0; z-index: 2">
    <div ref="stageRef" style="position: absolute; inset: 0">
      <canvas
        ref="backgroundCanvasRef"
        width="8"
        height="8"
        style="display: none"
      ></canvas>
      <canvas
        ref="webglCanvasRef"
        width="8"
        height="8"
        style="display: none"
      ></canvas>
      <canvas
        ref="fabricCanvasRef"
        width="800"
        height="400"
        style="position: absolute; inset: 0; width: 100%; height: 100%"
      ></canvas>
    </div>
  </div>
</template>
