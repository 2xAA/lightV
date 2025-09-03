<script setup lang="ts">
import { computed, ref } from "vue";
import { useVjStore, type BankSide } from "../model/vj-store";
import SourceSlot from "./SourceSlot.vue";
import { SourcesDropdown } from "@/entities/sources/ui";

const props = defineProps<{ side: BankSide }>();
const store = useVjStore();

const slots = computed(() =>
  props.side === "left" ? store.leftSlots : store.rightSlots,
);
const imageInput = ref<HTMLInputElement | null>(null);
const videoInput = ref<HTMLInputElement | null>(null);

function addImage(): void {
  imageInput.value?.click();
}
function addVideo(): void {
  videoInput.value?.click();
}
async function addWebcam(): Promise<void> {
  await store.addWebcamToBank(props.side);
}
async function addShader(): Promise<void> {
  await store.addShaderToBank(props.side);
}

async function onImageChange(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files && input.files[0];
  if (!file) return;
  await store.addImageToBank(props.side, file);
  input.value = "";
}

async function onVideoChange(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files && input.files[0];
  if (!file) return;
  await store.addVideoToBank(props.side, file);
  input.value = "";
}

async function addSyphon(): Promise<void> {
  const servers = window.syphon.getServers();
  const idx = servers.length > 0 ? servers[servers.length - 1].index : null;
  if (typeof idx === "number") {
    await store.addSyphonToBank(
      props.side,
      idx,
      servers[servers.length - 1].name,
    );
  } else {
    await window.syphon.start();
  }
}

function onItemClick(item: { id: string; name: string }): void {
  console.log(item);
  if (item.id === "image") {
    addImage();
  } else if (item.id === "video") {
    addVideo();
  } else if (item.id === "syphon") {
    addSyphon();
  } else if (item.id === "webcam") {
    addWebcam();
  } else if (item.id === "shader") {
    addShader();
  }
}
</script>

<template>
  <div style="display: grid; gap: 8px">
    <strong>{{ props.side === "left" ? "Bank A" : "Bank B" }}</strong>

    <template v-if="slots.length === 0">
      <div
        style="
          display: grid;
          place-items: center;
          padding: 24px;
          border: 1px dashed #ccc;
          color: #888;
          gap: 8px;
        "
      >
        <div>No sources yet</div>
        <div
          style="
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            justify-content: center;
          "
        >
          <SourcesDropdown @item-click="onItemClick" />
          <!-- <button @click="addImage">+ Image</button>
          <button @click="addVideo">+ Video</button>
          <button @click="addWebcam">+ Webcam</button>
          <button @click="addShader">+ Shader</button>
          <button @click="addSyphon">+ Syphon</button> -->
          <input
            ref="imageInput"
            type="file"
            accept="image/*"
            style="display: none"
            @change="onImageChange"
          />
          <input
            ref="videoInput"
            type="file"
            accept="video/*"
            style="display: none"
            @change="onVideoChange"
          />
        </div>
      </div>
    </template>

    <template v-else>
      <div
        style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px"
      >
        <SourceSlot
          v-for="(s, i) in slots"
          :key="s.id"
          :side="props.side"
          :index="i"
          :label="s.label"
          :type="s.type"
        />
        <div style="display: grid; place-items: center; gap: 6px">
          <SourcesDropdown @item-click="onItemClick" />
          <input
            ref="imageInput"
            type="file"
            accept="image/*"
            style="display: none"
            @change="onImageChange"
          />
          <input
            ref="videoInput"
            type="file"
            accept="video/*"
            style="display: none"
            @change="onVideoChange"
          />
        </div>
      </div>
    </template>
  </div>
</template>
