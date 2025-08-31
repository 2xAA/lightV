/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-unused-vars */
export class Canvas2DSource {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.mode = "quadrants"; // 'quadrants' | 'gradient' | 'diagonal' | 'video' | 'syphon'
    this._lastTime = 0;
    this.video = document.createElement("video");
    this.video.src = "/Big_Buck_Bunny_1080_10s_1MB.mp4";
    this.video.crossOrigin = "anonymous";
    this.video.muted = true;
    this.video.loop = true;
    this.video.play();

    // Syphon integration
    this._syphonUnsub = null;
    this._syphonBuffer = null; // Uint8Array
    this._syphonWidth = 0;
    this._syphonHeight = 0;
    this._syphonTempCanvas = document.createElement("canvas");
    this._syphonTempCtx = this._syphonTempCanvas.getContext("2d");
    this.syphonFlipY = true;
  }

  setMode(mode) {
    if (this.mode === mode) return;

    // Manage syphon subscription boundaries
    if (this.mode === "syphon" && this._syphonUnsub) {
      try {
        this._syphonUnsub();
      } catch (_) {
        /* no-op */
      }
      this._syphonUnsub = null;
    }

    this.mode = mode;

    if (
      this.mode === "syphon" &&
      window.syphon &&
      typeof window.syphon.onFrame === "function"
    ) {
      this._syphonUnsub = window.syphon.onFrame(({ buffer, width, height }) => {
        this._syphonBuffer = buffer;
        this._syphonWidth = width;
        this._syphonHeight = height;
      });
      // Kick off discovery if needed
      if (typeof window.syphon.start === "function") {
        window.syphon.start();
      }
    }
  }

  resize(width, height) {
    if (typeof width === "number" && typeof height === "number") {
      this.canvas.width = Math.max(1, Math.floor(width));
      this.canvas.height = Math.max(1, Math.floor(height));
    }
  }

  draw(timeMs) {
    const bgCtx = this.ctx;
    const backgroundCanvas = this.canvas;
    const w = backgroundCanvas.width;
    const h = backgroundCanvas.height;

    if (this.mode === "quadrants") {
      const cellWidth = w / 2;
      const cellHeight = h / 2;

      bgCtx.fillStyle = "#ff0000";
      bgCtx.fillRect(0, 0, cellWidth, cellHeight);

      bgCtx.fillStyle = "#00ff00";
      bgCtx.fillRect(cellWidth, 0, cellWidth, cellHeight);

      bgCtx.fillStyle = "#0000ff";
      bgCtx.fillRect(0, cellHeight, cellWidth, cellHeight);

      bgCtx.fillStyle = "#ffffff";
      bgCtx.fillRect(cellWidth, cellHeight, cellWidth, cellHeight);
    } else if (this.mode === "gradient") {
      const gradient = bgCtx.createLinearGradient(0, 0, w, h);
      const hue = timeMs * 0.02;
      gradient.addColorStop(0, `hsl(${hue % 360},100%,50%)`);
      gradient.addColorStop(0.5, `hsl(${(hue + 120) % 360},100%,50%)`);
      gradient.addColorStop(1, `hsl(${(hue + 240) % 360},100%,50%)`);
      bgCtx.fillStyle = gradient;
      bgCtx.fillRect(0, 0, w, h);
    } else if (this.mode === "video") {
      bgCtx.drawImage(this.video, 0, 0, w, h);
    } else if (this.mode === "syphon") {
      // Draw the most recent Syphon frame if available
      if (
        this._syphonBuffer &&
        this._syphonWidth > 0 &&
        this._syphonHeight > 0
      ) {
        const frameW = this._syphonWidth;
        const frameH = this._syphonHeight;

        if (this._syphonTempCanvas.width !== frameW)
          this._syphonTempCanvas.width = frameW;
        if (this._syphonTempCanvas.height !== frameH)
          this._syphonTempCanvas.height = frameH;

        const clamped = new Uint8ClampedArray(this._syphonBuffer.length);
        clamped.set(this._syphonBuffer);
        const imageData = new ImageData(clamped, frameW, frameH);
        this._syphonTempCtx.putImageData(imageData, 0, 0);

        // Scale (and optionally flip) to background canvas
        bgCtx.clearRect(0, 0, w, h);
        if (this.syphonFlipY) {
          bgCtx.save();
          bgCtx.scale(1, -1);
          bgCtx.drawImage(this._syphonTempCanvas, 0, -h);
          bgCtx.restore();
        } else {
          bgCtx.drawImage(this._syphonTempCanvas, 0, 0);
        }
      } else {
        // No frame yet
        bgCtx.clearRect(0, 0, w, h);
      }
    } else {
      // Diagonal stripes at 45deg alternating red/blue for rotation accuracy tests
      bgCtx.clearRect(0, 0, w, h);
      const stripe = Math.max(8, Math.floor(Math.min(w, h) / 20));
      bgCtx.save();
      bgCtx.translate(w / 2, h / 2);
      bgCtx.rotate(Math.PI / 4);
      bgCtx.translate(-w / 2, -h / 2);
      const span = w + h; // cover fully when rotated
      for (let x = -span; x < span * 2; x += stripe) {
        bgCtx.fillStyle =
          (Math.floor(x / stripe) & 1) === 0 ? "#ff0000" : "#0000ff";
        bgCtx.fillRect(x, -h, stripe, h * 3);
      }
      bgCtx.restore();
    }
  }

  tick(timeMs) {
    this.draw(timeMs);
  }
}
