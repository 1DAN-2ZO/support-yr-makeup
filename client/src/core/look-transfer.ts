/**
 * 룩 옮기기 (실험) — 배우고 싶은 화장 사진(참조)을 내 맨얼굴 모양에 맞춰 포갠다.
 *
 * 방법: 두 사진에서 같은 얼굴 점 468개를 찾고, 얼굴 그물(face-mesh.ts) 삼각형마다 참조 사진의 살갗을
 * 내 얼굴의 같은 삼각형 자리로 옮긴다. 그러면 참조 얼굴의 눈·입술·볼이 내 얼굴의 눈·입술·볼 위에 정확히 온다 —
 * 그다음 단계(화장만 떼기 · 입히기 · 테두리 만들기)가 전부 "같은 자리 픽셀끼리 비교"로 풀린다.
 *
 * 학습된 생성 모델을 쓰지 않는다. 얼굴 점은 MediaPipe(Apache-2.0), 나머지는 여기 있는 계산뿐이라
 * 사진이 기기 밖으로 나가지 않고 라이선스 걸림이 없다.
 *
 * 순수 함수 — 이미지는 { data(RGBA), w, h } 만 받아 Node 에서도 돈다.
 */

import type { RgbaImage } from "./color";
import { FACE_TRIANGLES } from "./face-mesh";
import type { Triangle } from "./face-mesh";
import { LM, RIGID_IDS, at, dist } from "./landmarks";
import type { Pt } from "./types";

/** 포갠 결과. 얼굴 그물 밖은 alpha 0 */
export interface WarpedFace {
  data: Uint8ClampedArray;
  w: number;
  h: number;
}

/** 삼각형 가장자리 틈을 막는 여유 (무게중심 좌표). 이웃 삼각형이 같은 픽셀을 덮어써도 값이 같아 티가 안 난다 */
const EDGE_EPS = 1e-3;

/** 두 값 사이를 잇는 표본 (쌍선형). 사진 밖은 가장자리 값 */
function sampleInto(src: RgbaImage, x: number, y: number, out: Uint8ClampedArray, o: number): void {
  const fx = Math.max(0, Math.min(src.w - 1, x)), fy = Math.max(0, Math.min(src.h - 1, y));
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(src.w - 1, x0 + 1), y1 = Math.min(src.h - 1, y0 + 1);
  const tx = fx - x0, ty = fy - y0;
  const i00 = (y0 * src.w + x0) * 4, i10 = (y0 * src.w + x1) * 4, i01 = (y1 * src.w + x0) * 4, i11 = (y1 * src.w + x1) * 4;
  for (let c = 0; c < 3; c++) {
    const top = (src.data[i00 + c] ?? 0) * (1 - tx) + (src.data[i10 + c] ?? 0) * tx;
    const bot = (src.data[i01 + c] ?? 0) * (1 - tx) + (src.data[i11 + c] ?? 0) * tx;
    out[o + c] = top * (1 - ty) + bot * ty;
  }
  out[o + 3] = 255;
}

/**
 * src 사진의 얼굴(srcLm)을 dstLm 모양으로 휘어 w×h 그림으로 만든다.
 * 좌표는 둘 다 픽셀. dst 삼각형 안의 픽셀마다 src 의 같은 자리를 거꾸로 찾아 읽는다 — 구멍이 안 생긴다.
 */
export function warpToFace(src: RgbaImage, srcLm: readonly Pt[], dstLm: readonly Pt[], w: number, h: number, tris: readonly Triangle[] = FACE_TRIANGLES): WarpedFace {
  const data = new Uint8ClampedArray(w * h * 4);
  for (const [i0, i1, i2] of tris) {
    const d0 = at(dstLm, i0), d1 = at(dstLm, i1), d2 = at(dstLm, i2);
    const s0 = at(srcLm, i0), s1 = at(srcLm, i1), s2 = at(srcLm, i2);
    const area = (d1.x - d0.x) * (d2.y - d0.y) - (d2.x - d0.x) * (d1.y - d0.y);
    if (Math.abs(area) < 1e-6) continue;
    const xMin = Math.max(0, Math.floor(Math.min(d0.x, d1.x, d2.x))), xMax = Math.min(w - 1, Math.ceil(Math.max(d0.x, d1.x, d2.x)));
    const yMin = Math.max(0, Math.floor(Math.min(d0.y, d1.y, d2.y))), yMax = Math.min(h - 1, Math.ceil(Math.max(d0.y, d1.y, d2.y)));
    for (let y = yMin; y <= yMax; y++) {
      for (let x = xMin; x <= xMax; x++) {
        const b1 = ((x - d0.x) * (d2.y - d0.y) - (d2.x - d0.x) * (y - d0.y)) / area;
        const b2 = ((d1.x - d0.x) * (y - d0.y) - (x - d0.x) * (d1.y - d0.y)) / area;
        const b0 = 1 - b1 - b2;
        if (b0 < -EDGE_EPS || b1 < -EDGE_EPS || b2 < -EDGE_EPS) continue;
        sampleInto(src, b0 * s0.x + b1 * s1.x + b2 * s2.x, b0 * s0.y + b1 * s1.y + b2 * s2.y, data, (y * w + x) * 4);
      }
    }
  }
  return { data, w, h };
}

