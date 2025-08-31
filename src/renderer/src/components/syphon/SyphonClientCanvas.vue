<script lang="ts">
export default {
  name: "SyphonClientCanvas",
};
</script>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

type ResizePayload = { width: number; height: number };
const emit = defineEmits<{
  (e: "fps", value: number): void;
  (e: "resize", payload: ResizePayload): void;
}>();

const canvasRef = ref<HTMLCanvasElement>();
let offscreenCanvas: OffscreenCanvas | null = null;
let worker: Worker | null = null;
let animationFrameReqId: number | null = null;

const width = ref<number>(0);
const height = ref<number>(0);

async function getAndRenderFrame(): Promise<void> {
  const frame = await window.syphon.pullFrame();
  if (frame) {
    width.value = frame.width;
    height.value = frame.height;
    worker?.postMessage({
      buffer: frame.buffer,
      width: width.value,
      height: height.value,
    });
  }
  animationFrameReqId = requestAnimationFrame(getAndRenderFrame);
}

watch(
  () => [width.value, height.value],
  () => {
    emit("resize", { width: width.value, height: height.value });
  },
);

onMounted(async () => {
  const canvas: HTMLCanvasElement = canvasRef.value!;
  offscreenCanvas = canvas.transferControlToOffscreen();

  const WorkerURL = (await import("./workers/simple-client.worker.js?url"))
    .default as string;
  worker = new Worker(WorkerURL);
  const osc = offscreenCanvas!;
  worker.postMessage({ cmd: "init", canvas: osc }, [osc]);
  worker.onmessage = (
    event: MessageEvent<{ type: "fps"; payload: number }>,
  ) => {
    if (event.data.type === "fps") emit("fps", event.data.payload);
  };

  animationFrameReqId = requestAnimationFrame(getAndRenderFrame);
});

onBeforeUnmount(() => {
  if (animationFrameReqId) cancelAnimationFrame(animationFrameReqId);
  if (worker) worker.terminate();
});
</script>

<template>
  <canvas ref="canvasRef" :width="width" :height="height" />
</template>

<!-- <style scoped>
/* Flip vertically to match source orientation */
canvas {
  transform: scaleY(-1);
}
</style> -->
