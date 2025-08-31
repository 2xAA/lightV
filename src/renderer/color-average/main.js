/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { WebGLRenderer } from "./webgl-renderer.js";
import { FabricManager } from "./fabric-manager.js";
import { UIController } from "./ui-controller.js";
import { Canvas2DSource } from "./canvas2d-source.js";

class ColorAveragingApp {
  constructor() {
    this.webglRenderer = null;
    this.fabricManager = null;
    this.uiController = null;
    this.regions = new Map();
    this.nextRegionId = 1;
    this.canvas2dSource = null;
    this._raf = null;
    this._showTestPattern = true;
    this._currentMode = "quadrants"; // Added for mode cycling
    this._resizeObserver = null;
    this._lastSizeW = 0;
    this._lastSizeH = 0;
    this._sameSizeFrames = 0;
    this._minStableFrames = 1; // require two frames same size
    this._pendingPixelW = null;
    this._pendingPixelH = null;
    this._appliedPixelW = null;
    this._appliedPixelH = null;
  }

  async init() {
    try {
      // Initialize source background canvas2d
      const backgroundCanvas = document.getElementById("background-canvas");
      this.canvas2dSource = new Canvas2DSource(backgroundCanvas);

      // Initialize WebGL renderer
      const webglCanvas = document.getElementById("webgl-canvas");
      this.webglRenderer = new WebGLRenderer(webglCanvas);
      await this.webglRenderer.init();

      // Initialize Fabric.js manager
      const fabricCanvas = document.getElementById("fabric-canvas");
      this.fabricManager = new FabricManager(fabricCanvas);
      this.fabricManager.init();

      // Initialize UI controller
      this.uiController = new UIController();
      this.uiController.init();

      // Set up event listeners
      this.setupEventListeners();

      // Ensure Fabric.js is ready for interaction
      this.fabricManager.enableSelection();

      // Install responsive resize sync
      this.setupResizeSync();

      // Animation loop
      const loop = (t) => {
        const w = backgroundCanvas.width;
        const h = backgroundCanvas.height;
        if (w === this._lastSizeW && h === this._lastSizeH) {
          this._sameSizeFrames++;
        } else {
          this._lastSizeW = w;
          this._lastSizeH = h;
          this._sameSizeFrames = 0;
        }
        const sizeStable = this._sameSizeFrames >= this._minStableFrames;

        // Apply any pending backstore resize only when size is stable
        if (
          sizeStable &&
          this._pendingPixelW != null &&
          this._pendingPixelH != null &&
          (this._appliedPixelW !== this._pendingPixelW ||
            this._appliedPixelH !== this._pendingPixelH)
        ) {
          const pw = this._pendingPixelW;
          const ph = this._pendingPixelH;
          // Compute scale relative to last applied size to keep regions in relative positions
          const lastW = this._appliedPixelW || pw;
          const lastH = this._appliedPixelH || ph;
          const sx = lastW > 0 ? pw / lastW : 1;
          const sy = lastH > 0 ? ph / lastH : 1;

          this.canvas2dSource.resize(pw, ph);
          this.webglRenderer.resize(pw, ph);
          this.fabricManager.resize(pw, ph);
          this.fabricManager.scaleContent(sx, sy);
          this._appliedPixelW = pw;
          this._appliedPixelH = ph;
        }

        if (sizeStable) {
          this.canvas2dSource.setMode(this._currentMode || "quadrants");
          this.canvas2dSource.tick(t);
          this.webglRenderer.updateFromCanvas(backgroundCanvas);
          this.webglRenderer.renderSource();
          if (this.regions && this.regions.size > 0) {
            this.recalculateColors();
          }
        }

        this._raf = requestAnimationFrame(loop);
      };
      this._raf = requestAnimationFrame(loop);

      // Add a default region to demonstrate functionality
      setTimeout(() => {
        this.addRegion("area");
        this.fabricManager.refreshCanvas();
      }, 500);

      console.log("Color Averaging App initialized successfully");
    } catch (error) {
      console.error("Failed to initialize app:", error);
      this.showError(
        "Failed to initialize WebGL. Please ensure your browser supports WebGL.",
      );
    }
  }

