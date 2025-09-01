import type { ISource } from "./ISource";

export type FillMode = "cover" | "contain" | "stretch";

export class SyphonSource implements ISource {
  id: string;
  type = "syphon" as const;
  label: string;
  private texture: WebGLTexture | null;
  private running: boolean;
  private width: number;
  private height: number;
  private fetchInFlight: boolean;
  private gl: WebGL2RenderingContext | null;
  private clientId: number | null;
  private serverIndex: number | null;
  private fillMode: FillMode;

  constructor({
    id,
    label,
    serverIndex,
  }: {
    id: string;
    label?: string;
    serverIndex?: number;
  }) {
    this.id = id;
    this.label = label || `Syphon ${id}`;
    this.texture = null;
    this.running = false;
    this.width = 0;
    this.height = 0;
    this.fetchInFlight = false;
    this.gl = null;
    this.clientId = null;
    this.serverIndex = serverIndex ?? null;
    this.fillMode = "cover";
  }

  getFlipY(): boolean {
    return true;
  }

  getContentSize(): { width: number; height: number } | null {
    if (this.width > 0 && this.height > 0)
      return { width: this.width, height: this.height };
    return null;
  }

  getFillMode(): FillMode {
    return this.fillMode;
  }

  getOptionsSchema() {
    return [
      {
        key: "fillMode",
        label: "Fill mode",
        type: "select" as const,
        value: this.fillMode,
        options: [
          { label: "Cover", value: "cover" },
          { label: "Contain", value: "contain" },
          { label: "Stretch", value: "stretch" },
        ],
      },
    ];
  }

  setOptions(partial: { [key: string]: unknown }): void {
    if (partial && (partial as any).fillMode) {
      this.fillMode = (partial as any).fillMode as FillMode;
    }
  }

  async setServerIndex(index: number): Promise<void> {
    this.serverIndex = index;
    if (this.clientId != null) {
      await window.syphon.destroyClient(this.clientId);
      this.clientId = null;
    }
    if (typeof index === "number" && index >= 0) {
      this.clientId = await window.syphon.createClient(index);
    }
  }

  async load(gl: WebGL2RenderingContext): Promise<void> {
    this.gl = gl;
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 255]),
    );

    if (this.serverIndex != null) {
      this.clientId = await window.syphon.createClient(this.serverIndex);
    }
  }

  start(): void {
    this.running = true;
    if (window.syphon && typeof window.syphon.start === "function") {
      window.syphon.start();
    }
  }

  stop(): void {
    this.running = false;
  }

  dispose(gl: WebGL2RenderingContext): void {
    if (this.texture) {
      gl.deleteTexture(this.texture);
      this.texture = null;
    }
    if (this.clientId != null) {
      window.syphon.destroyClient(this.clientId);
      this.clientId = null;
    }
  }

  getTexture(_gl: WebGL2RenderingContext): WebGLTexture | null {
    return this.texture;
  }

  private uploadFrame(buffer: Uint8Array, w: number, h: number): void {
    if (!this.gl || !this.texture) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (w !== this.width || h !== this.height) {
      this.width = w;
      this.height = h;
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        w,
        h,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        buffer,
      );
    } else {
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        w,
        h,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        buffer,
      );
    }
  }

  tick(_dtMs: number): void {
    if (!this.running) return;
    if (this.fetchInFlight) return;
    if (this.clientId == null) return;
    if (
      !window.syphon ||
      typeof window.syphon.pullFrameForClient !== "function"
    )
      return;
    this.fetchInFlight = true;
    window.syphon
      .pullFrameForClient(this.clientId)
      .then((frame) => {
        if (!frame) return;
        const u8 = new Uint8Array(frame.buffer);
        if (
          frame.width > 0 &&
          frame.height > 0 &&
          u8.length >= frame.width * frame.height * 4
        ) {
          this.uploadFrame(u8, frame.width, frame.height);
        }
      })
      .finally(() => {
        this.fetchInFlight = false;
      });
  }
}
