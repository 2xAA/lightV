<template>
  <r-grid ref="dropdownMenuButtonRef" columns="1" class="dropdown-menu-grid">
    <r-cell span="1">
      <button @click="onToggleDropdown">
        {{ label }}
      </button>
    </r-cell>
  </r-grid>
  <Teleport to="body">
    <r-grid ref="dropdownMenuRef" columns="1" class="dropdown-menu-items">
      <r-cell v-if="isOpen" span="1">
        <ul class="dropdown-menu-items-list">
          <li v-for="item in items" :key="item.id" @click="onItemClick(item)">
            {{ item.name }}
          </li>
        </ul>
      </r-cell>
    </r-grid>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, useTemplateRef } from "vue";

defineProps<{
  items: { id: string; name: string }[];
  label: string;
}>();

const emit = defineEmits<{
  (e: "item-click", item: { id: string; name: string }): void;
}>();

const isOpen = ref(false);
const dropdownMenuButtonRef = useTemplateRef<HTMLDivElement>(
  "dropdownMenuButtonRef",
);
const dropdownMenuRef = useTemplateRef<HTMLDivElement>("dropdownMenuRef");

function handleClickOutside(event: MouseEvent): void {
  if (
    dropdownMenuButtonRef.value &&
    dropdownMenuButtonRef.value.contains(event.target as Node)
  ) {
    return;
  }
  if (
    dropdownMenuRef.value &&
    dropdownMenuRef.value.contains(event.target as Node)
  ) {
    return;
  }
  isOpen.value = false;
  document.removeEventListener("click", handleClickOutside);
}

function onToggleDropdown(): void {
  // get position of the ref element
  const refEl = dropdownMenuButtonRef.value;

  if (!refEl || !dropdownMenuRef.value) return;

  const offsetX = refEl.offsetLeft;
  const offsetY = refEl.offsetTop;
  const refHeight = refEl.offsetHeight;

  // position the dropdown menu
  dropdownMenuRef.value.style.top = `${offsetY + refHeight}px`;
  dropdownMenuRef.value.style.left = `${offsetX}px`;

  isOpen.value = !isOpen.value;

  document.addEventListener("click", handleClickOutside);
}

function onItemClick(item: { id: string; name: string }): void {
  emit("item-click", item);
}
</script>

<style scoped>
.dropdown-menu-grid {
  margin: 0;
  grid-row-gap: 0;
}

.dropdown-menu-items {
  position: absolute;
  z-index: 1000;
}

.dropdown-menu-items-list {
  overflow: hidden;
  background: var(--background-color);
  border: 1px solid rgba(var(--foreground-color-rgb), 0.18);
  border-radius: 6px;

  list-style: none;
  padding: 0;
  margin: 0;
}

.dropdown-menu-items-list li {
  padding: 6px 10px;
  cursor: pointer;
  margin: 0;
}

.dropdown-menu-items-list li:hover {
  background: rgba(var(--foreground-color-rgb), 0.5);
  color: var(--background-color);
}
</style>
