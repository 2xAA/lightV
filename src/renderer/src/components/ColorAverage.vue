<script setup lang="ts">
import {
  onMounted,
  onBeforeUnmount,
  reactive,
  ref,
  shallowRef,
  markRaw,
} from "vue";
import type { Region, Bounds, Quad } from "../app/fabric-manager";
import type { CanvasMode } from "../app/canvas2d-source";
import type { FabricManager } from "../app/fabric-manager";
import "../../color-average/styles.css";

type Color = { r: number; g: number; b: number; hex: string };

type RegionConfig = {
  method?: "average" | "mode" | "maxluma";
  count?: number;
  rows?: number;
  cols?: number;
};

type UiRegion = {
  id: string;
  type: string;
  config: RegionConfig;
  colors: Color[];
};

type AppApi = {
  addRegion: (type: string, config?: RegionConfig) => void;
  deleteRegion: (regionId: string) => void;
  clearAllRegions: () => void;
  setSamplesPerEdge: (n: number) => void;
  setMode: (mode: CanvasMode) => void;
  applyRegionConfig: (regionId: string, updated: RegionConfig) => void;
  regions: Map<string, UiRegion>;
  fabricManager: FabricManager | null;
};

const stageRef = ref<HTMLElement | null>(null);
const backgroundCanvasRef = ref<HTMLCanvasElement | null>(null);
const webglCanvasRef = ref<HTMLCanvasElement | null>(null);
const fabricCanvasRef = ref<HTMLCanvasElement | null>(null);

// Store external, non-reactive app instance to avoid Vue wrapping it in Proxy
const appRef = shallowRef<AppApi | null>(null);

// Controls state
const controls = reactive({
  stripCount: 3,
  gridRows: 2,
  gridCols: 3,
  samplesPerEdge: 20,
  mode: "quadrants" as CanvasMode,
});

// Regions state
const regions = ref<UiRegion[]>([]);
const selectedRegionId = ref<string | null>(null);
const highlightedRowId = ref<string | null>(null);

// Edit modal state
const isEditOpen = ref(false);
const editRegion = ref<UiRegion | null>(null);
const editMethod = ref<NonNullable<RegionConfig["method"]>>("average");
const editStripCount = ref(3);
const editGridRows = ref(2);
const editGridCols = ref(3);

function openEditModal(region: UiRegion): void {
  editRegion.value = region;
  const method = (region.config && region.config.method) || "average";
  editMethod.value = method as NonNullable<RegionConfig["method"]>;
  if (region.type === "strip") {
    editStripCount.value = region.config.count || controls.stripCount;
  }
  if (region.type === "grid") {
    editGridRows.value = region.config.rows || controls.gridRows;
    editGridCols.value = region.config.cols || controls.gridCols;
  }
  isEditOpen.value = true;
}

function closeEditModal(): void {
  isEditOpen.value = false;
  editRegion.value = null;
}

function saveEditChanges(): void {
  if (!appRef.value || !editRegion.value) return;
  const region = editRegion.value;
  const updated: RegionConfig = { method: editMethod.value };
  if (region.type === "strip") {
    updated.count = Math.max(2, Math.min(20, Math.floor(editStripCount.value)));
  } else if (region.type === "grid") {
    updated.rows = Math.max(2, Math.min(10, Math.floor(editGridRows.value)));
    updated.cols = Math.max(2, Math.min(10, Math.floor(editGridCols.value)));
  }
  appRef.value.applyRegionConfig(region.id, updated);
  isEditOpen.value = false;
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

// Actions
function addArea(): void {
  appRef.value?.addRegion("area");
}
function addStrip(): void {
  appRef.value?.addRegion("strip", { count: controls.stripCount });
}
function addGrid(): void {
  appRef.value?.addRegion("grid", {
    rows: controls.gridRows,
    cols: controls.gridCols,
  });
}
function clearAll(): void {
  appRef.value?.clearAllRegions();
  regions.value = [];
}
function toggleMode(): void {
  const modes: CanvasMode[] = ["quadrants", "gradient", "diagonal", "syphon"];
  const idx = modes.indexOf(controls.mode);
  controls.mode = modes[(idx + 1) % modes.length];
  appRef.value?.setMode(controls.mode);
}
function onSamplesChange(): void {
  appRef.value?.setSamplesPerEdge(controls.samplesPerEdge);
}
function onLogDebug(): void {
  console.group("Sampling Debug Info");
  const canvas = webglCanvasRef.value as HTMLCanvasElement | null;
  if (canvas) {
    console.log("WebGL canvas size:", canvas.width, canvas.height);
  }
  const app = appRef.value;
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
  const mod = await import("../app/main");
  const app = await mod.initColorAveragingApp({
    elements: {
      stage: stageRef.value as HTMLElement,
      backgroundCanvas: backgroundCanvasRef.value as HTMLCanvasElement,
      webglCanvas: webglCanvasRef.value as HTMLCanvasElement,
      fabricCanvas: fabricCanvasRef.value as HTMLCanvasElement,
    },
    on: {
      regionAdded: (region: Region) => {
        const ui: UiRegion = {
          id: region.id,
          type: region.type,
          config: region.config as RegionConfig,
          colors: region.colors as Color[],
        };
        regions.value = [...regions.value, ui];
      },
      regionUpdated: (region: Region) => {
        const ui: UiRegion = {
          id: region.id,
          type: region.type,
          config: region.config as RegionConfig,
          colors: region.colors as Color[],
        };
        regions.value = regions.value.map((r) => (r.id === region.id ? ui : r));
      },
      regionColorsUpdated: (regionId: string, colors: Color[]) => {
        regions.value = regions.value.map((r) =>
          r.id === regionId ? { ...r, colors } : r,
        );
      },
      regionRemoved: (regionId: string) => {
        regions.value = regions.value.filter((r) => r.id !== regionId);
      },
      regionSelected: (regionId: string) => {
        selectedRegionId.value = regionId;
        highlightedRowId.value = regionId;
        setTimeout(() => {
          if (highlightedRowId.value === regionId)
            highlightedRowId.value = null;
        }, 2000);
      },
      error: (message: string) => {
        console.error(message);
      },
    },
  });
  // Mark the external object as raw so Vue won't proxy internal Fabric.js references
  appRef.value = markRaw(app as unknown as AppApi);
  // initialize samples
  appRef.value.setSamplesPerEdge(controls.samplesPerEdge);
});

