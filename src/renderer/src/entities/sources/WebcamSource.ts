import type { ISource } from "./ISource";
import type { FillMode } from "./FillMode";

export class WebcamSource implements ISource {
  id: string;
  type = "webcam" as const;
  label: string;
  private texture: WebGLTexture | null;
  private video: HTMLVideoElement;
  private offs: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private outputW: number;
  private outputH: number;
  private fillMode: FillMode;
  private deviceId: string | undefined;
  private stream: MediaStream | null;
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
    this.label = label || `Webcam ${id}`;
    this.texture = null;
    this.video = document.createElement("video");
    this.video.autoplay = true;
    this.video.playsInline = true;
    this.video.muted = true;
    this.offs = document.createElement("canvas");
    this.ctx = this.offs.getContext("2d") as CanvasRenderingContext2D;
    this.outputW = 0;
    this.outputH = 0;
    this.fillMode = (options?.fillMode as FillMode) || "cover";
    this.deviceId = (options?.deviceId as string) || undefined;
    this.stream = null;
    this.playing = false;
    this.gl = null;
  }

  async listDevices(): Promise<MediaDeviceInfo[]> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "videoinput");
  }

  getOptionsSchema() {
    const fields = [
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
    return fields;
  }

  async setOptions(partial: { [key: string]: unknown }): Promise<void> {
    if (partial.fillMode) this.fillMode = partial.fillMode as FillMode;
    if (partial.deviceId && typeof partial.deviceId === "string") {
      this.deviceId = partial.deviceId as string;
      await this.restartStream();
    }
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

  async ensureStream(): Promise<void> {
    if (this.stream) return;
    const constraints: MediaStreamConstraints = {
      video: this.deviceId ? { deviceId: { exact: this.deviceId } } : true,
      audio: false,
    };
    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.video.srcObject = this.stream;
    await this.video.play().catch(() => {});
  }

  async restartStream(): Promise<void> {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.video.srcObject = null;
    await this.ensureStream();
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
    const loop = () => {
      if (!this.playing) return;
      this.uploadFrame();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    this.ensureStream();
  }

  stop(): void {
    this.playing = false;
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.video.srcObject = null;
  }

  private uploadFrame(): void {
    if (!this.texture || !this.gl) return;
    this.redraw();
    if (this.offs.width > 0 && this.offs.height > 0) {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
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
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.video.srcObject = null;
  }

  getTexture(_gl: WebGL2RenderingContext): WebGLTexture | null {
    return this.texture;
  }

  tick(_dtMs: number): void {}
}
