import { defineStore } from "pinia";
import { markRaw, reactive, ref, shallowRef } from "vue";
import type { Region, FabricManager } from "../app/fabric-manager";
import type { CanvasMode } from "../app/canvas2d-source";
import { initColorAveragingApp } from "../app/main";

export type Color = { r: number; g: number; b: number; hex: string };

export type RegionConfig = {
  method?: "average" | "mode" | "maxluma";
  count?: number;
  rows?: number;
  cols?: number;
  smoothingEnabled?: boolean;
  smoothingMs?: number;
};

export type UiRegion = {
  id: string;
  type: string;
  config: RegionConfig;
  colors: Color[];
};

export type AppApi = {
  addRegion: (type: string, config?: RegionConfig) => void;
  deleteRegion: (regionId: string) => void;
  clearAllRegions: () => void;
  setSamplesPerEdge: (n: number) => void;
  setMode: (mode: CanvasMode) => void;
  applyRegionConfig: (regionId: string, updated: RegionConfig) => void;
  regions: Map<string, UiRegion>;
  fabricManager: FabricManager | null;
};

export const useColorAverageStore = defineStore("colorAverage", () => {
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
  const editSmoothingEnabled = ref(false);
  const editSmoothingMs = ref(250);

  // External app instance (non-reactive internals)
  const app = shallowRef<AppApi | null>(null);

  async function init(elements: {
    stage: HTMLElement;
    backgroundCanvas: HTMLCanvasElement;
    webglCanvas: HTMLCanvasElement;
    fabricCanvas: HTMLCanvasElement;
  }): Promise<void> {
    const appInstance = await initColorAveragingApp({
      elements,
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
          regions.value = regions.value.map((r) =>
            r.id === region.id ? ui : r,
          );
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

    app.value = markRaw(appInstance as unknown as AppApi);
    app.value.setSamplesPerEdge(controls.samplesPerEdge);
  }

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
    editSmoothingEnabled.value = !!region.config.smoothingEnabled;
    editSmoothingMs.value = region.config.smoothingMs ?? 250;
    isEditOpen.value = true;
  }

  function closeEditModal(): void {
    isEditOpen.value = false;
    editRegion.value = null;
  }

  function saveEditChanges(): void {
    if (!app.value || !editRegion.value) return;
    const region = editRegion.value;
    const updated: RegionConfig = {
      method: editMethod.value,
      smoothingEnabled: editSmoothingEnabled.value,
      smoothingMs: Math.max(
        1,
        Math.min(10000, Math.floor(editSmoothingMs.value)),
      ),
    };
    if (region.type === "strip") {
      updated.count = Math.max(
        2,
        Math.min(20, Math.floor(editStripCount.value)),
      );
    } else if (region.type === "grid") {
      updated.rows = Math.max(2, Math.min(10, Math.floor(editGridRows.value)));
      updated.cols = Math.max(2, Math.min(10, Math.floor(editGridCols.value)));
    }
    app.value.applyRegionConfig(region.id, updated);
    isEditOpen.value = false;
  }

  // Actions
  function addArea(): void {
    app.value?.addRegion("area");
  }
  function addStrip(): void {
    app.value?.addRegion("strip", { count: controls.stripCount });
  }
  function addGrid(): void {
    app.value?.addRegion("grid", {
      rows: controls.gridRows,
      cols: controls.gridCols,
    });
  }
  function deleteRegion(regionId: string): void {
    app.value?.deleteRegion(regionId);
  }
  function clearAll(): void {
    app.value?.clearAllRegions();
    regions.value = [];
  }
  function toggleMode(): void {
    const modes: CanvasMode[] = ["quadrants", "gradient", "diagonal", "syphon"];
    const idx = modes.indexOf(controls.mode);
    controls.mode = modes[(idx + 1) % modes.length];
    app.value?.setMode(controls.mode);
  }
  function setSamplesPerEdge(): void {
    app.value?.setSamplesPerEdge(controls.samplesPerEdge);
  }

  function getApp(): AppApi | null {
    return app.value;
  }

  function resetApp(): void {
    app.value = null;
  }

  return {
    // state
    controls,
    regions,
    selectedRegionId,
    highlightedRowId,
    isEditOpen,
    editRegion,
    editMethod,
    editStripCount,
    editGridRows,
    editGridCols,
    editSmoothingEnabled,
    editSmoothingMs,
    app,
    // actions
    init,
    openEditModal,
    closeEditModal,
    saveEditChanges,
    addArea,
    addStrip,
    addGrid,
    deleteRegion,
    clearAll,
    toggleMode,
    setSamplesPerEdge,
    getApp,
    resetApp,
  };
});
