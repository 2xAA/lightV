import type { ISource } from "./ISource";

export type FillMode = "cover" | "contain" | "stretch";

export class ImageSource implements ISource {
  id: string;
  type = "image" as const;
  label: string;
  private texture: WebGLTexture | null;
  private image: HTMLImageElement | null;
  private offs: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private outputW: number;
  private outputH: number;
  private fillMode: FillMode;

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
    this.label = label || `Image ${id}`;
    this.texture = null;
    this.image = null;
    this.offs = document.createElement("canvas");
    this.ctx = this.offs.getContext("2d") as CanvasRenderingContext2D;
    this.outputW = 0;
    this.outputH = 0;
    this.fillMode = (options?.fillMode as FillMode) || "cover";
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
      this.setFillMode((partial as any).fillMode as FillMode);
    }
  }

  async setFile(file: File): Promise<void> {
    // Prefer data URL to satisfy strict CSP without blob:
    const asDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(file);
    });
    const img = new Image();
    img.src = asDataUrl;
    await img.decode();
    this.image = img;
    this.redraw();
  }

  setOutputSize(w: number, h: number): void {
    if (w <= 0 || h <= 0) return;
    if (this.outputW === w && this.outputH === h) return;
    this.outputW = Math.floor(w);
    this.outputH = Math.floor(h);
    this.offs.width = this.outputW;
    this.offs.height = this.outputH;
    this.redraw();
  }

  setFillMode(mode: FillMode): void {
    this.fillMode = mode;
    this.redraw();
  }

  private redraw(): void {
    if (!this.image || !this.ctx || this.outputW === 0 || this.outputH === 0)
      return;
    const ctx = this.ctx;
    const W = this.outputW;
    const H = this.outputH;
    ctx.clearRect(0, 0, W, H);

    const iw = this.image.naturalWidth;
    const ih = this.image.naturalHeight;
    if (iw <= 0 || ih <= 0) return;

    let drawW = W;
    let drawH = H;

    if (this.fillMode === "stretch") {
      drawW = W;
      drawH = H;
    } else {
      if (this.fillMode === "cover") {
        // scale up so both dimensions cover the output, then center crop
        const scale = Math.max(W / iw, H / ih);
        drawW = Math.ceil(iw * scale);
        drawH = Math.ceil(ih * scale);
      } else {
        // contain: entire image visible, letterbox/pillarbox
        const scale = Math.min(W / iw, H / ih);
        drawW = Math.ceil(iw * scale);
        drawH = Math.ceil(ih * scale);
      }
    }

    const dx = Math.floor((W - drawW) / 2);
    const dy = Math.floor((H - drawH) / 2);
    ctx.drawImage(this.image, dx, dy, drawW, drawH);
  }

  load(gl: WebGL2RenderingContext): void {
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (this.offs.width > 0 && this.offs.height > 0) {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        this.offs,
      );
    } else {
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
    }
  }

  start(): void {}
  stop(): void {}

  dispose(gl: WebGL2RenderingContext): void {
    if (this.texture) {
      gl.deleteTexture(this.texture);
      this.texture = null;
    }
  }

  getTexture(gl: WebGL2RenderingContext): WebGLTexture | null {
    if (!this.texture) return null;
    // Upload latest composited frame if available
    if (this.offs.width > 0 && this.offs.height > 0) {
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        this.offs,
      );
    }
    return this.texture;
  }

  tick(_dtMs: number): void {}
}