  setupResizeSync() {
    const stage = document.querySelector(".canvas-stage");
    const backgroundCanvas = document.getElementById("background-canvas");
    if (!stage || !backgroundCanvas) return;

    // Observe container size; queue backstore size from its CSS box times DPR
    const queueFromStage = () => {
      const rect = stage.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this._pendingPixelW = Math.max(1, Math.floor(rect.width * dpr));
      this._pendingPixelH = Math.max(1, Math.floor(rect.height * dpr));
    };

    queueFromStage();

    // ResizeObserver for layout-driven changes
    this._resizeObserver = new ResizeObserver(() => {
      queueFromStage();
    });
    this._resizeObserver.observe(stage);

    // Handle DPR changes
    let rafId = null;
    const onWindowResize = () => {
      if (rafId != null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        queueFromStage();
      });
    };
    window.addEventListener("resize", onWindowResize);
  }

  setupEventListeners() {
    // Region creation buttons
    document.getElementById("add-area").addEventListener("click", () => {
      this.addRegion("area");
    });

    document.getElementById("add-strip").addEventListener("click", () => {
      const count = parseInt(document.getElementById("strip-count").value);
      this.addRegion("strip", { count });
    });

    document.getElementById("add-grid").addEventListener("click", () => {
      const rows = parseInt(document.getElementById("grid-rows").value);
      const cols = parseInt(document.getElementById("grid-cols").value);
      this.addRegion("grid", { rows, cols });
    });

    // Control buttons
    document.getElementById("clear-regions").addEventListener("click", () => {
      this.clearAllRegions();
    });

    const toggle = document.getElementById("toggle-bg");
    if (toggle) {
      const modes = ["quadrants", "gradient", "diagonal", "syphon"];
      this._currentMode = modes[0];
      toggle.addEventListener("click", () => {
        const idx = modes.indexOf(this._currentMode);
        this._currentMode = modes[(idx + 1) % modes.length];
      });
    }

    const samplesInput = document.getElementById("samples-per-edge");
    if (samplesInput) {
      samplesInput.addEventListener("change", () => {
        const n = parseInt(samplesInput.value);
        this.webglRenderer.setSamplesPerEdge(n);
        this.recalculateColors();
      });
      // initialize from default value
      this.webglRenderer.setSamplesPerEdge(parseInt(samplesInput.value));
    }

    const logDebug = document.getElementById("log-debug");
    if (logDebug) {
      logDebug.addEventListener("click", () => {
        console.group("Sampling Debug Info");
        const canvas = document.getElementById("webgl-canvas");
        console.log("WebGL canvas size:", canvas.width, canvas.height);
        for (const [regionId] of this.regions.entries()) {
          const bounds = this.fabricManager.getRegionBounds(regionId) || [];
          const quads = (
            this.fabricManager.getRegionQuads(regionId) || []
          ).filter((q) => q && q.p0 && q.u && q.v);
          console.group(`Region ${regionId}`);
          console.table(
            bounds.map((b, i) => ({
              i,
              x: b.x,
              y: b.y,
              w: b.width,
              h: b.height,
            })),
          );
          console.table(
            quads.map((q, i) => ({
              i,
              p0: `${q.p0.x.toFixed(1)},${q.p0.y.toFixed(1)}`,
              u: `${q.u.x.toFixed(1)},${q.u.y.toFixed(1)}`,
              v: `${q.v.x.toFixed(1)},${q.v.y.toFixed(1)}`,
            })),
          );
          console.groupEnd();
        }
        console.groupEnd();
      });
    }

    // Fabric.js events
    this.fabricManager.onRegionModified = (regionId) => {
      this.updateRegionColors(regionId);
    };

    this.fabricManager.onRegionSelected = (regionId) => {
      this.uiController.highlightRow(regionId);
    };

    // UI events
    this.uiController.onRegionEdit = (regionId) => {
      this.editRegion(regionId);
    };

    this.uiController.onRegionDelete = (regionId) => {
      this.deleteRegion(regionId);
    };
  }

  addRegion(type, config = {}) {
    const regionId = `region_${this.nextRegionId++}`;

    const region = {
      id: regionId,
      type,
      config: { method: "average", ...config },
      colors: [],
      fabricObjects: [],
    };

    // Create Fabric.js objects for the region
    const fabricObjects = this.fabricManager.createRegion(
      regionId,
      type,
      config,
    );
    region.fabricObjects = fabricObjects;

    // Store region
    this.regions.set(regionId, region);

    // Calculate initial colors
    this.updateRegionColors(regionId);

    // Update UI
    this.uiController.addRegionRow(region);
  }

  deleteRegion(regionId) {
    const region = this.regions.get(regionId);
    if (!region) return;

    // Remove Fabric.js objects
    this.fabricManager.removeRegion(regionId);

    // Remove from regions map
    this.regions.delete(regionId);

    // Update UI
    this.uiController.removeRegionRow(regionId);
  }

  clearAllRegions() {
    for (const regionId of this.regions.keys()) {
      this.fabricManager.removeRegion(regionId);
    }
    this.regions.clear();
    this.uiController.clearResults();
  }

  updateRegionColors(regionId) {
    const region = this.regions.get(regionId);
    if (!region) return;

    const bounds = this.fabricManager.getRegionBounds(regionId);
    const quads = this.fabricManager.getRegionQuads(regionId);
    if ((!bounds || bounds.length === 0) && (!quads || quads.length === 0))
      return;

    const method = (region.config && region.config.method) || "average";
    const colors = this.webglRenderer.calculateColors(bounds, quads, method);
    region.colors = colors;

    this.uiController.updateRegionColors(regionId, colors);
  }

  recalculateColors() {
    for (const regionId of this.regions.keys()) {
      this.updateRegionColors(regionId);
    }
  }

  editRegion(regionId) {
    const region = this.regions.get(regionId);
    if (!region) return;

    this.uiController.showEditModal(region, (updatedConfig) => {
      // Update region configuration
      const prevConfig = { ...region.config };
      region.config = { ...updatedConfig };

      // If this is an 'area' and only the sampling method changed, avoid recreating to preserve transform
      const onlyMethodChanged =
        region.type === "area" &&
        Object.keys({ ...prevConfig, method: undefined }).length === 0 &&
        Object.keys({ ...updatedConfig, method: undefined }).length === 0 &&
        prevConfig.method !== updatedConfig.method;
      if (onlyMethodChanged) {
        this.updateRegionColors(regionId);
        this.uiController.updateRegionRow(region);
        return;
      }

      // Snapshot transform before recreation
      const snapshot = this.fabricManager.getRegionSnapshot(regionId);

      // Recreate Fabric.js objects with new configuration
      this.fabricManager.removeRegion(regionId);
      const fabricObjects = this.fabricManager.createRegion(
        regionId,
        region.type,
        region.config,
      );
      region.fabricObjects = fabricObjects;

      // Reapply transform to new root object
      this.fabricManager.applyRegionSnapshot(regionId, snapshot, true);

      // Recalculate colors
      this.updateRegionColors(regionId);

      // Update UI
      this.uiController.updateRegionRow(region);
    });
  }

  showError(message) {
    const errorDiv = document.createElement("div");
    errorDiv.className = "error-message";
    errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #ef4444;
            color: white;
            padding: 16px;
            border-radius: 8px;
            z-index: 1001;
            max-width: 400px;
        `;
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);

    setTimeout(() => {
      errorDiv.remove();
    }, 5000);
  }
}

export async function initColorAveragingApp() {
  const app = new ColorAveragingApp();
  await app.init();
  // Expose app instance for debugging
  window.colorApp = app;
  return app;
}
