import type { ISource } from "./ISource";

export class MockSource implements ISource {
  id: string;
  type = "mock" as const;
  label: string;
  private texture: WebGLTexture | null;
  private rgb: [number, number, number];
  private running: boolean;
  private time: number;

  constructor({
    id,
    label,
    options,
  }: {
    id: string;
    label?: string;
    options?: Record<string, unknown>;
  }) {
    this.id = id;
    this.label = label || `Mock ${id}`;
    const color = (options?.color as [number, number, number]) || [255, 0, 255];
    this.rgb = color;
    this.texture = null;
    this.running = false;
    this.time = 0;
  }

  load(gl: WebGL2RenderingContext): void {
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([this.rgb[0], this.rgb[1], this.rgb[2], 255]),
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  start(): void {
    this.running = true;
  }

  stop(): void {
    this.running = false;
  }

  dispose(gl: WebGL2RenderingContext): void {
    if (this.texture) {
      gl.deleteTexture(this.texture);
      this.texture = null;
    }
  }

  getTexture(_gl: WebGL2RenderingContext): WebGLTexture | null {
    return this.texture;
  }

  tick(dtMs: number): void {
    if (!this.running) return;
    this.time += dtMs;
  }

  setColor(gl: WebGL2RenderingContext, rgb: [number, number, number]): void {
    this.rgb = rgb;
    if (!this.texture) return;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([rgb[0], rgb[1], rgb[2], 255]),
    );
  }
}
