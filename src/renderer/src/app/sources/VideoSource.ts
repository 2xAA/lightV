import type { ISource } from "./ISource";

export type FillMode = "cover" | "contain" | "stretch";

export class VideoSource implements ISource {
  id: string;
  type = "video" as const;
  label: string;
  private texture: WebGLTexture | null;
  private video: HTMLVideoElement;
  private offs: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private outputW: number;
  private outputH: number;
  private fillMode: FillMode;
  private loop: boolean;
  private muted: boolean;
  private playbackRate: number;
  private playing: boolean;
  private gl: WebGL2RenderingContext | null;

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
    this.label = label || `Video ${id}`;
    this.texture = null;
    this.video = document.createElement("video");
    this.video.crossOrigin = "anonymous";
    this.video.preload = "auto";
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.loop = true;
    this.offs = document.createElement("canvas");
    this.ctx = this.offs.getContext("2d") as CanvasRenderingContext2D;
    this.outputW = 0;
    this.outputH = 0;
    this.fillMode = (options?.fillMode as FillMode) || "cover";
    this.loop = (options?.loop as boolean) ?? true;
    this.muted = (options?.muted as boolean) ?? true;
    this.playbackRate = (options?.playbackRate as number) ?? 1.0;
    this.playing = false;
    this.gl = null;
  }

  async setFile(file: File): Promise<void> {
    const url = URL.createObjectURL(file);
    this.video.src = url;
    this.video.loop = this.loop;
    this.video.muted = this.muted;
    this.video.playbackRate = this.playbackRate;
    await this.video.play().catch(() => {});
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
      {
        key: "loop",
        label: "Loop",
        type: "checkbox" as const,
        value: this.loop,
      },
      {
        key: "muted",
        label: "Muted",
        type: "checkbox" as const,
        value: this.muted,
      },
      {
        key: "playbackRate",
        label: "Playback rate",
        type: "number" as const,
        value: this.playbackRate,
        min: 0.25,
        max: 3,
        step: 0.25,
      },
    ];
  }

  setOptions(partial: { [key: string]: unknown }): void {
    if (partial.fillMode) this.fillMode = partial.fillMode as FillMode;
    if (typeof partial.loop === "boolean") this.loop = partial.loop as boolean;
    if (typeof partial.muted === "boolean")
      this.muted = partial.muted as boolean;
    if (typeof partial.playbackRate === "number")
      this.playbackRate = partial.playbackRate as number;
    this.video.loop = this.loop;
    this.video.muted = this.muted;
    this.video.playbackRate = this.playbackRate;
  }

  getContentSize(): { width: number; height: number } | null {
    const w = this.video.videoWidth;
    const h = this.video.videoHeight;
    if (w > 0 && h > 0) return { width: w, height: h };
    return null;
  }

  getFillMode(): FillMode {
    return this.fillMode;
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

  private redraw(): void {
    if (!this.ctx || this.outputW === 0 || this.outputH === 0) return;
    const ctx = this.ctx;
    const W = this.outputW;
    const H = this.outputH;
    ctx.clearRect(0, 0, W, H);

    const iw = this.video.videoWidth || 0;
    const ih = this.video.videoHeight || 0;
    if (iw <= 0 || ih <= 0) return;

    let drawW = W;
    let drawH = H;

    if (this.fillMode === "stretch") {
      drawW = W;
      drawH = H;
    } else {
      if (this.fillMode === "cover") {
        const scale = Math.max(W / iw, H / ih);
        drawW = Math.ceil(iw * scale);
        drawH = Math.ceil(ih * scale);
      } else {
        const scale = Math.min(W / iw, H / ih);
        drawW = Math.ceil(iw * scale);
        drawH = Math.ceil(ih * scale);
      }
    }

    const dx = Math.floor((W - drawW) / 2);
    const dy = Math.floor((H - drawH) / 2);
    ctx.drawImage(this.video, dx, dy, drawW, drawH);
  }

  load(gl: WebGL2RenderingContext): void {
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
  }

  start(): void {
    this.playing = true;
    if ((this.video as any).requestVideoFrameCallback) {
      const step = (_now: number, _meta: any) => {
        if (!this.playing) return;
        this.uploadFrame();
        (this.video as any).requestVideoFrameCallback(step);
      };
      (this.video as any).requestVideoFrameCallback(step);
    } else {
      const loop = () => {
        if (!this.playing) return;
        this.uploadFrame();
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
  }

  stop(): void {
    this.playing = false;
  }

  private uploadFrame(): void {
    if (!this.gl || !this.texture) return;
    const gl = this.gl;
    this.redraw();
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

  tick(_dtMs: number): void {}
}
