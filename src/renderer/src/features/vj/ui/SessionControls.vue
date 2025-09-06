<script setup lang="ts">
import { ref } from "vue";
import { SessionManager } from "@/shared/session";

const isSaving = ref(false);
const isLoading = ref(false);

async function saveSession(): Promise<void> {
  isSaving.value = true;
  try {
    await SessionManager.saveSession();
    // Show a brief success indicator
    setTimeout(() => {
      isSaving.value = false;
    }, 500);
  } catch (error) {
    console.error("Failed to save session:", error);
    isSaving.value = false;
  }
}

async function loadSession(): Promise<void> {
  isLoading.value = true;
  try {
    await SessionManager.loadSession();
    // Show a brief loading indicator
    setTimeout(() => {
      isLoading.value = false;
    }, 500);
  } catch (error) {
    console.error("Failed to load session:", error);
    isLoading.value = false;
  }
}

function exportSession(): void {
  SessionManager.exportSession();
}

async function importSession(): Promise<void> {
  try {
    await SessionManager.importSession();
  } catch (error) {
    console.error("Failed to import session:", error);
  }
}

function clearSession(): void {
  if (
    confirm(
      "Are you sure you want to clear the current session? This will remove all sources, fabric elements, and reset to defaults.",
    )
  ) {
    SessionManager.clearSession();
    // Reload the page to reset everything
    window.location.reload();
  }
}
</script>

<template>
  <div
    style="
      display: flex;
      gap: 8px;
      align-items: center;
      padding: 8px;
      background: #f5f5f5;
      border-radius: 4px;
      flex-wrap: wrap;
    "
  >
    <span style="font-weight: 500; color: #333">Complete Session:</span>

    <button
      :disabled="isSaving"
      style="
        padding: 4px 8px;
        border: 1px solid #ccc;
        background: #fff;
        border-radius: 3px;
        cursor: pointer;
        font-size: 12px;
      "
      :style="{ opacity: isSaving ? 0.6 : 1 }"
      @click="saveSession"
    >
      {{ isSaving ? "Saving..." : "Save" }}
    </button>

    <button
      :disabled="isLoading"
      style="
        padding: 4px 8px;
        border: 1px solid #ccc;
        background: #fff;
        border-radius: 3px;
        cursor: pointer;
        font-size: 12px;
      "
      :style="{ opacity: isLoading ? 0.6 : 1 }"
      @click="loadSession"
    >
      {{ isLoading ? "Loading..." : "Load" }}
    </button>

    <button
      style="
        padding: 4px 8px;
        border: 1px solid #28a745;
        background: #fff;
        color: #28a745;
        border-radius: 3px;
        cursor: pointer;
        font-size: 12px;
      "
      @click="exportSession"
    >
      Export
    </button>

    <button
      style="
        padding: 4px 8px;
        border: 1px solid #007bff;
        background: #fff;
        color: #007bff;
        border-radius: 3px;
        cursor: pointer;
        font-size: 12px;
      "
      @click="importSession"
    >
      Import
    </button>

    <button
      style="
        padding: 4px 8px;
        border: 1px solid #dc3545;
        background: #fff;
        color: #dc3545;
        border-radius: 3px;
        cursor: pointer;
        font-size: 12px;
      "
      @click="clearSession"
    >
      Clear
    </button>
  </div>
</template>
