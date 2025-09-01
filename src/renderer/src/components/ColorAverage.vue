<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";
import type { Bounds, Quad } from "../app/fabric-manager";
import {
  useColorAverageStore,
  type UiRegion,
  type Color,
} from "../stores/colorAverage";
import "../../../styles.css";

const stageRef = ref<HTMLElement | null>(null);
const backgroundCanvasRef = ref<HTMLCanvasElement | null>(null);
const webglCanvasRef = ref<HTMLCanvasElement | null>(null);
const fabricCanvasRef = ref<HTMLCanvasElement | null>(null);

const store = useColorAverageStore();

function openEditModal(region: UiRegion): void {
  store.openEditModal(region);
}

function closeEditModal(): void {
  store.closeEditModal();
}

function saveEditChanges(): void {
  store.saveEditChanges();
}

// Helpers for UI formatting
function configText(region: UiRegion): string {
  const method = (region.config && region.config.method) || "average";
  const methodLabel =
    method === "mode" ? "Mode" : method === "maxluma" ? "Max Luma" : "Average";
  switch (region.type) {
    case "area":
      return `1×1 • ${methodLabel}`;
    case "strip":
      return `1×${region.config.count || 3} • ${methodLabel}`;
    case "grid":
      return `${region.config.rows || 2}×${region.config.cols || 3} • ${methodLabel}`;
    default:
      return methodLabel;
  }
}

function rgbText(colors: Color[]): string {
  if (!colors || colors.length === 0) return "-";
  return colors
    .map(
      (c) =>
        `rgb(${String(c.r).padStart(3, "0")}, ${String(c.g).padStart(3, "0")}, ${String(c.b).padStart(3, "0")})`,
    )
    .join("\n");
}

function hexText(colors: Color[]): string {
  if (!colors || colors.length === 0) return "-";
  return colors.map((c) => c.hex).join("\n");
}

function onSamplesChange(): void {
  store.setSamplesPerEdge();
}

function onLogDebug(): void {
  console.group("Sampling Debug Info");
  const canvas = webglCanvasRef.value as HTMLCanvasElement | null;
  if (canvas) {
    console.log("WebGL canvas size:", canvas.width, canvas.height);
  }
  const app = store.getApp();
  if (app) {
    for (const [regionId] of app.regions.entries()) {
      const bounds: Bounds[] =
        app.fabricManager?.getRegionBounds(regionId) || [];
      const quads: Quad[] = app.fabricManager?.getRegionQuads(regionId) || [];
      console.group(`Region ${regionId}`);
      console.table(
        bounds.map((b, i: number) => ({
          i,
          x: b.x,
          y: b.y,
          w: b.width,
          h: b.height,
        })),
      );
      console.table(
        quads.map((q, i: number) => ({
          i,
          p0: `${q.p0.x.toFixed(1)},${q.p0.y.toFixed(1)}`,
          u: `${q.u.x.toFixed(1)},${q.u.y.toFixed(1)}`,
          v: `${q.v.x.toFixed(1)},${q.v.y.toFixed(1)}`,
        })),
      );
      console.groupEnd();
    }
  }
  console.groupEnd();
}

onMounted(async () => {
  await store.init({
    stage: stageRef.value as HTMLElement,
    backgroundCanvas: backgroundCanvasRef.value as HTMLCanvasElement,
    webglCanvas: webglCanvasRef.value as HTMLCanvasElement,
    fabricCanvas: fabricCanvasRef.value as HTMLCanvasElement,
  });
});

onBeforeUnmount(() => {
  store.resetApp();
});
</script>

