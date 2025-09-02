<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";
import { useVjStore } from "../stores/vj";

const emit = defineEmits<{ (e: "ready", canvas: HTMLCanvasElement): void }>();
const canvasRef = ref<HTMLCanvasElement | null>(null);
const store = useVjStore();

onMounted(() => {
  if (canvasRef.value) {
    store.init(canvasRef.value);
    emit("ready", canvasRef.value);
  }
});

onBeforeUnmount(() => {
  store.stop();
});
</script>

<template>
  <canvas
    ref="canvasRef"
    width="800"
    height="400"
    style="width: 100%; height: 100%; display: block; background: #000"
  ></canvas>
</template>
