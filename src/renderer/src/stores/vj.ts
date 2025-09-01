import { defineStore } from "pinia";
import { ref, shallowRef } from "vue";
import { Compositor } from "../app/compositor";
import type { ISource } from "../app/sources/ISource";
import { registerSource, createSource } from "../app/sources/sourceRegistry";
import { MockSource } from "../app/sources/MockSource";
import { ImageSource } from "../app/sources/ImageSource";
import { SyphonSource } from "../app/sources/SyphonSource";
import { VideoSource } from "../app/sources/VideoSource";
import { WebcamSource } from "../app/sources/WebcamSource";
import { ShaderSource } from "../app/sources/ShaderSource";
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
registerSource(
  "video",
  ({ id, label, options }) => new VideoSource({ id, label, options }),
);
registerSource(
  "webcam",
  ({ id, label, options }) => new WebcamSource({ id, label, options }),
);
registerSource(
  "shader",
  ({ id, label, options }) => new ShaderSource({ id, label, options }),
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
  const crossfadeCurve = ref<"linear" | "equalPower">("linear");
  const blendMode = ref<"normal" | "add" | "multiply" | "screen">("normal");
  const transitionType = ref<"crossfade" | "wipe" | "luma">("crossfade");
  const transitionSoftness = ref(0.05); // 0..0.5
  const transitionAngleRad = ref(0); // wipe angle
  const transitionLumaInvert = ref(false);
  const compositor = shallowRef<Compositor | null>(null);
  const canvasEl = ref<HTMLCanvasElement | null>(null);
  let rafId: number | null = null;
  let lastTime: number | null = null;

  // global privacy: pause webcams that are not on A/B decks
  const pauseInactiveWebcams = ref(true);

  // sources currently active on decks
  const sourceA = shallowRef<ISource | null>(null);
  const sourceB = shallowRef<ISource | null>(null);

  // banks (ZOI: start empty, grow as needed)
  const leftSlots = ref<SlotModel[]>([]);
  const rightSlots = ref<SlotModel[]>([]);

  // selection per bank
  const selectedLeftIndex = ref<number | null>(null);
  const selectedRightIndex = ref<number | null>(null);

  const getSlots = (side: BankSide) =>
    side === "left" ? leftSlots.value : rightSlots.value;
  const setSlots = (side: BankSide, next: SlotModel[]) => {
    if (side === "left") leftSlots.value = next;
    else rightSlots.value = next;
  };

  function setSelectedSlot(side: BankSide, index: number | null): void {
    if (side === "left") selectedLeftIndex.value = index;
    else selectedRightIndex.value = index;
  }

  function getSelectedSlot(side: BankSide): number | null {
    return side === "left" ? selectedLeftIndex.value : selectedRightIndex.value;
  }

  function getSelectedSource(side: BankSide): ISource | null {
    const idx = getSelectedSlot(side);
    if (idx == null) return null;
    const slots = getSlots(side);
    return slots[idx]?.source ?? null;
  }

  function enforceWebcamPolicy(): void {
    if (!pauseInactiveWebcams.value) return;
    const active = new Set<ISource | null>([sourceA.value, sourceB.value]);
    const allSlots = [...leftSlots.value, ...rightSlots.value];
    for (const s of allSlots) {
      const src = s.source as any;
      if (!src) continue;
      if (src.type === "webcam") {
        if (active.has(src)) {
          if (typeof src.start === "function") src.start();
        } else {
          if (typeof src.stop === "function") src.stop();
        }
      }
    }
  }

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
      if (sourceA.value) (sourceA.value as any).stop?.();
      sourceA.value = src;
      sourceA.value.load(gl);
      if (canvasEl.value && (sourceA.value as any).setOutputSize) {
        (sourceA.value as any).setOutputSize(
          canvasEl.value.width,
          canvasEl.value.height,
        );
      }
      sourceA.value.start();
    } else {
      if (sourceB.value) (sourceB.value as any).stop?.();
      sourceB.value = src;
      sourceB.value.load(gl);
      if (canvasEl.value && (sourceB.value as any).setOutputSize) {
        (sourceB.value as any).setOutputSize(
          canvasEl.value.width,
          canvasEl.value.height,
        );
      }
      sourceB.value.start();
    }

    comp.setTextures(
      sourceA.value?.getTexture(gl) ?? null,
      sourceB.value?.getTexture(gl) ?? null,
    );
    enforceWebcamPolicy();
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
    } else if (desc.type === "video") {
      const id = `vid-${Date.now()}`;
      const v = new VideoSource({
        id,
        label: desc.label,
        options: {
          fillMode: desc.options?.fillMode,
          loop: desc.options?.loop,
          muted: desc.options?.muted,
          playbackRate: desc.options?.playbackRate,
        },
      });
      v.load(gl);
      const file = await dataUrlToFile(desc.dataUrl, desc.label || "video.mp4");
      await v.setFile(file);
      v.start();
      return v;
    } else if (desc.type === "webcam") {
      const id = `cam-${Date.now()}`;
      const c = new WebcamSource({
        id,
        label: desc.label,
        options: {
          deviceId: desc.deviceId,
          fillMode: desc.options?.fillMode,
        } as any,
      });
      c.load(gl);
      if (canvas) {
        c.setOutputSize(canvas.width, canvas.height);
      }

      if (!pauseInactiveWebcams.value) {
        c.start();
      }
      return c;
    } else if (desc.type === "shader") {
      const id = `sh-${Date.now()}`;
      const s = new ShaderSource({
        id,
        label: desc.label,
        options: {
          frag: (desc as any).frag,
          fillMode: desc.options?.fillMode,
        },
      });
      s.load(gl);
      if (canvas) s.setOutputSize(canvas.width, canvas.height);
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
    if (slot.type === "video" && slot.saved && slot.saved.type === "video")
      return slot.saved;
    if (slot.type === "webcam" && slot.saved && slot.saved.type === "webcam")
      return slot.saved;
    if (slot.type === "shader" && slot.saved && slot.saved.type === "shader")
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
    return new File([blob], filename, {
      type: blob.type || "application/octet-stream",
    });
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

  // async function loadWebcamIntoDeck(
  //   deck: DeckId,
  //   deviceId: string,
  // ): Promise<void> {
  //   const comp = compositor.value;
  //   const gl = comp?.getGL();
  //   if (!comp || !gl) return;
  //   const id = `${deck}-webcam-${deviceId}-${Date.now()}`;
  //   const c = new WebcamSource({ id, deviceId });
  //   await c.load(gl);
  //   setDeckSource(deck, c);
  // }

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
    if (prev) (prev as any).stop?.();
    const id = slots[index]?.id ?? `${side.toUpperCase()}${index}`;
    slots[index] = { id, label, source: src, type, saved: saved ?? null };
    setSlots(side, slots);
    enforceWebcamPolicy();
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

  async function loadVideoIntoSlot(
    side: BankSide,
    index: number,
    file: File,
  ): Promise<void> {
    const comp = compositor.value;
    const gl = comp?.getGL();
    if (!comp || !gl) return;
    const id = `${side}-slot${index}-vid-${Date.now()}`;
    const v = new VideoSource({ id, label: file.name || "Video" });
    v.load(gl);
    if (canvasEl.value)
      v.setOutputSize(canvasEl.value.width, canvasEl.value.height);
    await v.setFile(file);
    v.start();
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(file);
    });
    const saved: SourceDescriptor = {
      type: "video",
      label: file.name || "Video",
      dataUrl,
      options: { loop: true, muted: true, playbackRate: 1 },
    };
    setSlotSource(side, index, v, saved.label, "video", saved);
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

  async function loadWebcamIntoSlot(
    side: BankSide,
    index: number,
    deviceId?: string,
    label = "Webcam",
  ): Promise<void> {
    const comp = compositor.value;
    const gl = comp?.getGL();
    if (!comp || !gl) return;
    const id = `${side}-slot${index}-cam-${Date.now()}`;
    const c = new WebcamSource({ id, label, options: { deviceId } });
    c.load(gl);
    if (canvasEl.value)
      c.setOutputSize(canvasEl.value.width, canvasEl.value.height);
    // Do not start here; webcams start only when active on a deck
    const saved: SourceDescriptor = {
      type: "webcam",
      label,
      deviceId,
    } as SourceDescriptor;
    setSlotSource(side, index, c, label, "webcam", saved);
  }

  async function loadShaderIntoSlot(
    side: BankSide,
    index: number,
    frag?: string,
    label = "Shader",
  ): Promise<void> {
    const comp = compositor.value;
    const gl = comp?.getGL();
    if (!comp || !gl) return;
    const id = `${side}-slot${index}-sh-${Date.now()}`;
    const s = new ShaderSource({ id, label, options: { frag } });
    s.load(gl);
    if (canvasEl.value)
      s.setOutputSize(canvasEl.value.width, canvasEl.value.height);
    const saved: SourceDescriptor = {
      type: "shader",
      label,
      frag: frag || "",
    } as SourceDescriptor;
    setSlotSource(side, index, s, label, "shader", saved);
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

  async function addVideoToBank(side: BankSide, file: File): Promise<void> {
    const slots = getSlots(side);
    const index = slots.length;
    await loadVideoIntoSlot(side, index, file);
  }

  async function addWebcamToBank(
    side: BankSide,
    deviceId?: string,
  ): Promise<void> {
    const slots = getSlots(side);
    const index = slots.length;
    await loadWebcamIntoSlot(side, index, deviceId);
  }

  async function addShaderToBank(side: BankSide, frag?: string): Promise<void> {
    const slots = getSlots(side);
    const index = slots.length;
    await loadShaderIntoSlot(side, index, frag);
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
    fromSlots.splice(fromIndex, 1);
    toSlots.splice(toIndex, 0, from);
    setSlots(fromSide, fromSlots);
    setSlots(toSide, toSlots);
  }

  function removeSlot(side: BankSide, index: number): void {
    const comp = compositor.value;
    const gl = comp?.getGL();
    const slots = getSlots(side).slice();
    const s = slots[index]?.source;
    if (gl && s) (s as any).stop?.();
    slots.splice(index, 1);
    setSlots(side, slots);
    enforceWebcamPolicy();
  }

  function setActiveFromSlot(side: BankSide, index: number): void {
    const slots = getSlots(side);
    const slot = slots[index];
    if (!slot || !slot.source) return;
    const deck = side === "left" ? "A" : "B";
    setDeckSource(deck, slot.source);
    setSelectedSlot(side, index);
  }

  function computeUvRect(
    src: ISource | null,
  ): [number, number, number, number] {
    if (!src || !canvasEl.value) return [0, 0, 1, 1];
    const size = src.getContentSize ? src.getContentSize() : null;
    if (!size || size.width <= 0 || size.height <= 0) return [0, 0, 1, 1];
    const cw = canvasEl.value.width || 1;
    const ch = canvasEl.value.height || 1;
    const sw = size.width;
    const sh = size.height;
    const srcAspect = sw / sh;
    const dstAspect = cw / ch;
    const mode = src.getFillMode ? src.getFillMode() : "cover";
    let scaleX = 1;
    let scaleY = 1;
    let offX = 0;
    let offY = 0;
    if (mode === "stretch") {
      scaleX = 1;
      scaleY = 1;
      offX = 0;
      offY = 0;
    } else if (mode === "cover") {
      const scale =
        srcAspect > dstAspect
          ? dstAspect / srcAspect
          : 1 / (srcAspect / dstAspect);
      if (srcAspect > dstAspect) {
        scaleX = scale;
        scaleY = 1;
        offX = (1 - scaleX) * 0.5;
        offY = 0;
      } else {
        scaleX = 1;
        scaleY = scale;
        offX = 0;
        offY = (1 - scaleY) * 0.5;
      }
    } else {
      if (srcAspect > dstAspect) {
        const scale = dstAspect / srcAspect;
        scaleX = 1;
        scaleY = scale;
        offX = 0;
        offY = (1 - scaleY) * 0.5;
      } else {
        const scale = srcAspect / dstAspect;
        scaleX = scale;
        scaleY = 1;
        offX = (1 - scaleX) * 0.5;
        offY = 0;
      }
    }
    return [offX, offY, scaleX, scaleY];
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
        const rectA = computeUvRect(sourceA.value);
        const rectB = computeUvRect(sourceB.value);
        compositor.value.setUvRects(rectA, rectB);
        const v = Math.max(0, Math.min(1, crossfade.value));
        const t =
          crossfadeCurve.value === "equalPower"
            ? Math.sin((v * Math.PI) / 2)
            : v;
        compositor.value.setMix(t);
        const modeIndex =
          blendMode.value === "normal"
            ? 0
            : blendMode.value === "add"
              ? 1
              : blendMode.value === "multiply"
                ? 2
                : 3;
        (compositor.value as any).setBlendMode?.(modeIndex);
        const trIndex =
          transitionType.value === "crossfade"
            ? 0
            : transitionType.value === "wipe"
              ? 1
              : 2;
        (compositor.value as any).setTransitionType?.(trIndex);
        (compositor.value as any).setTransitionParams?.([
          Math.max(0, Math.min(0.5, transitionSoftness.value)),
          transitionAngleRad.value,
          transitionLumaInvert.value ? 1 : 0,
          0,
        ]);
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

  function setCrossfadeCurve(curve: "linear" | "equalPower"): void {
    crossfadeCurve.value = curve;
  }

  function setBlendMode(mode: "normal" | "add" | "multiply" | "screen"): void {
    blendMode.value = mode;
  }

  function setTransitionTypeUI(type: "crossfade" | "wipe" | "luma"): void {
    transitionType.value = type;
  }
  function setTransitionSoftness(v: number): void {
    transitionSoftness.value = Math.max(0, Math.min(0.5, Number(v) || 0));
  }
  function setTransitionAngleRad(v: number): void {
    transitionAngleRad.value = Number(v) || 0;
  }
  function setTransitionLumaInvert(on: boolean): void {
    transitionLumaInvert.value = !!on;
  }

  return {
    crossfade,
    crossfadeCurve,
    blendMode,
    transitionType,
    transitionSoftness,
    transitionAngleRad,
    transitionLumaInvert,
    compositor,
    init,
    start,
    stop,
    setCrossfade,
    setCrossfadeCurve,
    setBlendMode,
    setTransitionTypeUI,
    setTransitionSoftness,
    setTransitionAngleRad,
    setTransitionLumaInvert,
    pauseInactiveWebcams,
    loadImageIntoDeck,
    loadSyphonIntoDeck,
    setDeckSource,
    leftSlots,
    rightSlots,
    loadImageIntoSlot,
    loadVideoIntoSlot,
    loadSyphonIntoSlot,
    loadWebcamIntoSlot,
    loadShaderIntoSlot,
    addImageToBank,
    addSyphonToBank,
    addVideoToBank,
    addWebcamToBank,
    addShaderToBank,
    setActiveFromSlot,
    instantiateFromDescriptor,
    exportDescriptorFromSlot,
    restoreSlotFromSaved,
    moveSlot,
    removeSlot,
    setSelectedSlot,
    getSelectedSlot,
    getSelectedSource,
  };
});