<template>
  <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 12px">
    <div>
      <div
        ref="stageRef"
        class="canvas-stage"
        style="position: relative; width: 100%; height: 480px; background: #111"
      >
        <canvas
          id="background-canvas"
          ref="backgroundCanvasRef"
          width="800"
          height="400"
          style="
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
          "
        ></canvas>
        <canvas
          id="webgl-canvas"
          ref="webglCanvasRef"
          width="800"
          height="400"
          style="
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
          "
        ></canvas>
        <canvas
          id="fabric-canvas"
          ref="fabricCanvasRef"
          width="800"
          height="400"
          style="position: absolute; inset: 0; width: 100%; height: 100%"
        ></canvas>
      </div>

      <div
        style="
          margin-top: 12px;
          display: flex;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
        "
      >
        <div>
          <h3 style="margin: 0 0 6px 0">Add Region</h3>
          <button @click="store.addArea">Add Area</button>
          <button @click="store.addStrip">Add Strip</button>
          <button @click="store.addGrid">Add Grid</button>
        </div>

        <div>
          <h3 style="margin: 0 0 6px 0">Configuration</h3>
          <div>
            <label for="strip-count">Strip Cells:</label>
            <input
              id="strip-count"
              v-model.number="store.controls.stripCount"
              type="number"
              min="2"
              max="20"
            />
          </div>
          <div>
            <label for="grid-rows">Grid Rows:</label>
            <input
              id="grid-rows"
              v-model.number="store.controls.gridRows"
              type="number"
              min="2"
              max="10"
            />
          </div>
          <div>
            <label for="grid-cols">Grid Columns:</label>
            <input
              id="grid-cols"
              v-model.number="store.controls.gridCols"
              type="number"
              min="2"
              max="10"
            />
          </div>
          <div>
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
        </div>

        <div>
          <h3 style="margin: 0 0 6px 0">Actions</h3>
          <button @click="store.clearAll">Clear All</button>
          <button @click="store.toggleMode">Toggle Background Mode</button>
          <button @click="onLogDebug">Log Debug Info</button>
        </div>
      </div>
    </div>

    <div>
      <h3 style="margin: 0 0 6px 0">Regions</h3>
      <div id="results-table-container">
        <table
          id="results-table"
          style="width: 100%; border-collapse: collapse"
        >
          <thead>
            <tr>
              <th>Region</th>
              <th>Type</th>
              <th>Config</th>
              <th>Color</th>
              <th>RGB</th>
              <th>Hex</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="region in store.regions"
              :key="region.id"
              :class="{ highlighted: store.highlightedRowId === region.id }"
            >
              <td class="region-id">{{ region.id }}</td>
              <td class="region-type">
                {{ region.type[0].toUpperCase() + region.type.slice(1) }}
              </td>
              <td class="config-text">{{ configText(region) }}</td>
              <td class="color-cells">
                <template v-if="region.colors && region.colors.length">
                  <span
                    v-for="(c, i) in region.colors"
                    :key="i"
                    class="color-swatch"
                    :style="{ background: `rgb(${c.r}, ${c.g}, ${c.b})` }"
                  />
                </template>
                <template v-else>
                  <span class="color-swatch" style="background: #333" />
                </template>
              </td>
              <td class="rgb-values">
                <pre style="margin: 0">{{ rgbText(region.colors) }}</pre>
              </td>
              <td class="hex-values">
                <pre style="margin: 0">{{ hexText(region.colors) }}</pre>
              </td>
              <td class="action-buttons">
                <button
                  class="btn btn-small btn-secondary"
                  @click="openEditModal(region)"
                >
                  Edit
                </button>
                <button
                  class="btn btn-small btn-danger"
                  @click="store.deleteRegion(region.id)"
                >
                  Delete
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-show="store.regions.length === 0" id="empty-state">
          <p>No regions defined. Add a region to begin color analysis.</p>
        </div>
      </div>

      <!-- Simple Vue modal -->
      <div
        v-if="store.isEditOpen"
        style="
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          display: grid;
          place-items: center;
          z-index: 1000;
        "
      >
        <div
          style="
            background: white;
            color: black;
            padding: 16px;
            border-radius: 8px;
            min-width: 320px;
          "
        >
          <div
            style="
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 12px;
              margin-bottom: 12px;
            "
          >
            <h3 style="margin: 0">
              Edit
              {{
                store.editRegion
                  ? store.editRegion.type[0].toUpperCase() +
                    store.editRegion.type.slice(1)
                  : ""
              }}
              Region
            </h3>
            <button aria-label="Close" @click="closeEditModal">&times;</button>
          </div>
          <div style="display: grid; gap: 8px">
            <div class="input-row">
              <label for="modal-method">Sampling:</label>
              <select id="modal-method" v-model="store.editMethod">
                <option value="average">Average</option>
                <option value="mode">Mode (dominant)</option>
                <option value="maxluma">Max luminance</option>
              </select>
            </div>
            <div v-if="store.editRegion?.type === 'strip'" class="input-row">
              <label for="modal-strip-count">Number of Cells:</label>
              <input
                id="modal-strip-count"
                v-model.number="store.editStripCount"
                type="number"
                min="2"
                max="20"
              />
            </div>
            <template v-if="store.editRegion?.type === 'grid'">
              <div class="input-row">
                <label for="modal-grid-rows">Rows:</label>
                <input
                  id="modal-grid-rows"
                  v-model.number="store.editGridRows"
                  type="number"
                  min="2"
                  max="10"
                />
              </div>
              <div class="input-row">
                <label for="modal-grid-cols">Columns:</label>
                <input
                  id="modal-grid-cols"
                  v-model.number="store.editGridCols"
                  type="number"
                  min="2"
                  max="10"
                />
              </div>
            </template>
          </div>
          <div
            style="
              display: flex;
              justify-content: flex-end;
              gap: 8px;
              margin-top: 12px;
            "
          >
            <button @click="closeEditModal">Cancel</button>
            <button @click="saveEditChanges">Save Changes</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
