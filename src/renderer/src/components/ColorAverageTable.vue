<script setup lang="ts">
import {
  useColorAverageStore,
  type UiRegion,
  type Color,
} from "../stores/colorAverage";

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
</script>

<template>
  <div>
    <r-grid columns="12" gap="12">
      <r-cell span="12">
        <h3 style="margin: 0 0 6px 0">Regions</h3>
      </r-cell>
      <r-cell span="12">
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
                <td class="monospace">{{ configText(region) }}</td>
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
                <td class="monospace">
                  <pre style="margin: 0">{{ rgbText(region.colors) }}</pre>
                </td>
                <td class="monospace">
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
      </r-cell>
    </r-grid>

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
          background: var(--background-color);
          color: var(--foreground-color);
          padding: 16px;
          border-radius: 8px;
          border: 1px solid rgba(var(--foreground-color-rgb), 0.12);
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
          <div class="input-row">
            <label for="modal-smoothing">Smooth colors:</label>
            <input
              id="modal-smoothing"
              v-model="store.editSmoothingEnabled"
              type="checkbox"
            />
          </div>
          <div class="input-row">
            <label for="modal-smoothing-ms">Smoothing time (ms):</label>
            <input
              id="modal-smoothing-ms"
              v-model.number="store.editSmoothingMs"
              type="number"
              min="1"
              max="10000"
            />
          </div>
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
</template>
