<script setup lang="ts">
import { ref } from "vue";
import { useVjStore, type BankSide } from "../model/vj-store";

const props = defineProps<{
  side: BankSide;
  index: number;
  label: string;
  type: string | null;
}>();
const store = useVjStore();
const fileInput = ref<HTMLInputElement | null>(null);
const showAddMenu = ref(false);

function chooseImage(): void {
  fileInput.value?.click();
}

async function onFileChange(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files && input.files[0];
  if (!file) return;
  await store.loadImageIntoSlot(props.side, props.index, file);
  input.value = "";
  showAddMenu.value = false;
}

async function addSyphon(): Promise<void> {
  const servers = window.syphon.getServers();
  const idx = servers.length > 0 ? servers[servers.length - 1].index : null;
  if (typeof idx === "number") {
    await store.loadSyphonIntoSlot(
      props.side,
      props.index,
      idx,
      servers[servers.length - 1].name,
    );
  } else {
    window.syphon.start();
  }
  showAddMenu.value = false;
}

function setActive(): void {
  store.setActiveFromSlot(props.side, props.index);
}

function select(): void {
  store.setSelectedSlot(props.side, props.index);
}

function removeSource(): void {
  store.removeSlot(props.side, props.index);
}
</script>

<template>
  <div
    style="
      position: relative;
      border: 1px solid #ccc;
      padding: 8px;
      min-height: 76px;
      display: grid;
      gap: 6px;
      cursor: pointer;
    "
    @click="type ? select() : undefined"
  >
    <template v-if="type">
      <div
        style="
          display: flex;
          align-items: center;
          justify-content: space-between;
        "
      >
        <div
          style="
            font-size: 12px;
            color: #666;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          "
        >
          {{ label }}
        </div>
        <div style="display: flex; gap: 4px">
          <button @click.stop="setActive">Set Active</button>
          <button
            style="
              background: var(--red);
              color: var(--white);
              border: none;
              padding: 4px 8px;
              border-radius: 3px;
              cursor: pointer;
              font-size: 11px;
            "
            @click.stop="removeSource"
          >
            Remove
          </button>
        </div>
      </div>
    </template>
    <template v-else>
      <div
        style="
          display: grid;
          place-items: center;
          height: 60px;
          color: #888;
          font-size: 12px;
        "
      >
        Empty
      </div>
      <div style="display: grid; place-items: center">
        <button aria-label="Add source" @click="showAddMenu = !showAddMenu">
          +
        </button>
      </div>
      <div
        v-if="showAddMenu"
        style="
          position: absolute;
          inset: 0;
          background: rgba(255, 255, 255, 0.98);
          display: grid;
          place-items: center;
          gap: 8px;
        "
      >
        <div style="display: flex; gap: 8px">
          <button @click="chooseImage">Image</button>
          <button @click="addSyphon">Syphon</button>
          <button @click="showAddMenu = false">Cancel</button>
        </div>
      </div>
      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        style="display: none"
        @change="onFileChange"
      />
    </template>
  </div>
</template>
