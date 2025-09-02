<script setup lang="ts">
import { useColorAverageStore } from "../stores/colorAverage";

const store = useColorAverageStore();

function onSamplesChange(): void {
  store.setSamplesPerEdge();
}

function onLogDebug(): void {
  // Basic debug hook; relies on shared store/app
  console.log("Regions:", store.regions.length);
}
</script>

<template>
  <r-grid columns="12" gap="12">
    <r-cell span="4" sm="12">
      <div>
        <h3 style="margin: 0 0 6px 0">Add Region</h3>
        <button @click="store.addArea">Add Area</button>
        <button @click="store.addStrip">Add Strip</button>
        <button @click="store.addGrid">Add Grid</button>
      </div>
    </r-cell>
    <r-cell span="8" sm="12">
      <div>
        <h3 style="margin: 0 0 6px 0">Configuration</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px">
          <label for="strip-count">Strip Cells:</label>
          <input
            id="strip-count"
            v-model.number="store.controls.stripCount"
            type="number"
            min="2"
            max="20"
          />
          <label for="grid-rows">Grid Rows:</label>
          <input
            id="grid-rows"
            v-model.number="store.controls.gridRows"
            type="number"
            min="2"
            max="10"
          />
          <label for="grid-cols">Grid Columns:</label>
          <input
            id="grid-cols"
            v-model.number="store.controls.gridCols"
            type="number"
            min="2"
            max="10"
          />
          <label for="samples-per-edge">Samples/edge:</label>
          <input
            id="samples-per-edge"
            v-model.number="store.controls.samplesPerEdge"
            type="number"
            min="1"
            max="64"
            @change="onSamplesChange"
          />
        </div>
        <div style="margin-top: 8px">
          <button @click="onLogDebug">Log Debug Info</button>
        </div>
      </div>
    </r-cell>
  </r-grid>
</template>
