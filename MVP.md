# lightV MVP plan

Last updated: 2025-09-01

## How we’ll track
- Work in thin vertical slices. Mark items as `[x]` as they’re completed.
- Each slice has clear acceptance criteria. If criteria are not met, the slice isn’t done.

---

## Slice 1 — Compositor scaffold + store + crossfader UI
- [X] Create `src/renderer/src/app/compositor.ts` with WebGL program that mixes two textures using a `u_mix` uniform (0 → A, 1 → B). Provide placeholder generators (solid colors) when a deck has no source.
- [X] Add Pinia store `src/renderer/src/stores/vj.ts` managing `decks {A,B}`, `mixer {crossfade, transition}`, and compositor instance wiring.
- [X] Add `Crossfader.vue` and mount in `App.vue`; bind to store and update compositor uniform each frame.
- [X] Render output to the existing program canvas used by color averaging; keep taps intact.

Acceptance
- [X] App boots without errors; a visible canvas renders.
- [X] Moving the crossfader smoothly blends between two colored test sources at 60 FPS.
- [X] No console errors; CPU/GPU usage stable.

---

## Slice 2 — Source abstraction + registry
- [X] Define `app/sources/ISource.ts` with lifecycle: `load`, `start`, `stop`, `dispose`; rendering: `getTexture(gl)`, `getThumbnail()`; options: `getOptionsSchema`, `setOptions`.
- [X] Implement `app/sources/sourceRegistry.ts` to create and manage sources by type and id.
- [X] Decks reference sources via id; hot-swap active source without recreating compositor.

Acceptance
- [X] Can add a mock source to a slot and switch active source on a deck with no frame drops.

---

## Slice 3 — ImageSource
- [X] Implement `ImageSource.ts`: file picker → `HTMLImageElement` → texture upload; fit/contain/cover.
- [X] Basic options: `fillMode`, `scale`, `position`.

Acceptance
- [X] Load a local image; appears in the program output; respects fill mode and scale.

---

## Slice 4 — SyphonSource integration
- [X] Wrap existing Syphon path to conform to `ISource` and supply a WebGL texture.
- [X] Normalize color space/premultiplication to match other sources.

Acceptance
- [X] Syphon appears as a selectable source; behaves identically to others re: scaling/fill.

---

## Slice 5 — Banks UI (left/right)
- [X] `Bank.vue` (grid) and `SourceSlot.vue` with thumbnail, active state, and context menu (replace/remove).
- [X] Keyboard shortcuts (1–9 left, Q–O right) to select slots; enter to set active on deck.

Acceptance
- [X] Can populate slots with sources; select and set active on A/B via UI and keyboard.

---

## Slice 6 — Source Options Panel
- [X] `SourceOptionsPanel.vue` renders dynamic form from `getOptionsSchema()` of the selected slot’s source.
- [X] Changes debounce and call `setOptions`.

Acceptance
- [X] Options update the live rendering without stutter; persisted per-slot in store state.

---

## Slice 7 — VideoSource
- [X] Implement `VideoSource.ts` using `HTMLVideoElement` + `requestVideoFrameCallback` fallback; loop, pause/play controls.
- [X] Texture upload throttled to video frame rate; handle end/loop.

Acceptance
- [X] Local video plays smoothly; crossfading with other sources is glitch‑free.

---

## Slice 8 — WebcamSource
- [X] Implement `WebcamSource.ts` using `getUserMedia`; device selector; start/stop releases camera.

Acceptance
- [X] Webcam appears as a source; switching away stops camera access.

---

## Slice 9 — ShaderSource
- [X] Implement `ShaderSource.ts` for user frag shaders with common uniforms (`time`, `resolution`, `mix`, optional `audio` later).
- [X] Surface compile/link errors in UI.

Acceptance
- [X] Example shader runs; errors shown clearly when invalid.

---

## Slice 10 — Crossfader modes and curves
- [X] Crossfader curves: implement Linear and Equal‑Power curves; expose as store state and UI select.
- [X] Blend modes: implement Normal (crossfade), Add, Multiply, Screen as selectable modes for the crossfader.
- [X] UI: add a compact control near the crossfader to pick Curve and Blend Mode.
- [X] Persistence: store the selected curve and blend mode in the central store for future persistence slice.

Acceptance
- [X] With Curve=Linear, mid‑point (50%) looks like a straight average; with Equal‑Power, mid‑point preserves perceived brightness.
- [X] Blend modes behave as expected on test pairs (white/black, primary colors) with no artifacts.
- [X] Switching curve or mode updates output immediately without frame drops.

---

## Slice 11 — Transitions framework
- [ ] Extend compositor with pluggable transitions: `crossfade`, `add`, `multiply`, `wipe`, `luma`.
- [ ] Small UI to choose transition and parameters.

Acceptance
- [ ] Switching transitions updates output immediately; parameters adjustable live.

---

## Slice 12 — Persistence
- [ ] Save/load bank layout and per‑slot options to localStorage (or JSON file via Electron IPC if needed).

Acceptance
- [ ] Restarting the app restores the previous session layout and settings.

---

## Slice 13 — Performance hardening
- [ ] Texture pooling; reuse FBOs; handle WebGL context loss.
- [ ] Cap video decode FPS and upload bandwidth; OffscreenCanvas where available.

Acceptance
- [ ] Stable performance at target resolution; no leaks after repeated source swaps.

---

## Slice 14 — MIDI/Keyboard mapping (optional)
- [ ] Simple learn mode; map crossfader/slots to MIDI CC/notes; store mappings.

Acceptance
- [ ] External controller smoothly drives crossfader and slot triggers.

---

## Slice 15 — Testing / QA
- [ ] Unit tests for store logic and source lifecycle; manual checklist across macOS.

Acceptance
- [ ] Green tests; manual pass on the checklist.
