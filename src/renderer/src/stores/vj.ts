import { defineStore } from "pinia";
import { ref, shallowRef } from "vue";
import { Compositor } from "../app/compositor";

export type DeckId = "A" | "B";

export const useVjStore = defineStore("vj", () => {
  const crossfade = ref(0); // 0 -> A, 1 -> B
  const compositor = shallowRef<Compositor | null>(null);
  const canvasEl = ref<HTMLCanvasElement | null>(null);
  let rafId: number | null = null;

  function init(canvas: HTMLCanvasElement): void {
    canvasEl.value = canvas;
    const comp = new Compositor(canvas);
    comp.init();
    comp.setSourceColors([255, 0, 0], [0, 128, 255]); // placeholders
    compositor.value = comp;
    start();
  }

  function start(): void {
    stop();
    const loop = () => {
      if (compositor.value) {
        compositor.value.setMix(crossfade.value);
        compositor.value.render();
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
  }

  function stop(): void {
    if (rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function setCrossfade(v: number): void {
    crossfade.value = Math.max(0, Math.min(1, v));
  }

  return { crossfade, compositor, init, start, stop, setCrossfade };
});
