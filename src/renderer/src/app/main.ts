import { WebGLRenderer } from "./webgl-renderer";
import { FabricManager } from "./fabric-manager";
import { Canvas2DSource, type CanvasMode } from "./canvas2d-source";
import { markRaw } from "vue";
import { Region } from "./fabric-manager";

class ColorAveragingApp {
  webglRenderer: WebGLRenderer | null;
  fabricManager: FabricManager | null;
  regions: Map<string, any>;
  nextRegionId: number;
  canvas2dSource: Canvas2DSource | null;
  _raf: number | null;
  _showTestPattern: boolean;
  _currentMode: CanvasMode;
  _resizeObserver: ResizeObserver | null;
  _lastSizeW: number;
  _lastSizeH: number;
  _sameSizeFrames: number;
  _minStableFrames: number;
  _pendingPixelW: number | null;
  _pendingPixelH: number | null;
  _appliedPixelW: number | null;
  _appliedPixelH: number | null;

  _events: {
    regionAdded?: (region: Region) => void;
    regionUpdated?: (region: Region) => void;
    regionColorsUpdated?: (regionId: string, colors: any[]) => void;
    regionRemoved?: (regionId: string) => void;
    regionSelected?: (regionId: string) => void;
    error?: (message: string) => void;
  };
  _stageEl: HTMLElement | null;

  constructor() {
    this.webglRenderer = null;
    this.fabricManager = null;
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

    this._events = {};
    this._stageEl = null;
  }

