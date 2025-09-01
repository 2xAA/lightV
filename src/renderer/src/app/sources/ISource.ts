export type SourceType =
  | "mock"
  | "image"
  | "video"
  | "webcam"
  | "shader"
  | "syphon";

export interface ISourceOptions {
  [key: string]: unknown;
}

export interface ISource {
  id: string;
  type: SourceType;
  label: string;
  // lifecycle
  load(gl: WebGL2RenderingContext): Promise<void> | void;
  start(): void;
  stop(): void;
  dispose(gl: WebGL2RenderingContext): void;
  // rendering
  getTexture(gl: WebGL2RenderingContext): WebGLTexture | null;
  tick(dtMs: number): void;
  // optional flip for sampler
  getFlipY?(): boolean;
  // optional options API (to be expanded later)
  getOptionsSchema?(): Record<string, unknown>;
  setOptions?(partial: ISourceOptions): void;
}
