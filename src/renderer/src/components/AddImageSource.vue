<script setup lang="ts">
import { ref } from "vue";
import { useVjStore } from "../stores/vj";
import { registerSource } from "../app/sources/sourceRegistry";
import { ImageSource } from "../app/sources/ImageSource";

// ensure registration (id factory lives in store for others, but safe here)
registerSource(
  "image",
  ({ id, label, options }) => new ImageSource({ id, label, options }),
);

const fileInput = ref<HTMLInputElement | null>(null);
const store = useVjStore();

function chooseFile(): void {
  fileInput.value?.click();
}

async function onFileChange(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files && input.files[0];
  if (!file) return;
  await store.loadImageIntoDeck("A", file); // first slice: target deck A
}
</script>

<template>
  <div style="display: flex; gap: 8px; align-items: center">
    <button @click="chooseFile">Add image to Deck A</button>
    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      style="display: none"
      @change="onFileChange"
    />
  </div>
</template>