  async init(options?: {
    elements: {
      stage: HTMLElement;
      backgroundCanvas: HTMLCanvasElement;
      webglCanvas: HTMLCanvasElement;
      fabricCanvas: HTMLCanvasElement;
    };
    on?: ColorAveragingApp["_events"];
  }) {
    try {
      if (options?.on) {
        this._events = { ...options.on };
      }

      const backgroundCanvas = options?.elements.backgroundCanvas;
      const webglCanvas = options?.elements.webglCanvas;
      const fabricCanvas = options?.elements.fabricCanvas;
      const stage = options?.elements.stage;

      if (!backgroundCanvas || !webglCanvas || !fabricCanvas || !stage) {
        throw new Error("Missing required elements for initialization");
      }

      this._stageEl = stage as HTMLElement;

      // Initialize source background canvas2d
      this.canvas2dSource = new Canvas2DSource(
        backgroundCanvas as HTMLCanvasElement,
      );

      // Initialize WebGL renderer
      this.webglRenderer = new WebGLRenderer(webglCanvas);
      await this.webglRenderer.init();

      // Initialize Fabric.js manager (mark as raw to bypass Vue reactivity)
      this.fabricManager = markRaw(new FabricManager(fabricCanvas));
      this.fabricManager.init();

      // Fabric events
      this.wireFabricEvents();

      // Ensure Fabric.js is ready for interaction
      this.fabricManager.enableSelection();

      // Install responsive resize sync
      this.setupResizeSync();

      // Animation loop
      const loop = (t) => {
        const w = backgroundCanvas?.width ?? 0;
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

          this.canvas2dSource?.resize(pw, ph);
          this.webglRenderer?.resize(pw, ph);
          this.fabricManager?.resize(pw, ph);
          this.fabricManager?.scaleContent(sx, sy);
          this._appliedPixelW = pw;
          this._appliedPixelH = ph;
        }

        if (sizeStable) {
          this.canvas2dSource?.setMode(this._currentMode as CanvasMode);
          this.canvas2dSource?.tick(t);
          this.webglRenderer?.updateFromCanvas(backgroundCanvas);
          this.webglRenderer?.renderSource();
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
        this.fabricManager?.refreshCanvas();
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
    const stage = this._stageEl;
    const backgroundCanvas = (this.canvas2dSource as any)
      ?.canvas as HTMLCanvasElement;
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
    let rafId: number | null = null;
    const onWindowResize = () => {
      if (rafId != null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        queueFromStage();
      });
    };
    window.addEventListener("resize", onWindowResize);
  }

  wireFabricEvents() {
    // Fabric.js events
    if (this.fabricManager) {
      this.fabricManager.onRegionModified = (regionId) => {
        this.updateRegionColors(regionId);
      };

      this.fabricManager.onRegionSelected = (regionId) => {
        if (this._events.regionSelected) this._events.regionSelected(regionId);
      };
    }
  }

  // UI no longer wired via DOM; Vue will call these methods

  setSamplesPerEdge(n: number) {
    this.webglRenderer?.setSamplesPerEdge(n);
    this.recalculateColors();
  }

  setMode(mode: CanvasMode) {
    this._currentMode = mode;
  }

  addRegion(type, config = {}) {
    const regionId = `region_${this.nextRegionId++}`;

    const region = {
      id: regionId,
      type,
      config: { method: "average", ...config },
      colors: [],
      fabricObjects: [],
    } as Region;

    // Create Fabric.js objects for the region
    const fabricObjects = this.fabricManager?.createRegion(
      regionId,
      type,
      config,
    );
    region.fabricObjects = fabricObjects || [];

    // Store region
    this.regions.set(regionId, region);

    // Calculate initial colors
    this.updateRegionColors(regionId);

    // Notify UI
    if (this._events.regionAdded) this._events.regionAdded(region);
  }

  deleteRegion(regionId) {
    const region = this.regions.get(regionId);
    if (!region) return;

    // Remove Fabric.js objects
    this.fabricManager?.removeRegion(regionId);

    // Remove from regions map
    this.regions.delete(regionId);

    // Notify UI
    if (this._events.regionRemoved) this._events.regionRemoved(regionId);
  }

  clearAllRegions() {
    for (const regionId of this.regions.keys()) {
      this.fabricManager?.removeRegion(regionId);
    }
    this.regions.clear();
    // Vue will react to empty list
  }

  updateRegionColors(regionId) {
    const region = this.regions.get(regionId);
    if (!region) return;

    const bounds = this.fabricManager?.getRegionBounds(regionId);
    const quads = this.fabricManager?.getRegionQuads(regionId);
    if ((!bounds || bounds.length === 0) && (!quads || quads.length === 0))
      return;

    const method = (region.config && region.config.method) || "average";
    const colors =
      this.webglRenderer?.calculateColors(bounds, quads, method) || [];
    region.colors = colors;

    if (this._events.regionColorsUpdated)
      this._events.regionColorsUpdated(regionId, colors);
  }

  recalculateColors() {
    for (const regionId of this.regions.keys()) {
      this.updateRegionColors(regionId);
    }
  }

  applyRegionConfig(regionId: string, updatedConfig: any) {
    const region = this.regions.get(regionId);
    if (!region) return;

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
      if (this._events.regionUpdated) this._events.regionUpdated(region);
      return;
    }

    // Snapshot transform before recreation
    const snapshot = this.fabricManager?.getRegionSnapshot(regionId);

    // Recreate Fabric.js objects with new configuration
    this.fabricManager?.removeRegion(regionId);
    const fabricObjects = this.fabricManager?.createRegion(
      regionId,
      region.type,
      region.config,
    );
    region.fabricObjects = fabricObjects;

    // Reapply transform to new root object
    this.fabricManager?.applyRegionSnapshot(regionId, snapshot, true);

    // Recalculate colors
    this.updateRegionColors(regionId);

    // Notify UI
    if (this._events.regionUpdated) this._events.regionUpdated(region);
  }

  showError(message) {
    if (this._events.error) {
      this._events.error(message);
    } else {
      console.error(message);
    }
  }
}

export async function initColorAveragingApp(options?: {
  elements: {
    stage: HTMLElement;
    backgroundCanvas: HTMLCanvasElement;
    webglCanvas: HTMLCanvasElement;
    fabricCanvas: HTMLCanvasElement;
  };
  on?: ColorAveragingApp["_events"];
}) {
  const app = new ColorAveragingApp();
  await app.init(options as any);
  // Expose app instance for debugging
  // @ts-ignore
  window.colorApp = app;
  return app;
}
