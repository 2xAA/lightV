import type { SessionProvider } from "@/shared/session";
import type { useColorAverageStore } from "./color-average-store";

export interface ColorAnalysisSessionState {
  controls: {
    stripCount: number;
    gridRows: number;
    gridCols: number;
    samplesPerEdge: number;
    mode: string;
  };
  regions: any[];
  selectedRegionId: string | null;
  fabricRegions: { [regionId: string]: any };
}

export class ColorAnalysisSessionProvider implements SessionProvider {
  constructor(private colorStore: ReturnType<typeof useColorAverageStore>) {}

  saveState(): ColorAnalysisSessionState {
    const colorData = {
      controls: { ...this.colorStore.controls },
      regions: [...this.colorStore.regions],
      selectedRegionId: this.colorStore.selectedRegionId,
      fabricRegions: {} as { [regionId: string]: any },
    };

    // Get fabric region snapshots
    if (this.colorStore.app?.fabricManager) {
      const fabricManager = this.colorStore.app.fabricManager;
      for (const region of this.colorStore.regions) {
        const snapshot = fabricManager.getRegionSnapshot(region.id);
        if (snapshot) {
          colorData.fabricRegions[region.id] = snapshot;
        }
      }
    }

    return colorData;
  }

  async loadState(state: ColorAnalysisSessionState): Promise<void> {
    this.colorStore.controls = {
      ...state.controls,
      mode: state.controls.mode as any,
    };
    this.colorStore.regions = [...state.regions];
    this.colorStore.selectedRegionId = state.selectedRegionId;

    // Restore fabric regions after a short delay to ensure fabric manager is ready
    setTimeout(() => {
      if (this.colorStore.app?.fabricManager && state.fabricRegions) {
        const fabricManager = this.colorStore.app.fabricManager;

        // Clear existing regions
        const regionIds = Array.from(fabricManager.regions.keys());
        for (const regionId of regionIds) {
          fabricManager.removeRegion(regionId);
        }

        // Recreate regions with their fabric objects
        for (const region of this.colorStore.regions) {
          const regionConfig = region.config;
          fabricManager.createRegion(region.id, region.type, regionConfig);

          // Apply saved snapshot if available
          const snapshot = state.fabricRegions[region.id];
          if (snapshot) {
            fabricManager.applyRegionSnapshot(region.id, snapshot, true);
          }
        }
      }
    }, 100);
  }
}
