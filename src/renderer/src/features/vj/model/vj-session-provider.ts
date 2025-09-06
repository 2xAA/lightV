import type { SessionProvider } from "@/shared/session";
import type { useVjStore } from "./vj-store";

export interface VjSessionState {
  crossfade: number;
  crossfadeCurve: "linear" | "equalPower";
  blendMode: "normal" | "add" | "multiply" | "screen";
  transitionType: "crossfade" | "wipe" | "luma";
  transitionSoftness: number;
  transitionAngleRad: number;
  transitionLumaInvert: boolean;
  pauseInactiveWebcams: boolean;
  leftSlots: any[];
  rightSlots: any[];
  selectedLeftIndex: number | null;
  selectedRightIndex: number | null;
  activeDeckA: { saved: any } | null;
  activeDeckB: { saved: any } | null;
}

export class VjSessionProvider implements SessionProvider {
  constructor(private vjStore: ReturnType<typeof useVjStore>) {}

  saveState(): VjSessionState {
    return {
      crossfade: this.vjStore.crossfade,
      crossfadeCurve: this.vjStore.crossfadeCurve,
      blendMode: this.vjStore.blendMode,
      transitionType: this.vjStore.transitionType,
      transitionSoftness: this.vjStore.transitionSoftness,
      transitionAngleRad: this.vjStore.transitionAngleRad,
      transitionLumaInvert: this.vjStore.transitionLumaInvert,
      pauseInactiveWebcams: this.vjStore.pauseInactiveWebcams,
      leftSlots: this.vjStore.leftSlots.map((slot) => ({
        id: slot.id,
        label: slot.label,
        type: slot.type,
        saved: slot.saved,
      })),
      rightSlots: this.vjStore.rightSlots.map((slot) => ({
        id: slot.id,
        label: slot.label,
        type: slot.type,
        saved: slot.saved,
      })),
      selectedLeftIndex: this.vjStore.selectedLeftIndex,
      selectedRightIndex: this.vjStore.selectedRightIndex,
      activeDeckA: this.vjStore.sourceA
        ? this.vjStore.getSourceDescriptor(this.vjStore.sourceA)
        : null,
      activeDeckB: this.vjStore.sourceB
        ? this.vjStore.getSourceDescriptor(this.vjStore.sourceB)
        : null,
    };
  }

  async loadState(state: VjSessionState): Promise<void> {
    // Restore VJ store state
    this.vjStore.crossfade = state.crossfade ?? 0;
    this.vjStore.crossfadeCurve = state.crossfadeCurve ?? "linear";
    this.vjStore.blendMode = state.blendMode ?? "normal";
    this.vjStore.transitionType = state.transitionType ?? "crossfade";
    this.vjStore.transitionSoftness = state.transitionSoftness ?? 0.05;
    this.vjStore.transitionAngleRad = state.transitionAngleRad ?? 0;
    this.vjStore.transitionLumaInvert = state.transitionLumaInvert ?? false;
    this.vjStore.pauseInactiveWebcams = state.pauseInactiveWebcams ?? true;
    this.vjStore.selectedLeftIndex = state.selectedLeftIndex ?? null;
    this.vjStore.selectedRightIndex = state.selectedRightIndex ?? null;

    // Restore slots
    if (state.leftSlots) {
      this.vjStore.leftSlots = state.leftSlots.map((slot: any) => ({
        id: slot.id,
        label: slot.label,
        source: null,
        type: slot.type,
        saved: slot.saved,
      }));
    }

    if (state.rightSlots) {
      this.vjStore.rightSlots = state.rightSlots.map((slot: any) => ({
        id: slot.id,
        label: slot.label,
        source: null,
        type: slot.type,
        saved: slot.saved,
      }));
    }

    // Restore active deck sources
    if (state.activeDeckA?.saved) {
      const comp = this.vjStore.compositor;
      const gl = comp?.getGL();
      if (gl) {
        const source = await this.vjStore.instantiateFromDescriptor(
          state.activeDeckA.saved,
        );
        if (source) {
          this.vjStore.sourceA = source;
          source.load(gl);
          if (this.vjStore.canvasEl && (source as any).setOutputSize) {
            (source as any).setOutputSize(
              this.vjStore.canvasEl.width,
              this.vjStore.canvasEl.height,
            );
          }
          source.start();
        }
      }
    }

    if (state.activeDeckB?.saved) {
      const comp = this.vjStore.compositor;
      const gl = comp?.getGL();
      if (gl) {
        const source = await this.vjStore.instantiateFromDescriptor(
          state.activeDeckB.saved,
        );
        if (source) {
          this.vjStore.sourceB = source;
          source.load(gl);
          if (this.vjStore.canvasEl && (source as any).setOutputSize) {
            (source as any).setOutputSize(
              this.vjStore.canvasEl.width,
              this.vjStore.canvasEl.height,
            );
          }
          source.start();
        }
      }
    }

    // Update compositor with both restored sources
    const comp = this.vjStore.compositor;
    const gl = comp?.getGL();
    if (comp && gl) {
      comp.setTextures(
        this.vjStore.sourceA?.getTexture(gl) ?? null,
        this.vjStore.sourceB?.getTexture(gl) ?? null,
      );
    }
  }
}
