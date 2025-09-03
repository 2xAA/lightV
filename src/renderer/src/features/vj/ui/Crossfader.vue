<script setup lang="ts">
import { computed } from "vue";
import { useVjStore } from "../model/vj-store";

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

const trType = computed({
  get: () => store.transitionType,
  set: (t: "crossfade" | "wipe" | "luma") => store.setTransitionTypeUI(t),
});

const trSoftness = computed({
  get: () => store.transitionSoftness,
  set: (v: number) => store.setTransitionSoftness(v),
});

const trAngleDeg = computed({
  get: () => Math.round((store.transitionAngleRad * 180) / Math.PI),
  set: (deg: number) =>
    store.setTransitionAngleRad(((Number(deg) || 0) * Math.PI) / 180),
});

const trInvert = computed({
  get: () => store.transitionLumaInvert,
  set: (on: boolean) => store.setTransitionLumaInvert(on),
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
      <label style="font-size: 12px">
        Transition
        <select v-model="trType">
          <option value="crossfade">Crossfade</option>
          <option value="wipe">Wipe</option>
          <option value="luma">Luma</option>
        </select>
      </label>
      <template v-if="trType !== 'crossfade'">
        <label v-if="trType === 'wipe'" style="font-size: 12px">
          Angle
          <input
            v-model.number="trAngleDeg"
            type="number"
            min="0"
            max="360"
            step="1"
            style="width: 64px"
          />
        </label>
        <label style="font-size: 12px">
          Softness
          <input
            v-model.number="trSoftness"
            type="range"
            min="0"
            max="0.5"
            step="0.005"
          />
        </label>
        <label
          v-if="trType === 'luma'"
          style="font-size: 12px; display: flex; gap: 4px; align-items: center"
        >
          <input v-model="trInvert" type="checkbox" /> Invert
        </label>
      </template>
    </div>
  </div>
</template>
