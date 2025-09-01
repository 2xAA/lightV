export class Compositor {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext | null;
  program: WebGLProgram | null;
  positionBuffer: WebGLBuffer | null;
  texCoordBuffer: WebGLBuffer | null;
  texA: WebGLTexture | null;
  texB: WebGLTexture | null;
  mixLocation: WebGLUniformLocation | null;
  aPosLoc: number;
  aUvLoc: number;
  uTexALoc: WebGLUniformLocation | null;
  uTexBLoc: WebGLUniformLocation | null;
  uFlipYALoc: WebGLUniformLocation | null;
  uFlipYBLoc: WebGLUniformLocation | null;
  uUvRectALoc: WebGLUniformLocation | null;
  uUvRectBLoc: WebGLUniformLocation | null;
  _mix: number;
  uModeLoc: WebGLUniformLocation | null;
  _mode: number;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.gl = null;
    this.program = null;
    this.positionBuffer = null;
    this.texCoordBuffer = null;
    this.texA = null;
    this.texB = null;
    this.mixLocation = null;
    this.aPosLoc = -1;
    this.aUvLoc = -1;
    this.uTexALoc = null;
    this.uTexBLoc = null;
    this.uFlipYALoc = null;
    this.uFlipYBLoc = null;
    this.uUvRectALoc = null;
    this.uUvRectBLoc = null;
    this._mix = 0;
    this.uModeLoc = null;
    this._mode = 0;
  }

  init(): void {
    const gl = this.canvas.getContext("webgl2");
    if (!gl) throw new Error("WebGL2 not supported");
    this.gl = gl;

    const vs = `#version 300 es
      in vec2 a_position;
      in vec2 a_texCoord;
      out vec2 v_uv;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_uv = a_texCoord;
      }
    `;

    const fs = `#version 300 es
      precision highp float;
      in vec2 v_uv;
      out vec4 fragColor;
      uniform sampler2D u_texA;
      uniform sampler2D u_texB;
      uniform float u_mix;
      uniform int u_flipYA; // 0 or 1
      uniform int u_flipYB; // 0 or 1
      uniform vec4 u_uvRectA; // offset.xy, scale.xy
      uniform vec4 u_uvRectB; // offset.xy, scale.xy
      uniform int u_mode; // 0=normal,1=add,2=multiply,3=screen
      vec2 uvFlip(vec2 uv, int flipY) { return flipY == 1 ? vec2(uv.x, 1.0 - uv.y) : uv; }
      vec2 applyRect(vec2 uv, vec4 rect) { return rect.xy + uv * rect.zw; }
      void main() {
        vec2 uvA = uvFlip(v_uv, u_flipYA);
        vec2 uvB = uvFlip(v_uv, u_flipYB);
        uvA = applyRect(uvA, u_uvRectA);
        uvB = applyRect(uvB, u_uvRectB);
        vec4 a = texture(u_texA, uvA);
        vec4 b = texture(u_texB, uvB);
        float t = clamp(u_mix, 0.0, 1.0);
        vec4 base = mix(a, b, t);
        if (u_mode == 0) {
          fragColor = base;
        } else {
          vec4 addC = clamp(a + b, 0.0, 1.0);
          vec4 mulC = a * b;
          vec4 scrC = 1.0 - (1.0 - a) * (1.0 - b);
          vec4 modeC = (u_mode == 1) ? addC : (u_mode == 2) ? mulC : scrC;
          float overlap = 1.0 - abs(2.0 * t - 1.0);
          fragColor = mix(base, modeC, overlap);
        }
      }
    `;

    const program = gl.createProgram();
    if (!program) throw new Error("Failed to create program");
    const vshader = this._createShader(gl.VERTEX_SHADER, vs);
    const fshader = this._createShader(gl.FRAGMENT_SHADER, fs);
    gl.attachShader(program, vshader);
    gl.attachShader(program, fshader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Program link error: ${gl.getProgramInfoLog(program)}`);
    }
    this.program = program;

    this.aPosLoc = gl.getAttribLocation(program, "a_position");
    this.aUvLoc = gl.getAttribLocation(program, "a_texCoord");
    this.mixLocation = gl.getUniformLocation(program, "u_mix");
    this.uTexALoc = gl.getUniformLocation(program, "u_texA");
    this.uTexBLoc = gl.getUniformLocation(program, "u_texB");
    this.uFlipYALoc = gl.getUniformLocation(program, "u_flipYA");
    this.uFlipYBLoc = gl.getUniformLocation(program, "u_flipYB");
    this.uUvRectALoc = gl.getUniformLocation(program, "u_uvRectA");
    this.uUvRectBLoc = gl.getUniformLocation(program, "u_uvRectB");
    this.uModeLoc = gl.getUniformLocation(program, "u_mode");

    // quad
    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, -1, 1, 1, -1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );

    this.texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 1, 0, 0, 1, 1, 0, 0, 1, 1, 1, 0]),
      gl.STATIC_DRAW,
    );

    // default 1x1 textures (magenta and cyan) for testing
    this.texA = this._createSolidTexture(255, 0, 255, 255);
    this.texB = this._createSolidTexture(0, 255, 255, 255);

    this.resize(
      this.canvas.clientWidth || 640,
      this.canvas.clientHeight || 360,
    );
  }

  _createShader(type: number, source: string): WebGLShader {
    const gl = this.gl!;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Shader compile error: ${log}`);
    }
    return shader;
  }

  _createSolidTexture(
    r: number,
    g: number,
    b: number,
    a: number,
  ): WebGLTexture {
    const gl = this.gl!;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const data = new Uint8Array([r, g, b, a]);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      data,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  setSourceColors(
    a: [number, number, number],
    b: [number, number, number],
  ): void {
    const gl = this.gl!;
    if (!this.texA || !this.texB) return;
    const update: (tex: WebGLTexture, rgb: [number, number, number]) => void = (
      tex,
      rgb,
    ) => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      const data = new Uint8Array([rgb[0], rgb[1], rgb[2], 255]);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        data,
      );
    };
    update(this.texA, a);
    update(this.texB, b);
  }

  resize(width: number, height: number): void {
    const gl = this.gl;
    if (!gl) return;
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
  }

  setMix(v: number): void {
    this._mix = Math.max(0, Math.min(1, Number(v) || 0));
  }

  setBlendMode(mode: number): void {
    this._mode = mode | 0;
  }

  setTextures(texA: WebGLTexture | null, texB: WebGLTexture | null): void {
    if (!this.gl) return;
    if (texA) this.texA = texA;
    if (texB) this.texB = texB;
  }

  setFlipY(flipA: boolean, flipB: boolean): void {
    const gl = this.gl;
    if (!gl || !this.program) return;
    gl.useProgram(this.program);
    gl.uniform1i(this.uFlipYALoc, flipA ? 1 : 0);
    gl.uniform1i(this.uFlipYBLoc, flipB ? 1 : 0);
  }

  getGL(): WebGL2RenderingContext | null {
    return this.gl;
  }

  setUvRects(
    rectA: [number, number, number, number],
    rectB: [number, number, number, number],
  ): void {
    const gl = this.gl;
    if (!gl || !this.program) return;
    gl.useProgram(this.program);
    gl.uniform4f(this.uUvRectALoc, rectA[0], rectA[1], rectA[2], rectA[3]);
    gl.uniform4f(this.uUvRectBLoc, rectB[0], rectB[1], rectB[2], rectB[3]);
  }

  render(): void {
    const gl = this.gl;
    if (!gl || !this.program) return;

    gl.useProgram(this.program);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(this.aPosLoc);
    gl.vertexAttribPointer(this.aPosLoc, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.enableVertexAttribArray(this.aUvLoc);
    gl.vertexAttribPointer(this.aUvLoc, 2, gl.FLOAT, false, 0, 0);

    // Fallback 1x1 black texture if missing
    const ensureTex = (tex: WebGLTexture | null): WebGLTexture => {
      if (tex) return tex;
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
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
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, ensureTex(this.texA));
    gl.uniform1i(this.uTexALoc, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, ensureTex(this.texB));
    gl.uniform1i(this.uTexBLoc, 1);

    gl.uniform1f(this.mixLocation, this._mix);
    gl.uniform1i(this.uModeLoc, this._mode);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}
