<script setup lang="ts">
import { computed } from "vue";
import { useVjStore } from "../stores/vj";

const store = useVjStore();
const value = computed({
  get: () => store.crossfade,
  set: (v: number) => store.setCrossfade(v),
});

const curve = computed({
  get: () => store.crossfadeCurve,
  set: (c: "linear" | "equalPower") => store.setCrossfadeCurve(c),
});

const mode = computed({
  get: () => store.blendMode,
  set: (m: "normal" | "add" | "multiply" | "screen") => store.setBlendMode(m),
});
</script>

<template>
  <div style="display: grid; gap: 6px; align-items: center">
    <label style="font-size: 12px">Crossfader</label>
    <input v-model.number="value" type="range" min="0" max="1" step="0.001" />
    <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap">
      <label style="font-size: 12px">
        Curve
        <select v-model="curve">
          <option value="linear">Linear</option>
          <option value="equalPower">Equal‑Power</option>
        </select>
      </label>
      <label style="font-size: 12px">
        Blend
        <select v-model="mode">
          <option value="normal">Normal</option>
          <option value="add">Add</option>
          <option value="multiply">Multiply</option>
          <option value="screen">Screen</option>
        </select>
      </label>
    </div>
  </div>
</template>
