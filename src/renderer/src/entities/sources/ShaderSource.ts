import type { ISource } from "./ISource";
import type { FillMode } from "./FillMode";

const DEFAULT_FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 u_resolution;
uniform float u_time;
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float t = u_time * 0.5;
  vec3 col = 0.5 + 0.5 * sin(vec3(t) + vec3(uv, uv.x + uv.y) * 6.28318);
  fragColor = vec4(col, 1.0);
}`;

export class ShaderSource implements ISource {
  id: string;
  type = "shader" as const;
  label: string;
  private texture: WebGLTexture | null;
  private fbo: WebGLFramebuffer | null;
  private program: WebGLProgram | null;
  private gl: WebGL2RenderingContext | null;
  private outputW: number;
  private outputH: number;
  private fillMode: FillMode;
  private frag: string;
  private positionBuffer: WebGLBuffer | null;
  private uResolutionLoc: WebGLUniformLocation | null;
  private uTimeLoc: WebGLUniformLocation | null;
  private timeAccum: number = 0;

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
    this.label = label || `Shader ${id}`;
    this.texture = null;
    this.fbo = null;
    this.program = null;
    this.gl = null;
    this.outputW = 0;
    this.outputH = 0;
    this.fillMode = (options?.fillMode as FillMode) || "cover";
    this.frag = (options?.frag as string) || DEFAULT_FRAG;
    this.positionBuffer = null;
    this.uResolutionLoc = null;
    this.uTimeLoc = null;
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
        key: "frag",
        label: "Fragment shader",
        type: "text" as const,
        value: this.frag,
      },
    ];
  }

  setOptions(partial: { [key: string]: unknown }): void {
    if (partial.fillMode) this.fillMode = partial.fillMode as FillMode;
    if (typeof partial.frag === "string" && partial.frag.trim().length > 0) {
      this.frag = partial.frag as string;
      this.rebuildProgram();
    }
  }

  getContentSize(): { width: number; height: number } | null {
    if (this.outputW > 0 && this.outputH > 0)
      return { width: this.outputW, height: this.outputH };
    return null;
  }
  getFillMode(): FillMode {
    return this.fillMode;
  }

  setOutputSize(w: number, h: number): void {
    this.outputW = Math.max(1, Math.floor(w));
    this.outputH = Math.max(1, Math.floor(h));
    if (this.gl && this.texture) {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        this.outputW,
        this.outputH,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
      );
    }
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
      null,
    );

    this.fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.texture,
      0,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, -1, 1, 1, -1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );

    this.rebuildProgram();
  }

  private rebuildProgram(): void {
    if (!this.gl) return;
    const gl = this.gl;
    if (this.program) gl.deleteProgram(this.program);

    const vsSource = `#version 300 es
    in vec2 a_position;
    void main(){ gl_Position=vec4(a_position,0.0,1.0);} `;
    const fsSource = this.frag;
    const vs = this.compile(gl.VERTEX_SHADER, vsSource);
    const fs = this.compile(gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) return;
    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("Shader link error:", gl.getProgramInfoLog(prog));
      return;
    }
    this.program = prog;
    gl.useProgram(this.program);
    const posLoc = gl.getAttribLocation(this.program, "a_position");
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    this.uResolutionLoc = gl.getUniformLocation(this.program, "u_resolution");
    this.uTimeLoc = gl.getUniformLocation(this.program, "u_time");
  }

  private compile(type: number, src: string): WebGLShader | null {
    if (!this.gl) return null;
    const gl = this.gl;
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error("Shader compile error:", gl.getShaderInfoLog(sh));
      return null;
    }
    return sh;
  }

  start(): void {}
  stop(): void {}

  dispose(gl: WebGL2RenderingContext): void {
    if (this.texture) gl.deleteTexture(this.texture);
    if (this.program) gl.deleteProgram(this.program);
    if (this.fbo) gl.deleteFramebuffer(this.fbo);
    this.texture = null;
    this.program = null;
    this.fbo = null;
  }

  getTexture(_gl: WebGL2RenderingContext): WebGLTexture | null {
    return this.texture;
  }

  tick(dtMs: number): void {
    if (!this.gl || !this.program || !this.fbo || !this.texture) return;
    this.timeAccum += Math.max(0, dtMs) / 1000;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.outputW || 1, this.outputH || 1);
    gl.useProgram(this.program);
    if (this.uResolutionLoc)
      gl.uniform2f(this.uResolutionLoc, this.outputW || 1, this.outputH || 1);
    if (this.uTimeLoc) gl.uniform1f(this.uTimeLoc, this.timeAccum);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
}
