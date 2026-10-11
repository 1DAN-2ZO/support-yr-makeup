/**
 * [옛 흐름 · 지금 안 씀] 앱에서는 화면 2-b · 3(screens/fullrender.ts · guide.ts)만 쓴다. 시험 페이지 makeup-probe.html 은 지금도 쓴다.
 * 2026-10-06 에 흐름이 바뀌어 그 화면들로 가는 길이 없다.
 * 지우지 않고 둔다 — 등록(main.ts) · 테스트도 그대로다. 목록과 근거: client/OLD-FLOW.md
 */
/**
 * [dev] 화장 필터 렌더러 (WebGL2) — SNOW 같은 필터 방식.
 *
 * 1. 배경: 영상(또는 찍은 사진)을 그대로 깐다.
 * 2. 얼굴 그물(삼각형 852개): 점 위치는 지금 얼굴, 무늬 좌표는 기준 얼굴.
 *    기준 얼굴 위에 그린 화장 무늬(atlas)가 삼각형마다 휘어 지금 얼굴에 붙는다.
 * 3. 셰이더에서 피부와 섞는다:
 *    - 곱하기 층: 피부 × 화장색 — 결·그늘·광이 그대로 비친다
 *    - 색 층(입술): 밝기는 피부 것을 두고 색만 옮긴다 — 입술 광이 산다
 *    - 피부 보정(선택): 가장자리를 지키는 흐림(bilateral) — 속눈썹·눈썹 같은 또렷한 선은 덜 흐린다
 *
 * 무늬 캔버스는 영상과 같은 크기라, 기준 얼굴 점 px ÷ 크기 가 그대로 무늬 좌표다.
 */

import { FACE_TRIANGLES } from "@core/face-mesh";
import type { HairMask } from "@core/sampling";
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
uniform sampler2D uHair;   // 머리카락 확률 (영상 좌표, R). 없으면 0 — docs/research/hair-skin-2026-09-29
uniform vec2 uTexel;
uniform float uRadius;
uniform float uBeauty;
in vec2 vScreen;
in vec2 vAtlas;
out vec4 o;
const vec3 LUMA = vec3(0.299, 0.587, 0.114);
void main() {
  vec3 base = texture(uVideo, vScreen).rgb;
  // 앞머리·옆머리 위에는 피부 보정도 화장도 안 한다 — 머리카락 결이 뭉개지고 화장색이 칠해졌다 (폰 시험 2026-09-30)
  float keep = 1.0 - smoothstep(0.35, 0.65, texture(uHair, vScreen).r);
  if (uBeauty > 0.0 && keep > 0.0) {
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
    base = mix(base, sum / wsum, uBeauty * keep);
  }
  vec4 m = texture(uMul, vAtlas);
  vec3 col = base * mix(vec3(1.0), m.rgb, m.a * keep);
  vec4 c = texture(uCol, vAtlas);
  if (c.a > 0.0) {
    vec3 shifted = clamp(c.rgb + (dot(col, LUMA) - dot(c.rgb, LUMA)), 0.0, 1.0);
    col = mix(col, shifted, c.a * keep);
  }
  vec4 l = texture(uLight, vAtlas);   // 하이라이트: 밝히기(screen)
  col = 1.0 - (1.0 - col) * (1.0 - l.rgb * l.a * keep);
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
  /** 지금 얼굴 점 (px) */
  lm: readonly Pt[];
  /** 무늬를 그린 기준 얼굴 점 (px) */
  ref: readonly Pt[];
  /** 피부 보정 0~1 */
  beauty: number;
  /** 피부 보정 흐림 반경 (px) — 얼굴 크기에 맞춘다 */
  radius: number;
  /** 머리카락 확률 마스크 (영상과 같은 구도, 크기는 달라도 됨). 있으면 그 위엔 보정·화장을 안 한다. 없으면 전과 같다 */
  hair?: HairMask | null;
}

/** 머리카락 마스크 텍스처 칸 — 0 영상 · 1 곱하기 · 2 색 · 3 밝히기 다음 */
const HAIR_UNIT = 4;

/** 머리카락 확률 0~1 → 셰이더용 0~255 한 채널. 범위 밖은 자르고, 음수·NaN 은 0 (머리카락 아님) */
export function hairBytes(m: HairMask): Uint8Array {
  const out = new Uint8Array(m.w * m.h);
  for (let i = 0; i < out.length; i++) {
    const v = m.data[i] ?? 0;
    out[i] = Number.isFinite(v) && v > 0 ? Math.round(Math.min(1, v) * 255) : 0;
  }
  return out;
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
  private tHair: WebGLTexture;
  private hairShown: HairMask | null = null;
  private verts = new Float32Array(468 * 4);

  /**
   * GPU 자원을 돌려준다. 화면을 떠날 때 부른다 — 브라우저는 살아 있는 WebGL 을 16개쯤으로 막아서,
   * 2-b 를 여러 번 드나들면 오래된 것부터 강제로 잃는다 (#172 리뷰)
   */
  dispose(): void {
    const gl = this.gl;
    for (const t of [this.tVideo, this.tMul, this.tCol, this.tLight, this.tHair]) gl.deleteTexture(t);
    for (const b of [this.bgBuf, this.vBuf, this.iBuf]) gl.deleteBuffer(b);
    gl.deleteProgram(this.bg);
    gl.deleteProgram(this.mesh);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

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
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(FACE_TRIANGLES.flat()), gl.STATIC_DRAW);
    this.tVideo = texture(gl);
    this.tMul = texture(gl);
    this.tCol = texture(gl);
    this.tLight = texture(gl);
    this.tHair = texture(gl);
    this.uploadHair(null);
    // 캔버스 무늬는 알파를 곱하지 않은 채로 받는다 — 셰이더가 색과 세기를 따로 쓴다
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  }

  /** 머리카락 마스크를 한 채널 텍스처로. 없으면 1×1 의 0 — 셰이더가 늘 같은 경로로 돈다. 같은 마스크면 다시 안 올린다 */
  private uploadHair(m: HairMask | null): void {
    if (m === this.hairShown && m !== null) return;
    const gl = this.gl;
    // 늘 4번 칸에서만 — 지금 켜진 칸(예: 3번 uLight)에 묶으면 그 칸을 마스크로 덮어써서 하이라이트가 사라지고
    // 머리카락 경계가 빨갛게 떴다 (폰 시험 2026-09-30, R8 텍스처 = 빨강 채널)
    gl.activeTexture(gl.TEXTURE0 + HAIR_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.tHair);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (m) gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, m.w, m.h, 0, gl.RED, gl.UNSIGNED_BYTE, hairBytes(m));
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([0]));
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    this.hairShown = m;
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

    this.upload(this.tMul, mul);
    this.upload(this.tCol, col);
    this.upload(this.tLight, light);
    this.uploadHair(f.hair ?? null);   // 칸 묶기(bindUnit) 전에 — 뒤에 하면 앞 칸을 덮어쓴다
    for (let i = 0; i < 468; i++) {
      const p = f.lm[i]!, r = f.ref[i]!;
      this.verts.set([p.x, p.y, r.x, r.y], i * 4);
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
    this.bindUnit(this.mesh, "uHair", HAIR_UNIT, this.tHair);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.iBuf);
    gl.drawElements(gl.TRIANGLES, FACE_TRIANGLES.length * 3, gl.UNSIGNED_SHORT, 0);
    gl.disableVertexAttribArray(aPos);
    gl.disableVertexAttribArray(aRef);
  }
}