/**
 * 확률 지도(머리카락 마스크 등)를 사진과 같은 방법으로 휜다 — src 사진 구도의 지도 → dst 얼굴 모양의 w×h 지도.
 * 지도 크기는 사진과 달라도 된다(비율로 맞춘다). 얼굴 그물 밖은 0
 */
export function warpMask(mask: { w: number; h: number; data: ArrayLike<number> }, srcW: number, srcH: number, srcLm: readonly Pt[], dstLm: readonly Pt[], w: number, h: number, tris: readonly Triangle[] = FACE_TRIANGLES): Float32Array {
  const data = new Uint8ClampedArray(mask.w * mask.h * 4);
  for (let i = 0; i < mask.w * mask.h; i++) data[i * 4] = (mask.data[i] ?? 0) * 255;
  const kx = mask.w / srcW, ky = mask.h / srcH;
  const warped = warpToFace({ data, w: mask.w, h: mask.h }, srcLm.map((p) => ({ x: p.x * kx, y: p.y * ky })), dstLm, w, h, tris);
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = warped.data[i * 4 + 3] ? warped.data[i * 4]! / 255 : 0;
  return out;
}

/**
 * 머리카락 마스크(확률 0 ~ 1, 크기는 사진과 달라도 된다)를 사진 크기 w×h 로 옮기고 grow(px) 만큼 넓힌다 — 머리카락으로 보고 가릴 칸이 1.
 * 생성 모델에 보낼 화장 사진에서 머리카락을 가릴 때 쓴다 (실험 화면 cropBlob).
 * 넓히는 까닭: 분할 모델은 머리카락 덩어리는 잡아도 가장자리의 가닥 끝을 놓친다. 앞머리가 눈까지 내려온 화장 사진에서 남은 가닥 끝을
 * 생성 모델이 "눈두덩의 화장" 으로 옮겨 그렸다 — 검은 앞머리는 눈두덩의 검은 줄로, 금발 앞머리는 누런 섀도로 (2026-10-07, 화장 사진 5장 × 얼굴 3명).
 * 눈 폭의 20% 만큼 넓혀 가리니 그 줄 · 색이 거의 사라졌다 (10% 로는 남았다). 대신 머리카락 바로 옆의 화장(앞머리에 닿은 눈썹 · 섀도 위쪽)도 같이 가려진다
 */
export function hairCover(mask: { w: number; h: number; data: ArrayLike<number> }, w: number, h: number, grow: number, threshold = 0.5): Uint8Array {
  const base = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const my = Math.min(mask.h - 1, Math.floor((y * mask.h) / h)) * mask.w;
    for (let x = 0; x < w; x++) base[y * w + x] = (mask.data[my + Math.min(mask.w - 1, Math.floor((x * mask.w) / w))] ?? 0) >= threshold ? 1 : 0;
  }
  const r = Math.round(grow);
  if (r < 1) return base;
  /** 한 줄(n 칸, 칸 간격 step)에서 1 인 칸의 r 칸 안을 전부 1 로 */
  const spread = (from: Uint8Array, to: Uint8Array, n: number, lines: number, step: number, lineStep: number): void => {
    for (let l = 0; l < lines; l++) {
      const at = l * lineStep;
      let last = -Infinity;
      for (let i = 0; i < n; i++) {
        if (from[at + i * step]) last = i;
        if (i - last <= r) to[at + i * step] = 1;
      }
      last = Infinity;
      for (let i = n - 1; i >= 0; i--) {
        if (from[at + i * step]) last = i;
        if (last - i <= r) to[at + i * step] = 1;
      }
    }
  };
  const rows = new Uint8Array(w * h), out = new Uint8Array(w * h);
  spread(base, rows, w, h, 1, w);
  spread(rows, out, h, w, w, 1);
  return out;
}