onBeforeUnmount(() => {
  appRef.value = null;
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
          <button @click="addArea">Add Area</button>
          <button @click="addStrip">Add Strip</button>
          <button @click="addGrid">Add Grid</button>
        </div>

        <div>
          <h3 style="margin: 0 0 6px 0">Configuration</h3>
          <div>
            <label for="strip-count">Strip Cells:</label>
            <input
              id="strip-count"
              v-model.number="controls.stripCount"
              type="number"
              min="2"
              max="20"
            />
          </div>
          <div>
            <label for="grid-rows">Grid Rows:</label>
            <input
              id="grid-rows"
              v-model.number="controls.gridRows"
              type="number"
              min="2"
              max="10"
            />
          </div>
          <div>
            <label for="grid-cols">Grid Columns:</label>
            <input
              id="grid-cols"
              v-model.number="controls.gridCols"
              type="number"
              min="2"
              max="10"
            />
          </div>
          <div>
            <label for="samples-per-edge">Samples/edge:</label>
            <input
              id="samples-per-edge"
              v-model.number="controls.samplesPerEdge"
              type="number"
              min="1"
              max="64"
              @change="onSamplesChange"
            />
          </div>
        </div>

        <div>
          <h3 style="margin: 0 0 6px 0">Actions</h3>
          <button @click="clearAll">Clear All</button>
          <button @click="toggleMode">Toggle Background Mode</button>
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
              v-for="region in regions"
              :key="region.id"
              :class="{ highlighted: highlightedRowId === region.id }"
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
                  @click="appRef?.deleteRegion(region.id)"
                >
                  Delete
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-show="regions.length === 0" id="empty-state">
          <p>No regions defined. Add a region to begin color analysis.</p>
        </div>
      </div>

      <!-- Simple Vue modal -->
      <div
        v-if="isEditOpen"
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
                editRegion
                  ? editRegion.type[0].toUpperCase() + editRegion.type.slice(1)
                  : ""
              }}
              Region
            </h3>
            <button aria-label="Close" @click="closeEditModal">&times;</button>
          </div>
          <div style="display: grid; gap: 8px">
            <div class="input-row">
              <label for="modal-method">Sampling:</label>
              <select id="modal-method" v-model="editMethod">
                <option value="average">Average</option>
                <option value="mode">Mode (dominant)</option>
                <option value="maxluma">Max luminance</option>
              </select>
            </div>
            <div v-if="editRegion?.type === 'strip'" class="input-row">
              <label for="modal-strip-count">Number of Cells:</label>
              <input
                id="modal-strip-count"
                v-model.number="editStripCount"
                type="number"
                min="2"
                max="20"
              />
            </div>
            <template v-if="editRegion?.type === 'grid'">
              <div class="input-row">
                <label for="modal-grid-rows">Rows:</label>
                <input
                  id="modal-grid-rows"
                  v-model.number="editGridRows"
                  type="number"
                  min="2"
                  max="10"
                />
              </div>
              <div class="input-row">
                <label for="modal-grid-cols">Columns:</label>
                <input
                  id="modal-grid-cols"
                  v-model.number="editGridCols"
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
