<script setup lang="ts">
import { computed, ref } from "vue";
import { useVjStore, type BankSide } from "../stores/vj";
import SourceSlot from "./SourceSlot.vue";

const props = defineProps<{ side: BankSide }>();
const store = useVjStore();

const slots = computed(() =>
  props.side === "left" ? store.leftSlots : store.rightSlots,
);
const fileInput = ref<HTMLInputElement | null>(null);

function addImage(): void {
  fileInput.value?.click();
}

async function onFileChange(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files && input.files[0];
  if (!file) return;
  await store.addImageToBank(props.side, file);
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
        <div style="display: flex; gap: 8px">
          <button @click="addImage">+ Image</button>
          <button @click="addSyphon">+ Syphon</button>
          <input
            ref="fileInput"
            type="file"
            accept="image/*"
            style="display: none"
            @change="onFileChange"
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
        <div style="display: grid; place-items: center">
          <button aria-label="Add image" @click="addImage">+</button>
          <input
            ref="fileInput"
            type="file"
            accept="image/*"
            style="display: none"
            @change="onFileChange"
          />
        </div>
      </div>
    </template>
  </div>
</template>
