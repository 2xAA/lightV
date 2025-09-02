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

  // Smoothing controls
  _smoothingEnabled: boolean;
  _smoothingDurationMs: number;
  _lastFrameTimeMs: number | null;
  _lastFrameDtMs: number;

  // External compositor hook
  _getCompositor:
    | (() => {
        calculateAverageColors: (
          bounds: { x: number; y: number; width: number; height: number }[],
          samples?: number,
        ) => { r: number; g: number; b: number; hex: string }[];
      } | null)
    | null;
  _samplesPerEdge: number;
  _lockPixelSize: boolean;

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

    // Smoothing defaults
    this._smoothingEnabled = false;
    this._smoothingDurationMs = 250;
    this._lastFrameTimeMs = null;
    this._lastFrameDtMs = 16;

    this._getCompositor = null;
    this._samplesPerEdge = 20;
    this._lockPixelSize = false;
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
        const nowMs = typeof t === "number" ? t : performance.now();
        if (this._lastFrameTimeMs == null) {
          this._lastFrameDtMs = 16;
        } else {
          this._lastFrameDtMs = Math.max(0, nowMs - this._lastFrameTimeMs);
        }
        this._lastFrameTimeMs = nowMs;

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
      // setTimeout(() => {
      //   this.addRegion("area");
      //   this.fabricManager?.refreshCanvas();
      // }, 500);

      console.log("Color Averaging App initialized successfully");
    } catch (error) {
      console.error("Failed to initialize app:", error);
      this.showError(
        "Failed to initialize WebGL. Please ensure your browser supports WebGL.",
      );
    }
  }

  setCompositorGetter(
    getter: () => {
      calculateAverageColors: (
        bounds: { x: number; y: number; width: number; height: number }[],
        samples?: number,
      ) => { r: number; g: number; b: number; hex: string }[];
    } | null,
  ) {
    this._getCompositor = getter;
  }

  setupResizeSync() {
    const stage = this._stageEl;
    const backgroundCanvas = (this.canvas2dSource as any)
      ?.canvas as HTMLCanvasElement;
    if (!stage || !backgroundCanvas) return;

    // Observe container size; queue backstore size from its CSS box times DPR
    const queueFromStage = () => {
      if (this._lockPixelSize) return;
      const rect = stage.getBoundingClientRect();
      // Use CSS pixels; when locked, we preserve explicit target size
      this._pendingPixelW = Math.max(1, Math.floor(rect.width));
      this._pendingPixelH = Math.max(1, Math.floor(rect.height));
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

  // Explicitly set pixel backstore size to align with external target (e.g., compositor canvas)
  setTargetPixelSize(width: number, height: number) {
    this._lockPixelSize = true;
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    const lastW = this._appliedPixelW || w;
    const lastH = this._appliedPixelH || h;
    const sx = lastW > 0 ? w / lastW : 1;
    const sy = lastH > 0 ? h / lastH : 1;
    this.canvas2dSource?.resize(w, h);
    this.webglRenderer?.resize(w, h);
    this.fabricManager?.resize(w, h);
    this.fabricManager?.scaleContent(sx, sy);
    this._appliedPixelW = w;
    this._appliedPixelH = h;
    this._pendingPixelW = w;
    this._pendingPixelH = h;
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
    this._samplesPerEdge = Math.max(1, Math.min(64, Math.floor(n)));
    this.recalculateColors();
  }

  setMode(mode: CanvasMode) {
    this._currentMode = mode;
  }

  setSmoothingEnabled(enabled: boolean) {
    this._smoothingEnabled = !!enabled;
  }

  setSmoothingDurationMs(durationMs: number) {
    const clamped = Math.max(1, Math.min(10000, Math.floor(durationMs)));
    this._smoothingDurationMs = clamped;
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

    const bounds = this.fabricManager?.getRegionBounds(regionId) || [];
    const quads = this.fabricManager?.getRegionQuads(regionId) || [];
    if ((!bounds || bounds.length === 0) && (!quads || quads.length === 0))
      return;

    const method = (region.config && region.config.method) || "average";

    // Prefer compositor if available (single WebGL context)
    const getComp = this._getCompositor;
    let targetColors: any[] | null = null;
    if (getComp) {
      const comp = getComp();
      if (comp && typeof comp.calculateAverageColors === "function") {
        targetColors = comp.calculateAverageColors(
          bounds,
          this._samplesPerEdge,
        ) as any[];
      }
    }

    if (!targetColors) {
      // Fallback to local renderer
      targetColors =
        this.webglRenderer?.calculateColors(bounds, quads, method) || [];
    }

    // Apply per-region smoothing if enabled and lengths match
    const smoothingEnabled = !!(
      region.config && region.config.smoothingEnabled
    );
    const smoothingMs = Math.max(
      0,
      Math.floor(region.config?.smoothingMs ?? 0),
    );
    if (
      smoothingEnabled &&
      Array.isArray(region.colors) &&
      region.colors.length === targetColors.length &&
      smoothingMs > 0
    ) {
      const alpha = 1 - Math.exp(-this._lastFrameDtMs / smoothingMs);
      const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
      const toHex = (n: number) => {
        const v = Math.max(0, Math.min(255, Math.round(n)));
        return v.toString(16).padStart(2, "0");
      };
      const smoothed = targetColors.map((tc, i) => {
        const pc = region.colors[i];
        const r = lerp(pc.r, tc.r, alpha);
        const g = lerp(pc.g, tc.g, alpha);
        const b = lerp(pc.b, tc.b, alpha);
        const rr = Math.round(r);
        const gg = Math.round(g);
        const bb = Math.round(b);
        return {
          r: rr,
          g: gg,
          b: bb,
          hex: `#${toHex(rr)}${toHex(gg)}${toHex(bb)}`,
        };
      });
      region.colors = smoothed;
    } else {
      region.colors = targetColors;
    }

    if (this._events.regionColorsUpdated)
      this._events.regionColorsUpdated(regionId, region.colors);
  }

  recalculateColors() {
    for (const regionId of this.regions.keys()) {
      this.updateRegionColors(regionId);
    }
  }

  applyRegionConfig(regionId: string, updatedConfig: any) {
    const region = this.regions.get(regionId);
    if (!region) return;

    // Merge region configuration
    const prevConfig = { ...region.config };
    const mergedConfig = { ...prevConfig, ...updatedConfig };

    // Determine if structural (geometry-affecting) changes occurred
    let structuralChanged = false;
    if (region.type === "strip") {
      structuralChanged =
        (prevConfig.count ?? 3) !==
        (mergedConfig.count ?? prevConfig.count ?? 3);
    } else if (region.type === "grid") {
      const prevRows = prevConfig.rows ?? 2;
      const prevCols = prevConfig.cols ?? 3;
      const nextRows = mergedConfig.rows ?? prevRows;
      const nextCols = mergedConfig.cols ?? prevCols;
      structuralChanged = prevRows !== nextRows || prevCols !== nextCols;
    } else {
      structuralChanged = false;
    }

    // Apply config
    region.config = mergedConfig;

    if (!structuralChanged) {
      // Only sampling method or smoothing changed: no need to recreate objects
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

export type { ColorAveragingApp };
