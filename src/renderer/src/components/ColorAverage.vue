<script setup lang="ts">
import { onMounted } from "vue";
import "../../color-average/styles.css";

onMounted(async () => {
  // Dynamically import the module to avoid bundling issues
  const mod = await import("../app/main");
  await mod.initColorAveragingApp();
});
</script>

<template>
  <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 12px">
    <div>
      <div
        class="canvas-stage"
        style="position: relative; width: 100%; height: 480px; background: #111"
      >
        <canvas
          id="background-canvas"
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
          <button id="add-area">Add Area</button>
          <button id="add-strip">Add Strip</button>
          <button id="add-grid">Add Grid</button>
        </div>

        <div>
          <h3 style="margin: 0 0 6px 0">Configuration</h3>
          <div>
            <label for="strip-count">Strip Cells:</label>
            <input id="strip-count" type="number" min="2" max="20" value="3" />
          </div>
          <div>
            <label for="grid-rows">Grid Rows:</label>
            <input id="grid-rows" type="number" min="2" max="10" value="2" />
          </div>
          <div>
            <label for="grid-cols">Grid Columns:</label>
            <input id="grid-cols" type="number" min="2" max="10" value="3" />
          </div>
          <div>
            <label for="samples-per-edge">Samples/edge:</label>
            <input
              id="samples-per-edge"
              type="number"
              min="1"
              max="64"
              value="20"
            />
          </div>
        </div>

        <div>
          <h3 style="margin: 0 0 6px 0">Actions</h3>
          <button id="clear-regions">Clear All</button>
          <button id="toggle-bg">Toggle Background Mode</button>
          <button id="log-debug">Log Debug Info</button>
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
          <tbody id="results-body"></tbody>
        </table>
        <div id="empty-state">
          <p>No regions defined. Add a region to begin color analysis.</p>
        </div>
      </div>

      <dialog id="edit-modal">
        <div>
          <div>
            <h3 id="modal-title">Edit Region</h3>
            <button id="modal-close" aria-label="Close">&times;</button>
          </div>
          <div>
            <div id="modal-controls"></div>
          </div>
          <div>
            <button id="modal-cancel">Cancel</button>
            <button id="modal-save">Save Changes</button>
          </div>
        </div>
      </dialog>
    </div>
  </div>
</template>
