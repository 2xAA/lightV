import * as fabric from "fabric";

export type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Quad = {
  p0: { x: number; y: number };
  u: { x: number; y: number };
  v: { x: number; y: number };
};

export type Region = {
  id: string;
  type: string;
  config: any;
  colors: any[];
  fabricObjects: fabric.Object[];
};

export class FabricManager {
  canvasElement: any;
  fabric: fabric.Canvas;
  regions: Map<any, any>;
  onRegionModified: (regionId: string) => void;
  onRegionSelected: (regionId: string) => void;
  _pendingRealtimeRaf: number | null;
  _pendingRealtimeRegionIds: Set<string>;

  constructor(canvasElement) {
    this.canvasElement = canvasElement;
    this.regions = new Map();
    this.onRegionModified = () => {};
    this.onRegionSelected = () => {};
    // Realtime update scheduling
    this._pendingRealtimeRaf = null;
    this._pendingRealtimeRegionIds = new Set();

    // Initialize Fabric.js canvas
    this.fabric = new fabric.Canvas(this.canvasElement, {
      selection: true,
      preserveObjectStacking: true,
      backgroundColor: undefined,
      width: this.canvasElement.width,
      height: this.canvasElement.height,
      interactive: true,
      moveCursor: "move",
      hoverCursor: "move",
      defaultCursor: "default",
    });
  }

  init() {
    // Ensure canvas backstore is properly sized, keep CSS controlled by stage
    this.fabric.setDimensions(
      {
        width: this.canvasElement.width,
        height: this.canvasElement.height,
      },
      { backstoreOnly: true },
    );

    // Fit wrapper and internal canvases to stage bounds
    const wrapper = this.fabric.wrapperEl;
    if (wrapper) {
      wrapper.style.position = "absolute";
      wrapper.style.left = "0";
      wrapper.style.top = "0";
      wrapper.style.right = "0";
      wrapper.style.bottom = "0";
      wrapper.style.width = "100%";
      wrapper.style.height = "100%";
    }
    const lower = this.fabric.lowerCanvasEl;
    const upper = this.fabric.upperCanvasEl;
    if (lower) {
      lower.style.position = "absolute";
      lower.style.left = "0";
      lower.style.top = "0";
      lower.style.width = "100%";
      lower.style.height = "100%";
    }
    if (upper) {
      upper.style.position = "absolute";
      upper.style.left = "0";
      upper.style.top = "0";
      upper.style.width = "100%";
      upper.style.height = "100%";
    }

    // Set up event listeners
    this.fabric.on("object:moving", (e) => {
      this.updateRegionInRealTime(e.target);
    });

    this.fabric.on("object:scaling", (e) => {
      this.updateRegionInRealTime(e.target);
    });

    this.fabric.on("object:rotating", (e) => {
      this.updateRegionInRealTime(e.target);
    });

    this.fabric.on("object:modified", (e) => {
      // @ts-ignore regionId is not typed
      const regionId = e.target.regionId;
      if (regionId && this.onRegionModified) {
        this.onRegionModified(regionId);
      }
    });

    this.fabric.on("selection:created", ({ selected }) => {
      // @ts-ignore regionId is not typed
      const { regionId } = selected[0];
      if (regionId && this.onRegionSelected) {
        this.onRegionSelected(regionId);
      }
    });

    this.fabric.on("selection:updated", ({ selected }) => {
      // @ts-ignore regionId is not typed
      const { regionId } = selected[0];
      if (regionId && this.onRegionSelected) {
        this.onRegionSelected(regionId);
      }
    });

    // Enable object controls
    this.fabric.selection = true;
    this.fabric.skipTargetFind = false;
    // Ensure canvas remains interactive for transformations
    // @ts-ignore interactive is not typed on fabric.Canvas options
    this.fabric.interactive = true;
    // this.fabric.interactive = true;
  }

  resize(width, height) {
    if (!this.fabric) return;
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    this.canvasElement.width = w;
    this.canvasElement.height = h;
    // Update backstore only; keep CSS width/height at 100% within stage
    this.fabric.setDimensions({ width: w, height: h }, { backstoreOnly: true });
    this.fabric.renderAll();
  }

