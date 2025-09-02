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
  uTransitionLoc: WebGLUniformLocation | null;
  uTParamsLoc: WebGLUniformLocation | null;
  _transition: number;
  _tParams: [number, number, number, number];
  // Offscreen composite target
  outputFbo: WebGLFramebuffer | null;
  outputTex: WebGLTexture | null;
  // Copy-to-screen program
  copyProgram: WebGLProgram | null;
  copyPosLoc: number;
  copyUvLoc: number;
  uCopySrcLoc: WebGLUniformLocation | null;
  // Averaging pass
  avgProgram: WebGLProgram | null;
  uAvgSrcLoc: WebGLUniformLocation | null;
  uAvgRegionsLoc: WebGLUniformLocation | null;
  uAvgCountLoc: WebGLUniformLocation | null;
  uAvgCanvasSizeLoc: WebGLUniformLocation | null;
  uAvgSamplesLoc: WebGLUniformLocation | null;
  avgFbo: WebGLFramebuffer | null;
  avgTex: WebGLTexture | null;

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
    this.uTransitionLoc = null;
    this.uTParamsLoc = null;
    this._transition = 0;
    this._tParams = [0, 0, 0, 0];
    this.outputFbo = null;
    this.outputTex = null;
    this.copyProgram = null;
    this.copyPosLoc = -1;
    this.copyUvLoc = -1;
    this.uCopySrcLoc = null;
    this.avgProgram = null;
    this.uAvgSrcLoc = null;
    this.uAvgRegionsLoc = null;
    this.uAvgCountLoc = null;
    this.uAvgCanvasSizeLoc = null;
    this.uAvgSamplesLoc = null;
    this.avgFbo = null;
    this.avgTex = null;
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
      uniform int u_transition; // 0=crossfade,1=wipe,2=luma
      uniform vec4 u_tParams; // x=softness, y=angleRadians (wipe) or invert(0/1 for luma)
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
        float s = t;
        if (u_transition == 1) {
          float softness = clamp(u_tParams.x, 0.0, 0.5);
          float ang = u_tParams.y; // radians
          vec2 dir = vec2(cos(ang), sin(ang));
          vec2 p = v_uv - 0.5;
          float proj = dot(normalize(dir), p);
          float projN = proj * 1.41421356 * 0.5 + 0.5; // map approx [-0.707,0.707] to [0,1]
          s = smoothstep(projN - softness, projN + softness, t);
        } else if (u_transition == 2) {
          float softness = clamp(u_tParams.x, 0.0, 0.5);
          float inv = clamp(u_tParams.y, 0.0, 1.0);
          float l = dot(b.rgb, vec3(0.299, 0.587, 0.114));
          float lum = mix(l, 1.0 - l, inv);
          s = smoothstep(lum - softness, lum + softness, t);
        }
        vec4 base = mix(a, b, s);
        if (u_mode == 0) {
          fragColor = base;
        } else {
          vec4 addC = clamp(a + b, 0.0, 1.0);
          vec4 mulC = a * b;
          vec4 scrC = 1.0 - (1.0 - a) * (1.0 - b);
          vec4 modeC = (u_mode == 1) ? addC : (u_mode == 2) ? mulC : scrC;
          float overlap = 1.0 - abs(2.0 * s - 1.0);
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
    this.uTransitionLoc = gl.getUniformLocation(program, "u_transition");
    this.uTParamsLoc = gl.getUniformLocation(program, "u_tParams");

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

    // Offscreen output target
    this._initOutputTarget();
    this._initCopyProgram();
    this._initAvgProgram();

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

  _initOutputTarget(): void {
    const gl = this.gl!;
    this.outputTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.outputTex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      Math.max(1, this.canvas.width),
      Math.max(1, this.canvas.height),
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.outputFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.outputFbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.outputTex,
      0,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  _initCopyProgram(): void {
    const gl = this.gl!;
    const vs = `#version 300 es
      in vec2 a_position; in vec2 a_texCoord; out vec2 v_uv;
      void main(){ gl_Position=vec4(a_position,0.0,1.0); v_uv=a_texCoord; }`;
    const fs = `#version 300 es
      precision highp float; in vec2 v_uv; out vec4 fragColor; uniform sampler2D u_src;
      void main(){ fragColor = texture(u_src, v_uv); }`;
    const prog = gl.createProgram();
    if (!prog) throw new Error("Failed to create copy program");
    gl.attachShader(prog, this._createShader(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, this._createShader(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
      throw new Error(`Copy link error: ${gl.getProgramInfoLog(prog)}`);
    this.copyProgram = prog;
    this.copyPosLoc = gl.getAttribLocation(prog, "a_position");
    this.copyUvLoc = gl.getAttribLocation(prog, "a_texCoord");
    this.uCopySrcLoc = gl.getUniformLocation(prog, "u_src");
  }

  _initAvgProgram(): void {
    const gl = this.gl!;
    const vs = `#version 300 es
      in vec2 a_position; in vec2 a_texCoord; out vec2 v_uv;
      void main(){ gl_Position=vec4(a_position,0.0,1.0); v_uv=a_texCoord; }`;
    const fs = `#version 300 es
      precision highp float; in vec2 v_uv; out vec4 fragColor;
      uniform sampler2D u_src; // composited output
      uniform int u_count; // number of regions
      uniform vec4 u_regions[32]; // x,y,w,h normalized
      uniform vec2 u_canvasSize; // pixel size of output
      uniform int u_samples; // samples per edge
      vec3 sampleAverage(int idx){
        vec4 r = u_regions[idx];
        float n = float(max(u_samples,1));
        float step = 1.0 / n;
        float start = step * 0.5;
        vec3 total=vec3(0.0);
        float cnt=0.0;
        for(float sx=start;sx<1.0;sx+=step){
          for(float sy=start;sy<1.0;sy+=step){
            vec2 uv = vec2(r.x + sx*r.z, r.y + sy*r.w);
            total += texture(u_src, uv).rgb; cnt+=1.0;
          }
        }
        return total / max(cnt,1.0);
      }
      void main(){
        int idx = int(floor(v_uv.x * float(u_count)));
        idx = clamp(idx, 0, u_count-1);
        vec3 c = sampleAverage(idx);
        fragColor = vec4(c,1.0);
      }`;
    const prog = gl.createProgram();
    if (!prog) throw new Error("Failed to create avg program");
    gl.attachShader(prog, this._createShader(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, this._createShader(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
      throw new Error(`Avg link error: ${gl.getProgramInfoLog(prog)}`);
    this.avgProgram = prog;
    this.uAvgSrcLoc = gl.getUniformLocation(prog, "u_src");
    this.uAvgRegionsLoc = gl.getUniformLocation(prog, "u_regions");
    this.uAvgCountLoc = gl.getUniformLocation(prog, "u_count");
    this.uAvgCanvasSizeLoc = gl.getUniformLocation(prog, "u_canvasSize");
    this.uAvgSamplesLoc = gl.getUniformLocation(prog, "u_samples");

    this.avgFbo = gl.createFramebuffer();
    this.avgTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.avgTex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      32,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.avgFbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.avgTex,
      0,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
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
    // Resize output target
    if (this.outputTex) {
      gl.bindTexture(gl.TEXTURE_2D, this.outputTex);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        w,
        h,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
      );
    }
  }

  setMix(v: number): void {
    this._mix = Math.max(0, Math.min(1, Number(v) || 0));
  }

  setBlendMode(mode: number): void {
    this._mode = mode | 0;
  }

  setTransitionType(type: number): void {
    this._transition = type | 0;
  }

  setTransitionParams(p: [number, number, number, number]): void {
    this._tParams = [
      Number(p[0]) || 0,
      Number(p[1]) || 0,
      Number(p[2]) || 0,
      Number(p[3]) || 0,
    ];
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
    if (!gl || !this.program || !this.copyProgram) return;

    // First render mix into offscreen output
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.outputFbo);
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
    gl.uniform1i(this.uTransitionLoc, this._transition);
    gl.uniform4f(
      this.uTParamsLoc,
      this._tParams[0],
      this._tParams[1],
      this._tParams[2],
      this._tParams[3],
    );

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Blit to default framebuffer using copyProgram
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(this.copyProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(this.copyPosLoc);
    gl.vertexAttribPointer(this.copyPosLoc, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.enableVertexAttribArray(this.copyUvLoc);
    gl.vertexAttribPointer(this.copyUvLoc, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.outputTex);
    gl.uniform1i(this.uCopySrcLoc, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  calculateAverageColors(
    bounds: Array<{ x: number; y: number; width: number; height: number }>,
    samplesPerEdge = 20,
  ): Array<{ r: number; g: number; b: number; hex: string }> {
    const gl = this.gl;
    if (!gl || !this.avgProgram || !this.avgFbo || !this.avgTex) return [];
    const count = Math.max(0, Math.min(32, bounds.length));
    if (count === 0) return [];

    const w = Math.max(1, this.canvas.width);
    const h = Math.max(1, this.canvas.height);

    const data = new Float32Array(32 * 4);
    for (let i = 0; i < count; i++) {
      const b = bounds[i];
      data[i * 4 + 0] = b.x / w;
      data[i * 4 + 1] = b.y / h;
      data[i * 4 + 2] = b.width / w;
      data[i * 4 + 3] = b.height / h;
    }

    gl.useProgram(this.avgProgram);

    // full-screen quad
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    const posLoc = gl.getAttribLocation(this.avgProgram, "a_position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    const uvLoc = gl.getAttribLocation(this.avgProgram, "a_texCoord");
    gl.enableVertexAttribArray(uvLoc);
    gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);

    // Source is composited output texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.outputTex);
    gl.uniform1i(this.uAvgSrcLoc, 0);

    gl.uniform1i(this.uAvgCountLoc, count);
    gl.uniform4fv(this.uAvgRegionsLoc, data);
    gl.uniform2f(this.uAvgCanvasSizeLoc, w, h);
    gl.uniform1i(
      this.uAvgSamplesLoc,
      Math.max(1, Math.min(64, samplesPerEdge)),
    );

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.avgFbo);
    gl.viewport(0, 0, count, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    const pixels = new Uint8Array(count * 4);
    gl.readPixels(0, 0, count, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    const colors: Array<{ r: number; g: number; b: number; hex: string }> = [];
    for (let i = 0; i < count; i++) {
      const r = pixels[i * 4 + 0];
      const g = pixels[i * 4 + 1];
      const b = pixels[i * 4 + 2];
      const toHex = (n: number) => n.toString(16).padStart(2, "0");
      colors.push({ r, g, b, hex: `#${toHex(r)}${toHex(g)}${toHex(b)}` });
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    return colors;
  }
}
