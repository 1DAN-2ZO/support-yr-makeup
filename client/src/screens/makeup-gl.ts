/**
 * [dev] 화장 필터 렌더러 (WebGL2) — SNOW 같은 필터 방식.
 *
 * 1. 배경: 영상(또는 찍은 사진)을 그대로 깐다.
 * 2. 얼굴 그물(MediaPipe 852개 + 헤어라인 합성 리본 20개, face-mesh.ts EXTENDED_TRIANGLES): 점 위치는 지금 얼굴, 무늬 좌표는 기준 얼굴.
 *    기준 얼굴 위에 그린 화장 무늬(atlas)가 삼각형마다 휘어 지금 얼굴에 붙는다.
 *    헤어라인 리본은 "피부 보정"이 이마 중간에서 잘리는 문제 때문에 늘렸다 — 실측 랜드마크가 아니라 지어낸 점이니 화장 자리 계산에는 안 쓴다.
 * 3. 셰이더에서 피부와 섞는다:
 *    - 곱하기 층: 피부 × 화장색 — 결·그늘·광이 그대로 비친다
 *    - 색 층(입술): 밝기는 피부 것을 두고 색만 옮긴다 — 입술 광이 산다
 *    - 피부 보정(선택): 가장자리를 지키는 흐림(bilateral) — 속눈썹·눈썹 같은 또렷한 선은 덜 흐린다
 *
 * 무늬 캔버스는 영상과 같은 크기라, 기준 얼굴 점 px ÷ 크기 가 그대로 무늬 좌표다.
 */

import { EXTENDED_TRIANGLES, MESH_VERTEX_SRC } from "@core/face-mesh";
import type { Pt } from "@core/types";