  scaleContent(scaleX, scaleY) {
    if (!this.fabric) return;
    if (!isFinite(scaleX) || !isFinite(scaleY)) return;
    if (Math.abs(scaleX - 1) < 1e-6 && Math.abs(scaleY - 1) < 1e-6) return;

    const objects = this.fabric.getObjects();
    objects.forEach((obj) => {
      // Scale position
      obj.left = (obj.left || 0) * scaleX;
      obj.top = (obj.top || 0) * scaleY;
      // Scale object size via scaleX/scaleY to respect origin and rotation
      obj.scaleX = (obj.scaleX || 1) * scaleX;
      obj.scaleY = (obj.scaleY || 1) * scaleY;
      if (obj.setCoords) obj.setCoords();
    });
    this.fabric.renderAll();
  }

  updateRegionInRealTime(target) {
    const regionId = target && target.regionId;
    if (!regionId) return;

    // Batch updates per frame to avoid excessive recalculation
    this._pendingRealtimeRegionIds.add(regionId);
    if (this._pendingRealtimeRaf == null) {
      this._pendingRealtimeRaf = requestAnimationFrame(() => {
        for (const id of this._pendingRealtimeRegionIds) {
          if (this.onRegionModified) {
            this.onRegionModified(id);
          }
        }
        this._pendingRealtimeRegionIds.clear();
        this._pendingRealtimeRaf = null;
      });
    }
  }

  createRegion(regionId, type, config) {
    const objects: fabric.Object[] = [];

    switch (type) {
      case "area":
        objects.push(this.createAreaRegion(regionId));
        break;
      case "strip":
        objects.push(...this.createStripRegion(regionId, config.count || 3));
        break;
      case "grid":
        objects.push(
          ...this.createGridRegion(
            regionId,
            config.rows || 2,
            config.cols || 3,
          ),
        );
        break;
    }

    // Store region objects
    this.regions.set(regionId, objects);

    // Add to canvas
    objects.forEach((obj) => {
      // @ts-ignore regionId is not typed
      obj.regionId = regionId;
      this.fabric.add(obj);
    });

    this.fabric.renderAll();
    return objects;
  }

  createAreaRegion(regionId) {
    return new fabric.Rect({
      left: 100 + Math.random() * 200,
      top: 100 + Math.random() * 100,
      width: 150,
      height: 100,
      fill: "rgba(59, 130, 246, 0.3)",
      stroke: "#3B82F6",
      strokeWidth: 2,
      strokeDashArray: [5, 5],
      selectable: true,
      evented: true,
      hasControls: true,
      hasBorders: true,
      hasRotatingPoint: true,
      transparentCorners: false,
      cornerColor: "#3B82F6",
      cornerStyle: "circle",
      cornerSize: 8,
      borderColor: "#3B82F6",
      borderScaleFactor: 2,
      regionId: regionId,
      regionType: "area",
    });
  }

  createStripRegion(regionId, count) {
    const cellWidth = 120;
    const cellHeight = 60;
    const startX = 50 + Math.random() * 200;
    const startY = 50 + Math.random() * 150;

    const cells: fabric.Object[] = [];
    for (let i = 0; i < count; i++) {
      const rect = new fabric.Rect({
        left: i * cellWidth,
        top: 0,
        originX: "left",
        originY: "top",
        width: cellWidth,
        height: cellHeight,
        fill: "rgba(20, 184, 166, 0.3)",
        stroke: "#14B8A6",
        strokeWidth: 2,
        strokeDashArray: [3, 3],
        // Match original behaviour so group transforms work correctly
        // Child cells remain non-selectable but still need controls metadata
        selectable: false,
        evented: false,
        // @ts-ignore missing typings for these props on fabric.Rect
        hasControls: true,
        // @ts-ignore
        hasBorders: true,
        // @ts-ignore
        hasRotatingPoint: true,
        transparentCorners: false,
        cornerColor: "#14B8A6",
        cornerStyle: "circle",
        cornerSize: 8,
        borderColor: "#14B8A6",
        borderScaleFactor: 2,
        regionId: regionId,
        regionType: "strip",
        cellIndex: i,
      });
      cells.push(rect);
    }

    const group = new fabric.Group(cells, {
      left: startX,
      top: startY,
      originX: "left",
      originY: "top",
      selectable: true,
      evented: true,
      hasControls: true,
      hasBorders: true,
      // @ts-ignore hasRotatingPoint is not typed
      hasRotatingPoint: true,
      transparentCorners: false,
      cornerColor: "#14B8A6",
      cornerStyle: "circle",
      cornerSize: 8,
      // hasRotatingPoint: true,
      // @ts-ignore regionId is not typed
      regionId: regionId,
      regionType: "strip",
    });

    return [group];
  }

