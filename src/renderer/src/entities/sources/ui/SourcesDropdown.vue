<template>
  <DropdownMenu
    :items="items"
    label="+ Add Source"
    @item-click="$emit('item-click', $event)"
  />
</template>

<script setup lang="ts">
import { DropdownMenu } from "@/shared/ui/dropdownMenu";
import { defineEmits } from "vue";

const items = [
  { id: "image", name: "Image" },
  { id: "video", name: "Video" },
  { id: "syphon", name: "Syphon" },
  { id: "webcam", name: "Webcam" },
  { id: "shader", name: "Shader" },
];

defineEmits<{
  (e: "item-click", item: { id: string; name: string }): void;
}>();
</script>