const VS_BG = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = vec2((aPos.x + 1.0) * 0.5, (1.0 - aPos.y) * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FS_BG = `#version 300 es
precision mediump float;
uniform sampler2D uVideo;
in vec2 vUv;
out vec4 o;
void main() { o = vec4(texture(uVideo, vUv).rgb, 1.0); }`;

const VS_MESH = `#version 300 es
in vec2 aPos;   // 지금 얼굴 점 (px)
in vec2 aRef;   // 기준 얼굴 점 (px) — 무늬 좌표
uniform vec2 uSize;
out vec2 vScreen;
out vec2 vAtlas;
void main() {
  vScreen = aPos / uSize;
  vAtlas = aRef / uSize;
  gl_Position = vec4(vScreen.x * 2.0 - 1.0, 1.0 - vScreen.y * 2.0, 0.0, 1.0);
}`;

const FS_MESH = `#version 300 es
precision highp float;
uniform sampler2D uVideo;
uniform sampler2D uMul;
uniform sampler2D uCol;
uniform sampler2D uLight;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uBeauty;
in vec2 vScreen;
in vec2 vAtlas;
out vec4 o;
const vec3 LUMA = vec3(0.299, 0.587, 0.114);
void main() {
  vec3 base = texture(uVideo, vScreen).rgb;
  if (uBeauty > 0.0) {
    vec3 sum = vec3(0.0);
    float wsum = 0.0;
    for (int i = -3; i <= 3; i++) {
      for (int j = -3; j <= 3; j++) {
        vec2 d = vec2(float(i), float(j));
        vec3 c = texture(uVideo, vScreen + d * uTexel * uRadius).rgb;
        vec3 dc = c - base;
        float w = exp(-dot(d, d) / 18.0) * exp(-dot(dc, dc) / (2.0 * 0.06 * 0.06));
        sum += c * w;
        wsum += w;
      }
    }
    base = mix(base, sum / wsum, uBeauty);
  }
  vec4 m = texture(uMul, vAtlas);
  vec3 col = base * mix(vec3(1.0), m.rgb, m.a);
  vec4 c = texture(uCol, vAtlas);
  if (c.a > 0.0) {
    vec3 shifted = clamp(c.rgb + (dot(col, LUMA) - dot(c.rgb, LUMA)), 0.0, 1.0);
    col = mix(col, shifted, c.a);
  }
  vec4 l = texture(uLight, vAtlas);   // 하이라이트: 밝히기(screen)
  col = 1.0 - (1.0 - col) * (1.0 - l.rgb * l.a);
  o = vec4(col, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "셰이더 오류");
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "링크 오류");
  return p;
}

function texture(gl: WebGL2RenderingContext): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

export interface GlFrame {
  /** 지금 얼굴 점 (px). face-mesh.ts withHairline() 으로 헤어라인 합성점까지 붙여서 넘긴다 */
  lm: readonly Pt[];
  /** 무늬를 그린 기준 얼굴 점 (px). 마찬가지로 withHairline() 통과한 것 */
  ref: readonly Pt[];
  /** 피부 보정 0~1 */
  beauty: number;
  /** 피부 보정 흐림 반경 (px) — 얼굴 크기에 맞춘다 */
  radius: number;
}

export class MakeupGl {
  private gl: WebGL2RenderingContext;
  private bg: WebGLProgram;
  private mesh: WebGLProgram;
  private bgBuf: WebGLBuffer;
  private vBuf: WebGLBuffer;
  private iBuf: WebGLBuffer;
  private tVideo: WebGLTexture;
  private tMul: WebGLTexture;
  private tCol: WebGLTexture;
  private tLight: WebGLTexture;
  private verts = new Float32Array(MESH_VERTEX_SRC.length * 4);

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error("WebGL2 를 쓸 수 없음");
    this.gl = gl;
    this.bg = compile(gl, VS_BG, FS_BG);
    this.mesh = compile(gl, VS_MESH, FS_MESH);
    this.bgBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bgBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.vBuf = gl.createBuffer()!;
    this.iBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.iBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(EXTENDED_TRIANGLES.flat()), gl.STATIC_DRAW);
    this.tVideo = texture(gl);
    this.tMul = texture(gl);
    this.tCol = texture(gl);
    this.tLight = texture(gl);
    // 캔버스 무늬는 알파를 곱하지 않은 채로 받는다 — 셰이더가 색과 세기를 따로 쓴다
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  }

  private upload(t: WebGLTexture, src: TexImageSource): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  }

  private bindUnit(prog: WebGLProgram, name: string, unit: number, t: WebGLTexture): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.uniform1i(gl.getUniformLocation(prog, name), unit);
  }

  /** 얼굴이 없으면 f 를 null 로 — 배경만 그린다 */
  render(src: TexImageSource, w: number, h: number, mul: HTMLCanvasElement, col: HTMLCanvasElement, light: HTMLCanvasElement, f: GlFrame | null): void {
    const gl = this.gl;
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    gl.viewport(0, 0, w, h);
    this.upload(this.tVideo, src);

    gl.useProgram(this.bg);
    this.bindUnit(this.bg, "uVideo", 0, this.tVideo);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bgBuf);
    const aBg = gl.getAttribLocation(this.bg, "aPos");
    gl.enableVertexAttribArray(aBg);
    gl.vertexAttribPointer(aBg, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disableVertexAttribArray(aBg);
    if (!f) return;
    // 방어: lm/ref가 헤어라인 합성점(withHairline) 없이 넘어오면(HMR 반영 틈 등) 예외로 렌더 루프 전체가
    // 멈추는 대신, 이 프레임만 배경만 그리고 건너뛴다 — 얼어붙은 옛 프레임이 "화장이 안 따라온다"로 보이는 사고를 막는다
    const maxIdx = MESH_VERTEX_SRC[MESH_VERTEX_SRC.length - 1]!;
    if (f.lm.length <= maxIdx || f.ref.length <= maxIdx) { console.warn(`[MakeupGl] lm/ref 길이 부족(${f.lm.length}/${f.ref.length}, ${maxIdx + 1} 필요) — 이 프레임 건너뜀`); return; }

    this.upload(this.tMul, mul);
    this.upload(this.tCol, col);
    this.upload(this.tLight, light);
    for (let i = 0; i < MESH_VERTEX_SRC.length; i++) {
      const li = MESH_VERTEX_SRC[i]!;
      const p = f.lm[li]!, r = f.ref[li]!;
      this.verts.set([p.x, p.y, r.x, r.y], i * 4);
    }
    // [디버그] 10프레임에 한 번, 헤어라인과 무관한 실제 랜드마크(입술 61번)와 합성 헤어라인 점(478번)을 찍는다.
    // 화장이 위로 쏠린다면: lip61이 예전과 다른 값이면 실제 랜드마크 쪽 버그, hair478만 이상하면 헤어라인 국한 문제
    if (Math.random() < 0.1) {
      console.log("[hairline-debug] lip61(lm)=", f.lm[61], "lip61(ref)=", f.ref[61], "hair478(lm)=", f.lm[478], "hair478(ref)=", f.ref[478], "lm.length=", f.lm.length, "verts.length=", this.verts.length, "slots=", MESH_VERTEX_SRC.length);
    }
    gl.useProgram(this.mesh);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.verts, gl.DYNAMIC_DRAW);
    const aPos = gl.getAttribLocation(this.mesh, "aPos"), aRef = gl.getAttribLocation(this.mesh, "aRef");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(aRef);
    gl.vertexAttribPointer(aRef, 2, gl.FLOAT, false, 16, 8);
    gl.uniform2f(gl.getUniformLocation(this.mesh, "uSize"), w, h);
    gl.uniform2f(gl.getUniformLocation(this.mesh, "uTexel"), 1 / w, 1 / h);
    gl.uniform1f(gl.getUniformLocation(this.mesh, "uRadius"), f.radius / 3);
    gl.uniform1f(gl.getUniformLocation(this.mesh, "uBeauty"), f.beauty);
    this.bindUnit(this.mesh, "uVideo", 0, this.tVideo);
    this.bindUnit(this.mesh, "uMul", 1, this.tMul);
    this.bindUnit(this.mesh, "uCol", 2, this.tCol);
    this.bindUnit(this.mesh, "uLight", 3, this.tLight);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.iBuf);
    gl.drawElements(gl.TRIANGLES, EXTENDED_TRIANGLES.length * 3, gl.UNSIGNED_SHORT, 0);
    gl.disableVertexAttribArray(aPos);
    gl.disableVertexAttribArray(aRef);
  }
}
