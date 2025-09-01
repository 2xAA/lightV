import { defineStore } from "pinia";
import { ref, shallowRef } from "vue";
import { Compositor } from "../app/compositor";
import type { ISource } from "../app/sources/ISource";
import { registerSource, createSource } from "../app/sources/sourceRegistry";
import { MockSource } from "../app/sources/MockSource";
import { ImageSource } from "../app/sources/ImageSource";
import { SyphonSource } from "../app/sources/SyphonSource";
import type { SourceDescriptor } from "../app/sources/types";

// register built-ins for now
registerSource(
  "mock",
  ({ id, label, options }) => new MockSource({ id, label, options }),
);
registerSource(
  "image",
  ({ id, label, options }) => new ImageSource({ id, label, options }),
);
registerSource(
  "syphon",
  ({ id, label, options }) =>
    new SyphonSource({
      id,
      label,
      serverIndex: (options?.serverIndex as number) ?? undefined,
    }),
);

export type DeckId = "A" | "B";
export type BankSide = "left" | "right";

export type SlotModel = {
  id: string;
  label: string;
  source: ISource | null;
  type: string | null;
  saved?: SourceDescriptor | null;
};

export const useVjStore = defineStore("vj", () => {
  const crossfade = ref(0); // 0 -> A, 1 -> B
  const compositor = shallowRef<Compositor | null>(null);
  const canvasEl = ref<HTMLCanvasElement | null>(null);
  let rafId: number | null = null;
  let lastTime: number | null = null;

  // sources currently active on decks
  const sourceA = shallowRef<ISource | null>(null);
  const sourceB = shallowRef<ISource | null>(null);

  // banks (ZOI: start empty, grow as needed)
  const leftSlots = ref<SlotModel[]>([]);
  const rightSlots = ref<SlotModel[]>([]);

  const getSlots = (side: BankSide) =>
    side === "left" ? leftSlots.value : rightSlots.value;
  const setSlots = (side: BankSide, next: SlotModel[]) => {
    if (side === "left") leftSlots.value = next;
    else rightSlots.value = next;
  };

  const deckForSide = (side: BankSide): DeckId => (side === "left" ? "A" : "B");

  function init(canvas: HTMLCanvasElement): void {
    canvasEl.value = canvas;
    const comp = new Compositor(canvas);
    comp.init();
    compositor.value = comp;

    // instantiate two mock sources as defaults on decks
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

  function setDeckSource(deck: DeckId, src: ISource): void {
    const comp = compositor.value;
    const gl = comp?.getGL();
    if (!comp || !gl) return;

    if (deck === "A") {
      if (sourceA.value) sourceA.value.dispose(gl);
      sourceA.value = src;
      sourceA.value.load(gl);
      sourceA.value.start();
    } else {
      if (sourceB.value) sourceB.value.dispose(gl);
      sourceB.value = src;
      sourceB.value.load(gl);
      sourceB.value.start();
    }

    comp.setTextures(
      sourceA.value?.getTexture(gl) ?? null,
      sourceB.value?.getTexture(gl) ?? null,
    );
  }

  // Descriptor <-> ISource
  async function instantiateFromDescriptor(
    desc: SourceDescriptor,
  ): Promise<ISource | null> {
    const comp = compositor.value;
    const gl = comp?.getGL();
    const canvas = canvasEl.value;
    if (!comp || !gl) return null;
    if (desc.type === "image") {
      const id = `img-${Date.now()}`;
      const img = new ImageSource({
        id,
        label: desc.label,
        options: { fillMode: desc.options?.fillMode },
      });
      img.load(gl);
      if (canvas) img.setOutputSize(canvas.width, canvas.height);
      await img.setFile(
        await dataUrlToFile(desc.dataUrl, desc.label || "image.png"),
      );
      return img;
    } else if (desc.type === "syphon") {
      const id = `sy-${Date.now()}`;
      const s = new SyphonSource({
        id,
        label: desc.label,
        serverIndex: desc.serverIndex,
      });
      await s.load(gl);
      return s;
    }
    return null;
  }

  function exportDescriptorFromSlot(slot: SlotModel): SourceDescriptor | null {
    if (!slot || !slot.type) return null;
    if (slot.type === "syphon" && slot.saved && slot.saved.type === "syphon")
      return slot.saved;
    if (slot.type === "image" && slot.saved && slot.saved.type === "image")
      return slot.saved;
    return null;
  }

  // utilities
  async function dataUrlToFile(
    dataUrl: string,
    filename: string,
  ): Promise<File> {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    return new File([blob], filename, { type: blob.type || "image/png" });
  }

  async function loadImageIntoDeck(deck: DeckId, file: File): Promise<void> {
    const comp = compositor.value;
    const gl = comp?.getGL();
    const canvas = canvasEl.value;
    if (!comp || !gl || !canvas) return;

    const id = `${deck}-img-${Date.now()}`;
    const img = new ImageSource({ id });
    img.load(gl);
    img.setOutputSize(canvas.width, canvas.height);
    await img.setFile(file);
    setDeckSource(deck, img);
  }

  async function loadSyphonIntoDeck(
    deck: DeckId,
    serverIndex: number,
  ): Promise<void> {
    const comp = compositor.value;
    const gl = comp?.getGL();
    if (!comp || !gl) return;
    const id = `${deck}-syphon-${serverIndex}-${Date.now()}`;
    const s = new SyphonSource({ id, serverIndex });
    await s.load(gl);
    setDeckSource(deck, s);
  }

  // Slot helpers (explicit index)
  function setSlotSource(
    side: BankSide,
    index: number,
    src: ISource,
    label: string,
    type: string,
    saved?: SourceDescriptor | null,
  ): void {
    const slots = getSlots(side).slice();
    const comp = compositor.value;
    const gl = comp?.getGL();
    if (!gl) return;
    const prev = slots[index]?.source;
    if (prev) prev.dispose(gl);
    const id = slots[index]?.id ?? `${side.toUpperCase()}${index}`;
    slots[index] = { id, label, source: src, type, saved: saved ?? null };
    setSlots(side, slots);
  }

  async function loadImageIntoSlot(
    side: BankSide,
    index: number,
    file: File,
  ): Promise<void> {
    const comp = compositor.value;
    const gl = comp?.getGL();
    const canvas = canvasEl.value;
    if (!comp || !gl || !canvas) return;
    const id = `${side}-slot${index}-img-${Date.now()}`;
    const img = new ImageSource({ id });
    img.load(gl);
    img.setOutputSize(canvas.width, canvas.height);
    await img.setFile(file);
    // persist as data URL for now
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(file);
    });
    const saved: SourceDescriptor = {
      type: "image",
      label: file.name || "Image",
      dataUrl,
    };
    setSlotSource(side, index, img, saved.label, "image", saved);
  }

  async function loadSyphonIntoSlot(
    side: BankSide,
    index: number,
    serverIndex: number,
    label = "Syphon",
  ): Promise<void> {
    const comp = compositor.value;
    const gl = comp?.getGL();
    if (!comp || !gl) return;
    const id = `${side}-slot${index}-syphon-${serverIndex}-${Date.now()}`;
    const s = new SyphonSource({ id, serverIndex });
    await s.load(gl);
    const saved: SourceDescriptor = { type: "syphon", label, serverIndex };
    setSlotSource(side, index, s, label, "syphon", saved);
  }

  // Append helpers (ZOI growth)
  async function addImageToBank(side: BankSide, file: File): Promise<void> {
    const slots = getSlots(side);
    const index = slots.length;
    await loadImageIntoSlot(side, index, file);
  }

  async function addSyphonToBank(
    side: BankSide,
    serverIndex: number,
    label = "Syphon",
  ): Promise<void> {
    const slots = getSlots(side);
    const index = slots.length;
    await loadSyphonIntoSlot(side, index, serverIndex, label);
  }

  async function restoreSlotFromSaved(
    side: BankSide,
    index: number,
  ): Promise<void> {
    const slots = getSlots(side).slice();
    const desc = slots[index]?.saved;
    if (!desc) return;
    const src = await instantiateFromDescriptor(desc);
    if (!src) return;
    setSlotSource(side, index, src, desc.label, desc.type, desc);
  }

  function moveSlot(
    fromSide: BankSide,
    fromIndex: number,
    toSide: BankSide,
    toIndex: number,
  ): void {
    const fromSlots = getSlots(fromSide).slice();
    const toSlots = getSlots(toSide).slice();
    const from = fromSlots[fromIndex];
    // remove from source bank
    fromSlots.splice(fromIndex, 1);
    // insert into destination
    toSlots.splice(toIndex, 0, from);
    setSlots(fromSide, fromSlots);
    setSlots(toSide, toSlots);
  }

  function removeSlot(side: BankSide, index: number): void {
    const comp = compositor.value;
    const gl = comp?.getGL();
    const slots = getSlots(side).slice();
    const s = slots[index]?.source;
    if (gl && s) s.dispose(gl);
    slots.splice(index, 1);
    setSlots(side, slots);
  }

  function setActiveFromSlot(side: BankSide, index: number): void {
    const slots = getSlots(side);
    const slot = slots[index];
    if (!slot || !slot.source) return;
    const deck = deckForSide(side);
    setDeckSource(deck, slot.source);
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
        const flipA = !!sourceA.value?.getFlipY?.();
        const flipB = !!sourceB.value?.getFlipY?.();
        compositor.value.setFlipY(flipA, flipB);
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

  return {
    crossfade,
    compositor,
    init,
    start,
    stop,
    setCrossfade,
    loadImageIntoDeck,
    loadSyphonIntoDeck,
    setDeckSource,
    leftSlots,
    rightSlots,
    loadImageIntoSlot,
    loadSyphonIntoSlot,
    addImageToBank,
    addSyphonToBank,
    setActiveFromSlot,
    instantiateFromDescriptor,
    exportDescriptorFromSlot,
    restoreSlotFromSaved,
    moveSlot,
    removeSlot,
  };
});