/** 두 얼굴의 점이 얼마나 어긋났나. 전부 눈 폭 대비 비율 (0.03 = 눈 폭의 3%) */
export interface FaceShift {
  /** 얼굴 전체가 밀린 정도 — 화장·표정에 안 흔들리는 점(RIGID_IDS)들의 평균 이동 */
  rigid: number;
  /** 전체 밀림을 뺀 뒤 그 부위 점들이 어긋난 정도 — 얼굴 모양이 바뀌었나 */
  brow: { mean: number; max: number };
  eye: { mean: number; max: number };
  lip: { mean: number; max: number };
}

const SHIFT_POINTS = {
  brow: [...LM.browA.upper, ...LM.browA.lower, ...LM.browB.upper, ...LM.browB.lower],
  eye: [...LM.eyeA.upper, ...LM.eyeA.lower, ...LM.eyeB.upper, ...LM.eyeB.lower],
  lip: [...LM.lipsOuter],
} as const;

/**
 * base(내 맨얼굴) 대비 other(생성한 정답사진)의 얼굴 점 어긋남. 같은 크기·같은 구도의 두 사진에서 잰 점(px)을 받는다.
 * 정답사진은 비교 기준이라 눈썹이 몇 px 만 옮겨져도 잘 그린 것이 "넘침" 이 된다 (service-definition §7) — 그걸 재는 숫자.
 */
export function landmarkShift(base: readonly Pt[], other: readonly Pt[]): FaceShift {
  const u = (dist(at(base, LM.eyeA.outer), at(base, LM.eyeA.inner)) + dist(at(base, LM.eyeB.outer), at(base, LM.eyeB.inner))) / 2 || 1;
  let mx = 0, my = 0;
  for (const i of RIGID_IDS) {
    mx += (at(other, i).x - at(base, i).x) / RIGID_IDS.length;
    my += (at(other, i).y - at(base, i).y) / RIGID_IDS.length;
  }
  const part = (ids: readonly number[]): { mean: number; max: number } => {
    let sum = 0, max = 0;
    for (const i of ids) {
      const d = Math.hypot(at(other, i).x - at(base, i).x - mx, at(other, i).y - at(base, i).y - my) / u;
      sum += d;
      max = Math.max(max, d);
    }
    return { mean: sum / ids.length, max };
  };
  return { rigid: Math.hypot(mx, my) / u, brow: part(SHIFT_POINTS.brow), eye: part(SHIFT_POINTS.eye), lip: part(SHIFT_POINTS.lip) };
}

/** 사진 한 장이 룩 옮기기에 쓸 만한가 — 숫자만. 판정 기준은 정의서 1-2 촬영 조건을 따른다 */
export interface PhotoCheck {
  /** 눈 폭(px), 좌우 중 작은 쪽. 정의서 1-2: 80px 이상 */
  eyeWidthPx: number;
  /** 좌우 눈 폭 비(작은 쪽/큰 쪽). 1 = 정면, 작을수록 고개가 옆으로 돌아감 */
  eyeWidthRatio: number;
  /** 고개 기울기(°) — 두 눈 바깥 끝을 잇는 선이 수평에서 벗어난 정도 */
  rollDeg: number;
}

export function checkPhoto(lm: readonly Pt[]): PhotoCheck {
  const a = dist(at(lm, LM.eyeA.outer), at(lm, LM.eyeA.inner)), b = dist(at(lm, LM.eyeB.outer), at(lm, LM.eyeB.inner));
  const l = at(lm, LM.eyeA.outer), r = at(lm, LM.eyeB.outer);
  return {
    eyeWidthPx: Math.min(a, b),
    eyeWidthRatio: Math.max(a, b) > 0 ? Math.min(a, b) / Math.max(a, b) : 0,
    rollDeg: (Math.atan2(r.y - l.y, r.x - l.x) * 180) / Math.PI,
  };
}
