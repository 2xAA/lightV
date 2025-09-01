<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useVjStore, type BankSide } from "../stores/vj";

const props = defineProps<{ side: BankSide }>();
const store = useVjStore();

const selectedIndex = computed(() => store.getSelectedSlot(props.side));
const selectedSlot = computed(() => {
  const idx = selectedIndex.value;
  const slots = props.side === "left" ? store.leftSlots : store.rightSlots;
  return idx != null ? slots[idx] : null;
});
const source = computed(() => selectedSlot.value?.source ?? null);
const fields = computed(() =>
  source.value?.getOptionsSchema ? source.value.getOptionsSchema() : [],
);

function onChange(fieldKey: string, value: unknown): void {
  if (source.value && source.value.setOptions) {
    source.value.setOptions({ [fieldKey]: value });
  }
}

// Webcam devices
const webcamDevices = ref<Array<{ deviceId: string; label: string }>>([]);
const selectedDeviceId = ref<string | null>(null);

async function refreshWebcamDevices(): Promise<void> {
  try {
    const list = await navigator.mediaDevices.enumerateDevices();
    const cams = list.filter((d) => d.kind === "videoinput");
    webcamDevices.value = cams.map((d, i) => ({
      deviceId: d.deviceId,
      label: d.label || `Camera ${i + 1}`,
    }));
    if (!selectedDeviceId.value && webcamDevices.value.length > 0) {
      selectedDeviceId.value = webcamDevices.value[0].deviceId;
    }
  } catch {
    webcamDevices.value = [];
  }
}

watch(
  () => (source.value ? (source.value as { type?: string }).type : null),
  async (t) => {
    if (t === "webcam") {
      await refreshWebcamDevices();
    }
  },
  { immediate: true },
);

function onSelectWebcam(): void {
  if (source.value && source.value.setOptions && selectedDeviceId.value) {
    source.value.setOptions({ deviceId: selectedDeviceId.value });
  }
}
</script>

<template>
  <div
    style="
      border: 1px solid #ccc;
      padding: 8px;
      min-height: 160px;
      display: grid;
      gap: 8px;
    "
  >
    <template v-if="!source">
      <em
        >Select a source in the
        {{ props.side === "left" ? "left" : "right" }} bank to edit options.</em
      >
    </template>
    <template v-else>
      <div style="font-weight: 600">{{ selectedSlot?.label }}</div>

      <!-- Webcam-specific device dropdown -->
      <div
        v-if="(source as any).type === 'webcam'"
        style="display: grid; gap: 4px"
      >
        <label style="font-size: 12px">Webcam device</label>
        <div style="display: flex; gap: 6px; align-items: center">
          <select v-model="selectedDeviceId" @change="onSelectWebcam">
            <option
              v-for="d in webcamDevices"
              :key="d.deviceId"
              :value="d.deviceId"
            >
              {{ d.label }}
            </option>
          </select>
          <button @click="refreshWebcamDevices">Refresh</button>
        </div>
      </div>

      <!-- Generic fields from schema (e.g., fill mode) -->
      <div v-for="f in fields" :key="f.key" style="display: grid; gap: 4px">
        <label style="font-size: 12px">{{ f.label }}</label>
        <template v-if="f.type === 'select'">
          <select
            :value="f.value as any"
            @change="
              onChange(f.key, ($event.target as HTMLSelectElement).value)
            "
          >
            <option
              v-for="opt in f.options"
              :key="String(opt.value)"
              :value="opt.value as any"
            >
              {{ opt.label }}
            </option>
          </select>
        </template>
        <template v-else-if="f.type === 'checkbox'">
          <input
            type="checkbox"
            :checked="Boolean(f.value)"
            @change="
              onChange(f.key, ($event.target as HTMLInputElement).checked)
            "
          />
        </template>
        <template v-else-if="f.type === 'number'">
          <input
            type="number"
            :min="f.min"
            :max="f.max"
            :step="f.step ?? 1"
            :value="(f.value as any) ?? ''"
            @change="
              onChange(f.key, Number(($event.target as HTMLInputElement).value))
            "
          />
        </template>
        <template v-else>
          <input
            type="text"
            :value="(f.value as any) ?? ''"
            @change="onChange(f.key, ($event.target as HTMLInputElement).value)"
          />
        </template>
      </div>
    </template>
  </div>
</template>