  createGridRegion(regionId, rows, cols) {
    const cellWidth = 80;
    const cellHeight = 60;
    const startX = 100 + Math.random() * 150;
    const startY = 100 + Math.random() * 100;

    const cells: fabric.Object[] = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const rect = new fabric.Rect({
          left: col * cellWidth,
          top: row * cellHeight,
          originX: "left",
          originY: "top",
          width: cellWidth,
          height: cellHeight,
          fill: "rgba(139, 92, 246, 0.3)",
          stroke: "#8B5CF6",
          strokeWidth: 2,
          strokeDashArray: [2, 2],
          selectable: false,
          evented: false,
          hasControls: true,
          hasBorders: true,
          hasRotatingPoint: true,
          transparentCorners: false,
          cornerColor: "#8B5CF6",
          cornerStyle: "circle",
          cornerSize: 8,
          borderColor: "#8B5CF6",
          borderScaleFactor: 2,
          regionId: regionId,
          regionType: "grid",
          cellRow: row,
          cellCol: col,
        });
        cells.push(rect);
      }
    }

    const group = new fabric.Group(cells, {
      left: startX,
      top: startY,
      originX: "left",
      originY: "top",
      selectable: true,
      evented: true,
      hasControls: true,
      hasBorders: true,
      // @ts-ignore hasRotatingPoint is not typed
      hasRotatingPoint: true,
      transparentCorners: false,
      cornerColor: "#8B5CF6",
      cornerStyle: "circle",
      cornerSize: 8,
      // hasRotatingPoint: true,
      // @ts-ignore regionId is not typed
      regionId: regionId,
      regionType: "grid",
    });

    return [group];
  }

  removeRegion(regionId) {
    const objects = this.regions.get(regionId);
    if (!objects) return;

    objects.forEach((obj) => {
      this.fabric.remove(obj);
    });

    this.regions.delete(regionId);
    this.fabric.renderAll();
  }

  getRegionSnapshot(regionId) {
    const objects = this.regions.get(regionId);
    if (!objects || objects.length === 0) return null;
    const root = objects[0];
    if (!root) return null;
    root.setCoords();
    const absWidth = root.getScaledWidth ? root.getScaledWidth() : root.width;
    const absHeight = root.getScaledHeight
      ? root.getScaledHeight()
      : root.height;
    return {
      left: root.left,
      top: root.top,
      angle: root.angle || 0,
      scaleX: root.scaleX || 1,
      scaleY: root.scaleY || 1,
      skewX: root.skewX || 0,
      skewY: root.skewY || 0,
      flipX: root.flipX || false,
      flipY: root.flipY || false,
      absWidth,
      absHeight,
    };
  }

  applyRegionSnapshot(regionId, snapshot, preserveSize = true) {
    if (!snapshot) return;
    const objects = this.regions.get(regionId);
    if (!objects || objects.length === 0) return;
    const root = objects[0];
    if (!root) return;

    let nextScaleX = snapshot.scaleX || 1;
    let nextScaleY = snapshot.scaleY || 1;
    if (preserveSize && root.width && root.height) {
      const baseW = root.width;
      const baseH = root.height;
      if (baseW > 0 && baseH > 0 && snapshot.absWidth && snapshot.absHeight) {
        nextScaleX = snapshot.absWidth / baseW;
        nextScaleY = snapshot.absHeight / baseH;
      }
    }

    root.set({
      left: snapshot.left,
      top: snapshot.top,
      angle: snapshot.angle || 0,
      scaleX: nextScaleX,
      scaleY: nextScaleY,
      skewX: snapshot.skewX || 0,
      skewY: snapshot.skewY || 0,
      flipX: snapshot.flipX || false,
      flipY: snapshot.flipY || false,
    });
    root.setCoords();
    this.fabric.renderAll();
  }

  getRegionBounds(regionId) {
    const objects = this.regions.get(regionId);
    if (!objects) return [];

    const computeBoundsFromMatrix = (obj: fabric.Object): Bounds => {
      // Ensure matrices are up to date
      obj.setCoords();
      const m = obj.calcTransformMatrix();
      const tl = fabric.util.transformPoint(
        new fabric.Point(-obj.width / 2, -obj.height / 2),
        m,
      );
      const tr = fabric.util.transformPoint(
        new fabric.Point(obj.width / 2, -obj.height / 2),
        m,
      );
      const bl = fabric.util.transformPoint(
        new fabric.Point(-obj.width / 2, obj.height / 2),
        m,
      );
      const br = fabric.util.transformPoint(
        new fabric.Point(obj.width / 2, obj.height / 2),
        m,
      );
      const xs = [tl.x, tr.x, bl.x, br.x];
      const ys = [tl.y, tr.y, bl.y, br.y];
      const minX = Math.min.apply(null, xs);
      const maxX = Math.max.apply(null, xs);
      const minY = Math.min.apply(null, ys);
      const maxY = Math.max.apply(null, ys);
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    };

    const boundsList: Bounds[] = [];

    objects.forEach((obj) => {
      if (obj && obj.type === "group") {
        const children = obj.getObjects ? obj.getObjects() : obj._objects || [];
        children.forEach((child) => {
          boundsList.push(computeBoundsFromMatrix(child));
        });
      } else {
        boundsList.push(computeBoundsFromMatrix(obj));
      }
    });
    return boundsList;
  }

  getRegionQuads(regionId) {
    const objects = this.regions.get(regionId);
    if (!objects) return [];

    const quads: Quad[] = [];

    const quadFromMatrix = (obj: fabric.Object) => {
      if (!obj) return;
      obj.setCoords();
      const m = obj.calcTransformMatrix();
      const tl = fabric.util.transformPoint(
        new fabric.Point(-obj.width / 2, -obj.height / 2),
        m,
      );
      const tr = fabric.util.transformPoint(
        new fabric.Point(obj.width / 2, -obj.height / 2),
        m,
      );
      const bl = fabric.util.transformPoint(
        new fabric.Point(-obj.width / 2, obj.height / 2),
        m,
      );
      quads.push({
        p0: { x: tl.x, y: tl.y },
        u: { x: tr.x - tl.x, y: tr.y - tl.y },
        v: { x: bl.x - tl.x, y: bl.y - tl.y },
      });
    };

    objects.forEach((obj) => {
      if (obj && obj.type === "group") {
        const children = obj.getObjects ? obj.getObjects() : obj._objects || [];
        children.forEach(quadFromMatrix);
      } else {
        quadFromMatrix(obj);
      }
    });

    return quads;
  }

  enableSelection() {
    this.fabric.selection = true;
    this.fabric.skipTargetFind = false;
    // this.fabric.interactive = true;
    this.fabric.defaultCursor = "default";
    this.fabric.hoverCursor = "move";
    this.fabric.moveCursor = "move";
    this.fabric.renderAll();
  }

  highlightRegion(regionId) {
    const objects = this.regions.get(regionId);
    if (!objects) return;

    // Temporarily highlight the region
    objects.forEach((obj) => {
      if (obj && obj.type === "group") {
        const children = obj.getObjects ? obj.getObjects() : obj._objects || [];
        children.forEach((child) => {
          child.set({ stroke: "#F59E0B", strokeWidth: 3 });
        });
      } else {
        obj.set({ stroke: "#F59E0B", strokeWidth: 3 });
      }
    });

    this.fabric.renderAll();

    // Reset after delay
    setTimeout(() => {
      objects.forEach((obj) => {
        if (obj && obj.type === "group") {
          const children = obj.getObjects
            ? obj.getObjects()
            : obj._objects || [];
          children.forEach((child) => {
            const originalColor =
              child.regionType === "area"
                ? "#3B82F6"
                : child.regionType === "strip"
                  ? "#14B8A6"
                  : "#8B5CF6";
            child.set({ stroke: originalColor, strokeWidth: 2 });
          });
        } else {
          const originalColor =
            obj.regionType === "area"
              ? "#3B82F6"
              : obj.regionType === "strip"
                ? "#14B8A6"
                : "#8B5CF6";
          obj.set({ stroke: originalColor, strokeWidth: 2 });
        }
      });
      this.fabric.renderAll();
    }, 1000);
  }

  refreshCanvas() {
    this.fabric.renderAll();
  }
}
