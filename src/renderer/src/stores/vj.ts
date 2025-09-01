import { defineStore } from "pinia";
import { ref, shallowRef } from "vue";
import { Compositor } from "../app/compositor";
import type { ISource } from "../app/sources/ISource";
import { registerSource, createSource } from "../app/sources/sourceRegistry";
import { MockSource } from "../app/sources/MockSource";

// register built-ins for now
registerSource(
  "mock",
  ({ id, label, options }) => new MockSource({ id, label, options }),
);

export type DeckId = "A" | "B";

export const useVjStore = defineStore("vj", () => {
  const crossfade = ref(0); // 0 -> A, 1 -> B
  const compositor = shallowRef<Compositor | null>(null);
  const canvasEl = ref<HTMLCanvasElement | null>(null);
  let rafId: number | null = null;
  let lastTime: number | null = null;

  // sources
  const sourceA = shallowRef<ISource | null>(null);
  const sourceB = shallowRef<ISource | null>(null);

  function init(canvas: HTMLCanvasElement): void {
    canvasEl.value = canvas;
    const comp = new Compositor(canvas);
    comp.init();
    compositor.value = comp;

    // instantiate two mock sources
    const gl = comp.getGL();
    if (!gl) return;
    sourceA.value = createSource("mock", {
      id: "A",
      options: { color: [255, 80, 80] },
    });
    sourceB.value = createSource("mock", {
      id: "B",
      options: { color: [80, 160, 255] },
    });
    sourceA.value.load(gl);
    sourceB.value.load(gl);
    sourceA.value.start();
    sourceB.value.start();

    // feed textures to compositor
    comp.setTextures(
      sourceA.value.getTexture(gl),
      sourceB.value.getTexture(gl),
    );

    start();
  }

  function start(): void {
    stop();
    const loop = (t: number) => {
      if (lastTime == null) lastTime = t;
      const dt = Math.max(0, t - lastTime);
      lastTime = t;

      if (compositor.value) {
        const gl = compositor.value.getGL();
        if (gl) {
          sourceA.value?.tick(dt);
          sourceB.value?.tick(dt);
          compositor.value.setTextures(
            sourceA.value?.getTexture(gl) ?? null,
            sourceB.value?.getTexture(gl) ?? null,
          );
        }
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
