import { Quad } from "./fabric-manager";

export class WebGLRenderer {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext | null;
  program: WebGLProgram | null;
  sourceTexture: WebGLTexture | null;
  framebuffer: WebGLFramebuffer | undefined;
  outputTexture: WebGLTexture | undefined;
  _positionBuffer: WebGLBuffer | undefined;
  _texCoordBuffer: WebGLBuffer | undefined;
  _samplesPerEdge: number;

  constructor(canvas) {
    this.canvas = canvas;
    this.gl = null;
    this.program = null;
    this.sourceTexture = null;
    this._samplesPerEdge = 20;

    this.init();
  }

  setSamplesPerEdge(n) {
    const v = Math.max(1, Math.min(64, Math.floor(Number(n) || 1)));
    this._samplesPerEdge = v;
  }

  async init() {
    // Get WebGL context
    this.gl = this.canvas.getContext("webgl2");
    if (!this.gl) {
      throw new Error("WebGL 2.0 not supported");
    }

    // Create shader program
    this.program = (await this.createShaderProgram()) ?? null;

    // Set up framebuffer for color calculations
    this.setupFramebuffer();

    // Set viewport
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    // Create shared fullscreen quad buffers
    this._initFullscreenQuad();

    // Create empty source texture placeholder
    this.sourceTexture = this.gl.createTexture();
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.sourceTexture);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      this.canvas.width,
      this.canvas.height,
      0,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      null,
    );
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_MIN_FILTER,
      this.gl.NEAREST,
    );
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_MAG_FILTER,
      this.gl.NEAREST,
    );
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_WRAP_S,
      this.gl.CLAMP_TO_EDGE,
    );
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_WRAP_T,
      this.gl.CLAMP_TO_EDGE,
    );
  }

  resize(width, height) {
    if (!this.gl) return;
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.gl.viewport(0, 0, w, h);
      // Resize source texture to match
      this.gl.bindTexture(this.gl.TEXTURE_2D, this.sourceTexture);
      this.gl.texImage2D(
        this.gl.TEXTURE_2D,
        0,
        this.gl.RGBA,
        w,
        h,
        0,
        this.gl.RGBA,
        this.gl.UNSIGNED_BYTE,
        null,
      );
    }
  }

  _initFullscreenQuad() {
    const positions = new Float32Array([
      -1, -1, -1, 1, 1, -1, -1, 1, 1, -1, 1, 1,
    ]);
    const texCoords = new Float32Array([0, 1, 0, 0, 1, 1, 0, 0, 1, 1, 1, 0]);
    this._positionBuffer = this.gl?.createBuffer();
    if (!this._positionBuffer) return;

    this.gl?.bindBuffer(this.gl.ARRAY_BUFFER, this._positionBuffer);
    this.gl?.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.STATIC_DRAW);

    this._texCoordBuffer = this.gl?.createBuffer();
    if (!this._texCoordBuffer) return;

    this.gl?.bindBuffer(this.gl.ARRAY_BUFFER, this._texCoordBuffer);
    this.gl?.bufferData(this.gl.ARRAY_BUFFER, texCoords, this.gl.STATIC_DRAW);
  }

  async createShaderProgram() {
    const vertexShaderSource = `#version 300 es
        in vec2 a_position;
        in vec2 a_texCoord;
        out vec2 v_texCoord;

        void main() {
            gl_Position = vec4(a_position, 0.0, 1.0);
            v_texCoord = a_texCoord;
        }`;

    const fragmentShaderSource = `#version 300 es
        precision highp float;

        in vec2 v_texCoord;
        out vec4 fragColor;

        uniform sampler2D u_image;
        uniform int u_regionCount;
        uniform vec4 u_regions[32]; // x,y,w,h normalized (fallback)
        uniform vec4 u_p0[32];      // p0.xy, unused zw
        uniform vec4 u_u[32];       // u.xy, unused zw
        uniform vec4 u_v[32];       // v.xy, unused zw
        uniform int u_useOriented;  // 0: axis-aligned, 1: oriented rects
        uniform int u_mode;         // 0: display, 1: calculate
        uniform vec2 u_canvasSize;  // pixel size for mapping
        uniform int u_statistic;    // 0: average, 1: mode (dominant)
        uniform int u_samples;      // samples per edge

        int binIndex(vec3 rgb) {
            // rgb in [0,1]
            int r = int(floor(clamp(rgb.r, 0.0, 1.0) * 7.999)); // 0..7
            int g = int(floor(clamp(rgb.g, 0.0, 1.0) * 7.999));
            int b = int(floor(clamp(rgb.b, 0.0, 1.0) * 7.999));
            return (r * 64) + (g * 8) + b; // 0..511
        }
        float rand(float x) {
            return fract(sin(x * 12.9898) * 43758.5453);
        }
        vec3 binCenter(int idx) {
            int r = idx / 64;
            int g = (idx / 8) % 8;
            int b = idx % 8;
            return vec3((float(r)+0.5)/8.0, (float(g)+0.5)/8.0, (float(b)+0.5)/8.0);
        }

        vec3 sampleOrientedRectAverage(int idx) {
            vec2 p0 = u_p0[idx].xy / u_canvasSize; // to [0,1]
            vec2 U = u_u[idx].xy / u_canvasSize;
            vec2 V = u_v[idx].xy / u_canvasSize;

            vec3 totalColor = vec3(0.0);
            float samples = 0.0;
            float n = float(max(u_samples, 1));
            float step = 1.0 / n;
            float start = step * 0.5; // sample at cell centers
            for (float su = start; su < 1.0; su += step) {
                for (float sv = start; sv < 1.0; sv += step) {
                    vec2 uv = p0 + su * U + sv * V;
                    vec3 c = texture(u_image, uv).rgb;
                    totalColor += c;
                    samples += 1.0;
                }
            }
            return totalColor / max(samples, 1.0);
        }

        vec3 sampleOrientedRectMode(int idx) {
            vec2 p0 = u_p0[idx].xy / u_canvasSize; // to [0,1]
            vec2 U = u_u[idx].xy / u_canvasSize;
            vec2 V = u_v[idx].xy / u_canvasSize;

            const int BINS = 512; // 3 bits per channel
            float count[BINS];
            float sumR[BINS];
            float sumG[BINS];
            float sumB[BINS];
            for (int i = 0; i < BINS; ++i) { count[i] = 0.0; sumR[i] = 0.0; sumG[i] = 0.0; sumB[i] = 0.0; }

            float n = float(max(u_samples, 1));
            float step = 1.0 / n;
            float start = step * 0.5; // sample at cell centers
            for (float su = start; su < 1.0; su += step) {
                for (float sv = start; sv < 1.0; sv += step) {
                    vec2 uv = p0 + su * U + sv * V;
                    vec3 c = texture(u_image, uv).rgb;
                    int k = binIndex(c);
                    count[k] += 1.0;
                    sumR[k] += c.r;
                    sumG[k] += c.g;
                    sumB[k] += c.b;
                }
            }

            int best = 0;
            float bestCount = -1.0;
            float bestLuma = -1.0;
            for (int i = 0; i < BINS; ++i) {
                if (count[i] > 0.0) {
                    float luma = (sumR[i] * 0.2126 + sumG[i] * 0.7152 + sumB[i] * 0.0722) / max(count[i], 1.0);
                    if (count[i] > bestCount || (count[i] == bestCount && luma > bestLuma)) {
                        bestCount = count[i];
                        bestLuma = luma;
                        best = i;
                    }
                }
            }
            float denom = max(bestCount, 1.0);
            return vec3(sumR[best] / denom, sumG[best] / denom, sumB[best] / denom);
        }

        vec3 sampleOrientedRectMaxLuma(int idx) {
            vec2 p0 = u_p0[idx].xy / u_canvasSize; // to [0,1]
            vec2 U = u_u[idx].xy / u_canvasSize;
            vec2 V = u_v[idx].xy / u_canvasSize;

            vec3 bestColor = vec3(0.0);
            float bestLuma = -1.0;
            float n = float(max(u_samples, 1));
            float step = 1.0 / n;
            float start = step * 0.5; // sample at cell centers
            for (float su = start; su < 1.0; su += step) {
                for (float sv = start; sv < 1.0; sv += step) {
                    vec2 uv = p0 + su * U + sv * V;
                    vec3 c = texture(u_image, uv).rgb;
                    float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
                    if (luma > bestLuma) {
                        bestLuma = luma;
                        bestColor = c;
                    }
                }
            }
            return bestColor;
        }

        vec3 sampleAxisAlignedAverage(vec4 region) {
            vec3 totalColor = vec3(0.0);
            float sampleCount = 0.0;
            float n = float(max(u_samples, 1));
            float step = 1.0 / n;
            for (float x = region.x; x <= region.x + region.z; x += step * region.z) {
                for (float y = region.y; y <= region.y + region.w; y += step * region.w) {
                    if (x <= region.x + region.z && y <= region.y + region.w) {
                        vec3 pixelColor = texture(u_image, vec2(x, y)).rgb;
                        totalColor += pixelColor;
                        sampleCount += 1.0;
                    }
                }
            }
            return sampleCount > 0.0 ? totalColor / sampleCount : vec3(0.0);
        }

        vec3 sampleAxisAlignedMode(vec4 region) {
            const int BINS = 512;
            float count[BINS];
            float sumR[BINS];
            float sumG[BINS];
            float sumB[BINS];
            for (int i = 0; i < BINS; ++i) { count[i] = 0.0; sumR[i] = 0.0; sumG[i] = 0.0; sumB[i] = 0.0; }
            float n = float(max(u_samples, 1));
            float step = 1.0 / n;
            for (float x = region.x; x <= region.x + region.z; x += step * region.z) {
                for (float y = region.y; y <= region.y + region.w; y += step * region.w) {
                    if (x <= region.x + region.z && y <= region.y + region.w) {
                        vec3 pixelColor = texture(u_image, vec2(x, y)).rgb;
                        int k = binIndex(pixelColor);
                        count[k] += 1.0;
                        sumR[k] += pixelColor.r;
                        sumG[k] += pixelColor.g;
                        sumB[k] += pixelColor.b;
                    }
                }
            }
            int best = 0;
            float bestCount = -1.0;
            float bestLuma = -1.0;
            for (int i = 0; i < BINS; ++i) {
                if (count[i] > 0.0) {
                    float luma = (sumR[i] * 0.2126 + sumG[i] * 0.7152 + sumB[i] * 0.0722) / max(count[i], 1.0);
                    if (count[i] > bestCount || (count[i] == bestCount && luma > bestLuma)) {
                        bestCount = count[i];
                        bestLuma = luma;
                        best = i;
                    }
                }
            }
            float denom = max(bestCount, 1.0);
            return vec3(sumR[best] / denom, sumG[best] / denom, sumB[best] / denom);
        }

        void main() {
            if (u_mode == 0) {
                fragColor = texture(u_image, v_texCoord);
            } else {
                int regionIndex = int(floor(v_texCoord.x * float(u_regionCount)));
                if (regionIndex < u_regionCount && regionIndex >= 0) {
                    vec3 resultColor;
                    if (u_useOriented == 1) {
                        if (u_statistic == 1) {
                            resultColor = sampleOrientedRectMode(regionIndex);
                        } else if (u_statistic == 2) {
                            resultColor = sampleOrientedRectMaxLuma(regionIndex);
                        } else {
                            resultColor = sampleOrientedRectAverage(regionIndex);
                        }
                    } else {
                        vec4 region = u_regions[regionIndex];
                        if (u_statistic == 1) {
                            resultColor = sampleAxisAlignedMode(region);
                        } else if (u_statistic == 2) {
                            // Approximate max-luma by a denser grid search on axis-aligned rect
                            vec3 bestColor = vec3(0.0);
                            float bestLuma = -1.0;
                            float n = float(max(u_samples, 1));
                            float step = 1.0 / n;
                            for (float x = region.x; x <= region.x + region.z; x += step * region.z) {
                                for (float y = region.y; y <= region.y + region.w; y += step * region.w) {
                                    if (x <= region.x + region.z && y <= region.y + region.w) {
                                        vec3 c = texture(u_image, vec2(x, y)).rgb;
                                        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
                                        if (l > bestLuma) { bestLuma = l; bestColor = c; }
                                    }
                                }
                            }
                            resultColor = bestColor;
                        } else {
                            resultColor = sampleAxisAlignedAverage(region);
                        }
                    }
                    fragColor = vec4(resultColor, 1.0);
                } else {
                    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
                }
            }
        }`;

    const vertexShader = this.createShader(
      this.gl?.VERTEX_SHADER,
      vertexShaderSource,
    );
    const fragmentShader = this.createShader(
      this.gl?.FRAGMENT_SHADER,
      fragmentShaderSource,
    );

    const program = this.gl?.createProgram();
    if (!program || !vertexShader || !fragmentShader) return;

    this.gl?.attachShader(program, vertexShader);
    this.gl?.attachShader(program, fragmentShader);
    this.gl?.linkProgram(program);

    if (!this.gl?.getProgramParameter(program, this.gl.LINK_STATUS)) {
      throw new Error(
        "Failed to link shader program: " + this.gl?.getProgramInfoLog(program),
      );
    }

    return program;
  }

  createShader(type, source) {
    const shader = this.gl?.createShader(type);
    if (!shader) return;

    this.gl?.shaderSource(shader, source);
    this.gl?.compileShader(shader);

    if (!this.gl?.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      const error = this.gl?.getShaderInfoLog(shader);
      this.gl?.deleteShader(shader);
      throw new Error(`Shader compilation error: ${error}`);
    }

    return shader;
  }

  setupFramebuffer() {
    // Create framebuffer for off-screen rendering
    this.framebuffer = this.gl?.createFramebuffer();

    // Create output texture
    this.outputTexture = this.gl?.createTexture();
    if (!this.outputTexture) return;

    this.gl?.bindTexture(this.gl.TEXTURE_2D, this.outputTexture);
    this.gl?.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      32,
      1,
      0,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      null,
    );
    this.gl?.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_MIN_FILTER,
      this.gl.NEAREST,
    );
    this.gl?.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_MAG_FILTER,
      this.gl.NEAREST,
    );

    // Attach texture to framebuffer
    this.gl?.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer ?? null);
    this.gl?.framebufferTexture2D(
      this.gl.FRAMEBUFFER,
      this.gl.COLOR_ATTACHMENT0,
      this.gl.TEXTURE_2D,
      this.outputTexture,
      0,
    );

    // Check framebuffer completeness
    if (
      this.gl?.checkFramebufferStatus(this.gl.FRAMEBUFFER) !==
      this.gl?.FRAMEBUFFER_COMPLETE
    ) {
      throw new Error("Framebuffer is not complete");
    }

    this.gl?.bindFramebuffer(this.gl.FRAMEBUFFER, null);
  }

  updateFromCanvas(sourceCanvas) {
    // Upload the canvas pixels to the texture
    this.gl?.bindTexture(this.gl.TEXTURE_2D, this.sourceTexture);
    this.gl?.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, 0);
    this.gl?.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      sourceCanvas,
    );
    this.gl?.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_MIN_FILTER,
      this.gl.NEAREST,
    );
    this.gl?.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_MAG_FILTER,
      this.gl.NEAREST,
    );
    this.gl?.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_WRAP_S,
      this.gl.CLAMP_TO_EDGE,
    );
    this.gl?.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_WRAP_T,
      this.gl.CLAMP_TO_EDGE,
    );
  }

  renderSource() {
    // Use shader program
    this.gl?.useProgram(this.program);

    if (!this.program) return;

    // Attributes
    const positionLocation =
      this.gl?.getAttribLocation(this.program, "a_position") ?? -1;
    const texCoordLocation =
      this.gl?.getAttribLocation(this.program, "a_texCoord") ?? -1;
    this.gl?.bindBuffer(this.gl.ARRAY_BUFFER, this._positionBuffer ?? null);
    this.gl?.enableVertexAttribArray(positionLocation);
    this.gl?.vertexAttribPointer(
      positionLocation,
      2,
      this.gl.FLOAT,
      false,
      0,
      0,
    );
    this.gl?.bindBuffer(this.gl.ARRAY_BUFFER, this._texCoordBuffer ?? null);
    this.gl?.enableVertexAttribArray(texCoordLocation);
    this.gl?.vertexAttribPointer(
      texCoordLocation,
      2,
      this.gl.FLOAT,
      false,
      0,
      0,
    );

    // Uniforms
    const imageLocation = this.gl?.getUniformLocation(this.program, "u_image");
    const modeLocation = this.gl?.getUniformLocation(this.program, "u_mode");
    const regionCountLocation = this.gl?.getUniformLocation(
      this.program,
      "u_regionCount",
    );
    const statLocation = this.gl?.getUniformLocation(
      this.program,
      "u_statistic",
    );
    const samplesLocation = this.gl?.getUniformLocation(
      this.program,
      "u_samples",
    );

    this.gl?.activeTexture(this.gl.TEXTURE0);
    this.gl?.bindTexture(this.gl.TEXTURE_2D, this.sourceTexture);
    this.gl?.uniform1i(imageLocation ?? null, 0);
    this.gl?.uniform1i(modeLocation ?? null, 0); // Display mode
    this.gl?.uniform1i(regionCountLocation ?? null, 0);
    this.gl?.uniform1i(statLocation ?? null, 0);
    this.gl?.uniform1i(samplesLocation ?? null, this._samplesPerEdge);

    // Render to canvas
    this.gl?.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl?.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.gl?.drawArrays(this.gl.TRIANGLES, 0, 6);
  }

  calculateAverageColors(regionBounds, orientedQuads: Quad[] = []) {
    return this.calculateColors(regionBounds, orientedQuads, "average");
  }

  calculateColors(
    regionBounds,
    orientedQuads: Quad[] = [],
    method = "average",
  ) {
    if (
      (!regionBounds || regionBounds.length === 0) &&
      (!orientedQuads || orientedQuads.length === 0)
    )
      return [];

    const maxRegions = 32;
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;

    const useOrientedRaw =
      Array.isArray(orientedQuads) && orientedQuads.length > 0;
    const validQuads = useOrientedRaw
      ? orientedQuads.filter(
          (q) =>
            q &&
            q.p0 &&
            q.u &&
            q.v &&
            isFinite(q.p0.x) &&
            isFinite(q.p0.y) &&
            isFinite(q.u.x) &&
            isFinite(q.u.y) &&
            isFinite(q.v.x) &&
            isFinite(q.v.y),
        )
      : [];
    const useOriented = validQuads.length > 0;
    const count = useOriented
      ? Math.min(validQuads.length, maxRegions)
      : Math.min(regionBounds.length, maxRegions);

    const regionData = new Float32Array(maxRegions * 4);
    const p0Data = new Float32Array(maxRegions * 4);
    const uData = new Float32Array(maxRegions * 4);
    const vData = new Float32Array(maxRegions * 4);

    if (useOriented) {
      for (let i = 0; i < count; i++) {
        const q = validQuads[i];
        p0Data[i * 4] = q.p0.x;
        p0Data[i * 4 + 1] = q.p0.y;
        uData[i * 4] = q.u.x;
        uData[i * 4 + 1] = q.u.y;
        vData[i * 4] = q.v.x;
        vData[i * 4 + 1] = q.v.y;
      }
    } else {
      for (let i = 0; i < count; i++) {
        const b = regionBounds[i];
        regionData[i * 4] = b.x / canvasWidth;
        regionData[i * 4 + 1] = b.y / canvasHeight;
        regionData[i * 4 + 2] = b.width / canvasWidth;
        regionData[i * 4 + 3] = b.height / canvasHeight;
      }
    }

    this.gl?.useProgram(this.program);

    if (!this.program) return;

    const imageLocation = this.gl?.getUniformLocation(this.program, "u_image");
    const modeLocation = this.gl?.getUniformLocation(this.program, "u_mode");
    const regionCountLocation = this.gl?.getUniformLocation(
      this.program,
      "u_regionCount",
    );
    const regionsLocation = this.gl?.getUniformLocation(
      this.program,
      "u_regions",
    );
    const p0Location = this.gl?.getUniformLocation(this.program, "u_p0");
    const uLocation = this.gl?.getUniformLocation(this.program, "u_u");
    const vLocation = this.gl?.getUniformLocation(this.program, "u_v");
    const useOrientedLocation = this.gl?.getUniformLocation(
      this.program,
      "u_useOriented",
    );
    const canvasSizeLocation = this.gl?.getUniformLocation(
      this.program,
      "u_canvasSize",
    );
    const statLocation = this.gl?.getUniformLocation(
      this.program,
      "u_statistic",
    );
    const samplesLocation = this.gl?.getUniformLocation(
      this.program,
      "u_samples",
    );

    this.gl?.activeTexture(this.gl.TEXTURE0);
    this.gl?.bindTexture(this.gl.TEXTURE_2D, this.sourceTexture);
    this.gl?.uniform1i(imageLocation ?? null, 0);
    this.gl?.uniform1i(modeLocation ?? null, 1);
    this.gl?.uniform1i(regionCountLocation ?? null, count);
    this.gl?.uniform2f(canvasSizeLocation ?? null, canvasWidth, canvasHeight);
    this.gl?.uniform1i(useOrientedLocation ?? null, useOriented ? 1 : 0);
    this.gl?.uniform1i(
      statLocation ?? null,
      method === "mode" ? 1 : method === "maxluma" ? 2 : 0,
    );
    this.gl?.uniform1i(samplesLocation ?? null, this._samplesPerEdge);
    if (useOriented) {
      this.gl?.uniform4fv(p0Location ?? null, p0Data);
      this.gl?.uniform4fv(uLocation ?? null, uData);
      this.gl?.uniform4fv(vLocation ?? null, vData);
    } else {
      this.gl?.uniform4fv(regionsLocation ?? null, regionData);
    }

    this.gl?.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer ?? null);
    this.gl?.viewport(0, 0, count, 1);
    this.gl?.drawArrays(this.gl.TRIANGLES, 0, 6);

    const pixels = new Uint8Array(count * 4);
    this.gl?.readPixels(
      0,
      0,
      count,
      1,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      pixels,
    );

    const colors: { r: number; g: number; b: number; hex: string }[] = [];
    for (let i = 0; i < count; i++) {
      const r = pixels[i * 4];
      const g = pixels[i * 4 + 1];
      const b = pixels[i * 4 + 2];
      colors.push({ r, g, b, hex: this.rgbToHex(r, g, b) });
    }

    this.gl?.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl?.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.renderSource();

    return colors;
  }

  rgbToHex(r, g, b) {
    return (
      "#" +
      [r, g, b]
        .map((x) => {
          const hex = x.toString(16);
          return hex.length === 1 ? "0" + hex : hex;
        })
        .join("")
    );
  }
}
