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

export type OptionField = {
  key: string;
  label: string;
  type: "select" | "checkbox" | "number" | "text";
  value: unknown;
  options?: Array<{ label: string; value: unknown }>;
  min?: number;
  max?: number;
  step?: number;
};

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
  // optional metadata for layout
  getContentSize?(): { width: number; height: number } | null;
  getFillMode?(): "cover" | "contain" | "stretch";
  // options API
  getOptionsSchema?(): OptionField[];
  setOptions?(partial: ISourceOptions): Promise<void> | void;
}
