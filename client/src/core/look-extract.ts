/**
 * 룩 옮기기 (실험) 2·3단계 — 포갠 화장 사진에서 화장만 떼어 내 얼굴에 입힌다.
 *
 * 포갠 뒤(look-transfer.ts)에는 화장 사진과 내 얼굴이 같은 자리에 있다. 그런데 그대로 빼면 피부색·조명 차이까지
 * 화장으로 읽힌다. 그래서 사진마다 "화장을 안 했다면 그 자리 살색이 뭐였을까"(맨살 바탕)를 주변 맨살에서 이어 붙여
 * 추정하고,
 *
 *     화장 = (화장 사진 − 화장 사진의 맨살 바탕) − (내 얼굴 − 내 맨살 바탕)
 *
 * 으로 잰다. 사람·조명이 달라도 "맨살 대비 얼마나 달라졌나"만 남는다. 입힐 때는 이 차이를 내 얼굴에 더한다.
 *
 * 한계 (숨기지 않는다):
 *  - 화장 사진 속 사람의 맨얼굴을 모른다. 그래서 그 사람의 원래 눈썹·쌍꺼풀·입술색도 "화장"에 섞여 온다.
 *  - 어느 사진에서든 머리카락·손·안경이 부위를 가리면 그것도 화장으로 읽힌다. 머리카락은 가림 지도(occluded)를
 *    주면 뺀다 — 손·안경은 못 뺀다.
 *  - 차이를 더하는 방식이라 필터·보정이 강한 사진은 그 색 그대로 옮겨 온다.
 *
 * 학습된 모델 없음, 순수 함수 — Node 에서도 돈다.
 */

import { pointInPoly, rgbToLab } from "./color";
import type { Lab, RgbaImage } from "./color";
import { LM, at, dist } from "./landmarks";
import type { WarpedFace } from "./look-transfer";
import type { Pt } from "./types";

export type TransferPart = "cheek" | "eye" | "brow" | "lip";
/** 얹는 순서. eye = 섀도 + 라이너 + 마스카라 (눈 둘레 전체) */
export const TRANSFER_PARTS: readonly TransferPart[] = ["cheek", "eye", "brow", "lip"];

/** 길이는 전부 눈 폭 대비 비율 — 눈대중 초기값, 실제 사진을 보며 조정한다 */
export const TRANSFER_PARAMS = {
  /** 맨살 바탕을 이어 붙이는 흐림 반경. 크면 조명 얼룩이 화장으로 남고, 작으면 볼터치가 맨살로 빨려 들어간다 */
  skinFieldBlur: 0.5,
  /** 맨살 표본에서 부위를 이만큼 더 넓게 뺀다 — 번진 화장이 맨살로 섞이지 않게 */
  skinExclude: 0.18,
  /** 맨살 중앙값에서 이보다 멀면(ΔE) 맨살이 아니다 — 머리카락·안경·손 */
  skinMaxDeltaE: 25,
  /** 얼굴 가장자리를 이만큼 안으로 깎는다 */
  edgeErode: 0.12,
  /** 가려진 곳(머리카락)을 이만큼 넓혀서, 이만큼 흐린 경계로 뺀다 — 잔머리 가장자리까지 */
  occludeGrow: 0.04,
  occludeFeather: 0.04,
  /**
   * 부위별: grow = 영역 넓히기, feather = 경계 흐림, smooth = 화장 차이 흐림(남의 점·주름이 덜 옮겨 오게).
   * 볼은 넓게 찾는다(0.4) — 블러셔는 광대 아래 · 바깥에도 바른다 (2026-10-06: 0.15 일 때 블러셔가 보이는 그림에서 볼 가이드가 안 나왔다).
   * skinGrow: 맨살 표본에서 뺄 때는 이 폭으로만 뺀다. 찾는 폭(0.4)만큼 다 빼면 눈 둘레의 맨살 표본이 모자라 맨살 바탕이 흔들려서,
   * 화장 없는 그림의 한쪽 눈두덩 전체가 "섀도우" 로 잡혔다 (같은 날, 시험 A)
   */
  part: {
    cheek: { grow: 0.4, feather: 0.2, smooth: 0.3, skinGrow: 0.15 },
    eye: { grow: 0, feather: 0.06, smooth: 0.025 },
    brow: { grow: 0.08, feather: 0.05, smooth: 0.04 },
    lip: { grow: 0.03, feather: 0.03, smooth: 0.03 },
  },
  /**
   * 화장이 "있다"고 치는 색 차이(ΔE). lo 아래는 없음, hi 위는 있음, 사이는 부드럽게.
   * 부위 영역은 넉넉히 잡은 "찾아볼 곳"일 뿐이라, 그 안에서도 색이 실제로 바뀐 곳만 화장으로 친다 — 안 그러면 주변 맨살의
   * 작은 톤 차이까지 같이 떼어 온다. 맨살의 잡음이 크면(생성 그림이 피부 결을 바꿈) noiseK 배만큼 lo 를 올린다
   */
  present: { lo: 2.5, hi: 7, noiseK: 2, soften: 0.02 },
  /**
   * 볼만 "화장 있음" 경계를 낮춘다. 블러셔는 넓고 연해서(색 차이 3 ~ 5) 위 경계로는 16 ~ 40% 만 입혀져 결과 그림에서 사라졌다.
   * 볼은 색 차이를 넓게 흐려서(smooth 0.3) 맨살 잡음이 0.4 ~ 1.0 으로 작으니 경계를 낮춰도 잡음이 덜 딸려 온다.
   * 2026-10-06 잰 값(볼의 색 차이 중앙값): 화장 없음 0.9 ~ 1.1, 연한 블러셔 3.6, 진한 블러셔 5 ~ 6
   */
  presentCheek: { lo: 1.6, hi: 4 },
  /**
   * 가늘고 진한 선(아이라이너 · 꼬리)을 살린다. 색 차이를 흐리면(part.smooth) 2 ~ 3px 선이 뭉개져 사라진다 —
   * 2026-10-06 시험 둘째 묶음에서 "다시 입힌 판" 의 라이너 꼬리가 10장 모두 사라졌다. 그래서 흐린 값과 흐리기 전 값의 차이가
   * 큰 칸(= 가늘고 진한 것)은 흐리기 전 값을 되살린다. parts = 적용할 부위, lo · hi = 되살리기 시작 · 다 되살리는 차이(ΔE).
   * 맨살에서도 그 차이가 크면(살결 · 잡음) lo 를 그 noiseK 배로 올린다.
   * pair: 어긋난 윤곽은 살리지 않는다. 생성 그림의 눈꺼풀 선이 내 것과 1 ~ 2px 어긋나면 "어두운 선 + 바로 옆 밝은 선" 한 쌍이 생기는데
   * (새 자리는 어두워지고 옛 자리는 밝아진다), 이것을 되살리면 없는 라이너 꼬리가 생긴다 (2026-10-06 G 시험: 꼬리가 없는 눈에 21% 꼬리).
   * 진짜 라이너는 어둡기만 하다. reach 안에서 밝기 차이를 부호째 더한 것 / 크기만 더한 것 = 1 이면 한쪽뿐(선), 0 이면 한 쌍(어긋남).
   * 이 비율이 pair.lo 아래면 안 살리고 pair.hi 위면 다 살린다
   */
  lines: { parts: ["eye"] as readonly string[], lo: 5, hi: 12, noiseK: 3, pair: { reach: 0.03, lo: 0.3, hi: 0.7 } },
  /**
   * 통째로 판단하는 부위 — 립스틱은 입술 전체에 바르니, 칸마다 따로 자르면 입술이 얼룩덜룩해진다 (noiseK 3 일 때 실제로 그랬다).
   * 영역 평균이 경계를 넘으면 영역 전체를 "있음" 으로 친다
   */
  whole: ["lip"] as readonly string[],
  /** 눈 둘레 타원 (눈 폭 대비): 가로 반지름, 위·아래 반지름, 중심을 눈꼬리 쪽·눈썹 쪽으로 옮기는 양 */
  eye: { rx: 0.95, up: 0.62, down: 0.42, shiftOut: 0.12, shiftUp: 0.1 },
} as const;

const EYE = {
  R: { outer: 33, inner: 133, ring: [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246] },
  L: { outer: 263, inner: 362, ring: [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466] },
} as const;
const BROW_POLY = { R: [...LM.browA.upper, ...[...LM.browA.lower].reverse()], L: [...LM.browB.upper, ...[...LM.browB.lower].reverse()] } as const;
const CHEEK_POLY = { R: [116, 117, 118, 101, 36, 205, 187, 123], L: [345, 346, 347, 330, 266, 425, 411, 352] } as const;
const LIPS_INNER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95] as const;

interface LabPlanes {
  L: Float32Array;
  a: Float32Array;
  b: Float32Array;
}

/** 떼어 낸 화장. 배열은 전부 내 얼굴 사진의 (x0, y0)부터 w×h 칸 */
export interface MakeupLayer {
  x0: number;
  y0: number;
  w: number;
  h: number;
  /** 눈 폭(px) — 이 얼굴에서 길이의 단위 */
  u: number;
  /** 내 얼굴의 Lab — 세기를 바꿔 다시 입힐 때 매번 변환하지 않으려고 둔다 */
  bare: LabPlanes;
  /** 내 맨살 중앙값 */
  skin: Lab;
  /** 맨살 표본으로 쓴 칸 수 (내 얼굴, 화장 사진) — 너무 적으면 맨살 바탕을 못 믿는다 */
  skinSamples: { bare: number; ref: number };
  /** 내 얼굴에서 맨살 표본으로 쓴 칸(1) — 다른 사진의 피부색을 같은 자리에서 잴 때 쓴다 */
  skinMask: Uint8Array;
  /** 부위별로 가려져서 뺀 넓이의 비율(0~1). 크면 그 부위 화장은 믿기 어렵다 */
  hidden: Record<TransferPart, number>;
  /** 얼굴 안쪽 전체(0~1) — 가장자리는 깎고 머리카락이 덮은 곳·눈동자·입 안은 뺀 것. 다른 그림의 얼굴만 오려 붙일 때 쓴다 */
  face: Float32Array;
  /**
   * 부위별: mask = 찾아본 영역(0~1), amount = 그 칸에 화장이 있는 정도(0~1, 색이 실제로 바뀐 곳만 1), dL·da·db = 맨살 대비 색 차이.
   * 입힐 때 무게는 mask × amount — 영역 안이라도 안 바뀐 맨살은 건드리지 않는다
   */
  parts: Record<TransferPart, { mask: Float32Array; amount: Float32Array; dL: Float32Array; da: Float32Array; db: Float32Array }>;
  /** 부위별 맨살 잡음(화장 부위가 아닌 맨살에서 두 그림이 다른 정도, ΔE)과 그래서 정한 "화장 있음" 경계 */
  present: Record<TransferPart, { noise: number; lo: number; hi: number }>;
}

/** 약한 변화(맨살 잡음 수준)를 어떻게 하나 — "drop" 은 버린다(기본: 주변 맨살을 건드리지 않는다), "keep" 은 영역 안이면 전부 입힌다 */
export type WeakMode = "drop" | "keep";

/** Lab → sRGB(0~255). color.ts rgbToLab 의 역 */
export function labToRgb(L: number, a: number, b: number): [number, number, number] {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const inv = (t: number): number => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  const X = inv(fx) * 0.95047, Y = inv(fy), Z = inv(fz) * 1.08883;
  const gamma = (c: number): number => 255 * Math.max(0, Math.min(1, c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));
  return [gamma(X * 3.2406 - Y * 1.5372 - Z * 0.4986), gamma(-X * 0.9689 + Y * 1.8758 + Z * 0.0415), gamma(X * 0.0557 - Y * 0.204 + Z * 1.057)];
}

/** 상자 흐림 세 번 ≈ 가우시안. 늘 새 배열을 돌려준다. r(px)이 1보다 작으면 흐리지 않은 사본 */
export function blur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const rad = Math.round(r);
  const out = Float32Array.from(src);
  if (rad < 1) return out;
  const tmp = new Float32Array(w * h);
  /** from 의 한 줄(n칸, 칸 간격 step)을 흐려 to 에 쓴다. 줄 밖은 가장자리 값 */
  const pass = (from: Float32Array, to: Float32Array, n: number, lines: number, step: number, lineStep: number): void => {
    for (let l = 0; l < lines; l++) {
      const base = l * lineStep;
      let sum = 0;
      for (let k = -rad; k <= rad; k++) sum += from[base + Math.max(0, Math.min(n - 1, k)) * step]!;
      for (let i = 0; i < n; i++) {
        to[base + i * step] = sum / (2 * rad + 1);
        sum += from[base + Math.min(n - 1, i + rad + 1) * step]! - from[base + Math.max(0, i - rad) * step]!;
      }
    }
  };
  for (let k = 0; k < 3; k++) {
    pass(out, tmp, w, h, 1, w);
    pass(tmp, out, h, w, w, 1);
  }
  return out;
}

/**
 * 값이 있는 곳(valid)만 써서 흐리는 함수를 만든다 — 눈동자·얼굴 밖·머리카락 값이 번져 들어오지 않는다.
 * 주변에 값이 하나도 없으면 fallback.
 */
function validBlur(valid: Float32Array, w: number, h: number, r: number): (x: Float32Array, fallback: number) => Float32Array {
  const den = blur(valid, w, h, r);
  return (x, fallback) => {
    const xv = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) xv[i] = x[i]! * valid[i]!;
    const num = blur(xv, w, h, r);
    for (let i = 0; i < x.length; i++) num[i] = den[i]! > 1e-3 ? num[i]! / den[i]! : fallback;
    return num;
  };
}

function median(v: number[]): number {
  if (!v.length) return 0;
  v.sort((p, q) => p - q);
  return v[v.length >> 1]!;
}

/** 가림 지도: 내 얼굴 사진과 같은 구도에서 "이 칸은 살이 아니다"(머리카락)의 확률 0~1. 크기는 달라도 된다(비율로 맞춘다) */
export interface OcclusionMap {
  w: number;
  h: number;
  data: ArrayLike<number>;
}

/**
 * 화장만 뗀다.
 * bare = 내 맨얼굴 사진, warped = 내 얼굴 모양으로 포갠 화장 사진(warpToFace, bare 와 같은 크기), lm = 내 얼굴 점(px).
 * occluded = 두 사진 중 어느 쪽에서든 머리카락이 덮은 곳 (없으면 안 뺀다).
 */
export function extractMakeup(bare: RgbaImage, warped: WarpedFace, lm: readonly Pt[], occluded?: OcclusionMap | null): MakeupLayer {
  if (warped.w !== bare.w || warped.h !== bare.h) throw new Error(`포갠 사진 크기(${warped.w}×${warped.h})가 내 사진(${bare.w}×${bare.h})과 다름`);
  const T = TRANSFER_PARAMS;
  const P = (i: number): Pt => at(lm, i);
  const pts = (ids: readonly number[]): Pt[] => ids.map(P);
  /** 눈 폭(px) — 모든 길이의 단위 */
  const u = (dist(P(EYE.R.outer), P(EYE.R.inner)) + dist(P(EYE.L.outer), P(EYE.L.inner))) / 2;

  // 얼굴 둘레 칸만 계산한다
  let xa = Infinity, ya = Infinity, xb = -Infinity, yb = -Infinity;
  for (let i = 0; i < Math.min(468, lm.length); i++) {
    const p = lm[i]!;
    xa = Math.min(xa, p.x);
    ya = Math.min(ya, p.y);
    xb = Math.max(xb, p.x);
    yb = Math.max(yb, p.y);
  }
  const pad = u * 0.3;
  const x0 = Math.max(0, Math.floor(xa - pad)), y0 = Math.max(0, Math.floor(ya - pad));
  const w = Math.max(1, Math.min(bare.w, Math.ceil(xb + pad)) - x0), h = Math.max(1, Math.min(bare.h, Math.ceil(yb + pad)) - y0);
  const n = w * h;

  /** 다각형 안 = 1 */
  const fill = (polys: readonly (readonly Pt[])[]): Float32Array => {
    const m = new Float32Array(n);
    for (const poly of polys) {
      let px0 = Infinity, py0 = Infinity, px1 = -Infinity, py1 = -Infinity;
      for (const p of poly) {
        px0 = Math.min(px0, p.x);
        py0 = Math.min(py0, p.y);
        px1 = Math.max(px1, p.x);
        py1 = Math.max(py1, p.y);
      }
      const cx0 = Math.max(0, Math.floor(px0) - x0), cx1 = Math.min(w - 1, Math.ceil(px1) - x0);
      const cy0 = Math.max(0, Math.floor(py0) - y0), cy1 = Math.min(h - 1, Math.ceil(py1) - y0);
      for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) if (pointInPoly(x + x0, y + y0, poly)) m[y * w + x] = 1;
    }
    return m;
  };
  /** 영역을 r(px)만큼 넓힌다 */
  const grow = (m: Float32Array, r: number): Float32Array => (Math.round(r) < 1 ? Float32Array.from(m) : blur(m, w, h, r).map((v) => (v > 0.02 ? 1 : 0)));

  /** 눈 둘레 타원 — 눈 축(안쪽 → 바깥 눈꼬리)과 눈썹 쪽을 기준으로 잡아 고개가 기울어도 따라간다 */
  const eyeEllipse = (side: "R" | "L"): Pt[] => {
    const inner = P(EYE[side].inner), outer = P(EYE[side].outer);
    const ew = dist(inner, outer) || 1;
    const ax = { x: (outer.x - inner.x) / ew, y: (outer.y - inner.y) / ew };
    const browPts = pts(BROW_POLY[side]);
    const brow = { x: browPts.reduce((s, p) => s + p.x, 0) / browPts.length, y: browPts.reduce((s, p) => s + p.y, 0) / browPts.length };
    const mid = { x: (inner.x + outer.x) / 2, y: (inner.y + outer.y) / 2 };
    const sign = (brow.x - mid.x) * -ax.y + (brow.y - mid.y) * ax.x >= 0 ? 1 : -1;
    const up = { x: -ax.y * sign, y: ax.x * sign };
    const c = { x: mid.x + (ax.x * T.eye.shiftOut + up.x * T.eye.shiftUp) * ew, y: mid.y + (ax.y * T.eye.shiftOut + up.y * T.eye.shiftUp) * ew };
    return Array.from({ length: 40 }, (_, k) => {
      const t = (k / 40) * 2 * Math.PI, sv = Math.sin(t);
      const cu = Math.cos(t) * T.eye.rx * ew, cv = sv * (sv >= 0 ? T.eye.up : T.eye.down) * ew;
      return { x: c.x + ax.x * cu + up.x * cv, y: c.y + ax.y * cu + up.y * cv };
    });
  };

  // 화장이 있을 수 없는 곳: 눈 뜬 틈(눈동자) · 입 안
  const eyeOpen = blur(fill([pts(EYE.R.ring), pts(EYE.L.ring)]), w, h, 0.03 * u);
  const mouthOpen = blur(fill([pts(LIPS_INNER)]), w, h, 0.02 * u);

  // 얼굴 안쪽 — 포갠 사진이 있는 곳에서 가장자리를 깎는다
  const alpha = new Float32Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) alpha[y * w + x] = (warped.data[((y + y0) * warped.w + x + x0) * 4 + 3] ?? 0) > 0 ? 1 : 0;
  const inside = blur(alpha, w, h, T.edgeErode * u).map((v) => Math.max(0, Math.min(1, (v - 0.6) / 0.35)));

  // 가려진 곳 (머리카락)
  const occ = new Float32Array(n);
  if (occluded) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const mx = Math.max(0, Math.min(occluded.w - 1, Math.floor(((x + x0) * occluded.w) / bare.w)));
      const my = Math.max(0, Math.min(occluded.h - 1, Math.floor(((y + y0) * occluded.h) / bare.h)));
      occ[y * w + x] = (occluded.data[my * occluded.w + mx] ?? 0) >= 0.5 ? 1 : 0;
    }
  }
  const occSoft = blur(grow(occ, T.occludeGrow * u), w, h, T.occludeFeather * u);

  // 부위 영역
  const raw: Record<TransferPart, Float32Array> = {
    cheek: fill([pts(CHEEK_POLY.R), pts(CHEEK_POLY.L)]),
    eye: fill([eyeEllipse("R"), eyeEllipse("L")]),
    brow: fill([pts(BROW_POLY.R), pts(BROW_POLY.L)]),
    lip: fill([pts(LM.lipsOuter)]),
  };
  const mask = {} as Record<TransferPart, Float32Array>;
  for (const p of TRANSFER_PARTS) mask[p] = blur(grow(raw[p], T.part[p].grow * u), w, h, T.part[p].feather * u);
  // 볼 영역은 넓게 잡으므로(아래 주석) 입술 둘레는 뺀다 — 입술 색이 번진 것이 볼터치로 잡히지 않게
  const nearLip = blur(grow(raw.lip, 0.15 * u), w, h, 0.1 * u);
  for (let i = 0; i < n; i++) {
    // 눈 영역은 눈썹과 겹치지 않게, 볼은 눈 영역과 겹치지 않게 — 한 칸이 두 부위에 두 번 더해지지 않는다
    mask.brow[i] = mask.brow[i]! * inside[i]!;
    mask.eye[i] = mask.eye[i]! * (1 - eyeOpen[i]!) * (1 - mask.brow[i]!) * inside[i]!;
    mask.cheek[i] = mask.cheek[i]! * (1 - mask.eye[i]!) * (1 - nearLip[i]!) * inside[i]!;
    mask.lip[i] = mask.lip[i]! * (1 - mouthOpen[i]!) * inside[i]!;
  }
  // 가려진 곳은 부위에서 뺀다. 얼마나 뺐는지 남긴다
  const hidden = {} as Record<TransferPart, number>;
  for (const p of TRANSFER_PARTS) {
    let all = 0, lost = 0;
    for (let i = 0; i < n; i++) {
      const before = mask[p][i]!, after = before * (1 - Math.min(1, occSoft[i]!));
      all += before;
      lost += before - after;
      mask[p][i] = after;
    }
    hidden[p] = all > 0 ? lost / all : 0;
  }

  const toLab = (im: { data: RgbaImage["data"]; w: number }): LabPlanes => {
    const L = new Float32Array(n), a = new Float32Array(n), b = new Float32Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = ((y + y0) * im.w + x + x0) * 4, o = y * w + x;
      const c = rgbToLab(im.data[i] ?? 0, im.data[i + 1] ?? 0, im.data[i + 2] ?? 0);
      L[o] = c.L;
      a[o] = c.a;
      b[o] = c.b;
    }
    return { L, a, b };
  };
  const B = toLab(bare), R = toLab(warped);

  const face = new Float32Array(n);
  for (let i = 0; i < n; i++) face[i] = inside[i]! * (1 - Math.min(1, occSoft[i]!)) * (1 - eyeOpen[i]!) * (1 - mouthOpen[i]!);

  // 맨살 표본 후보: 얼굴 안쪽에서 부위(넓게)·눈·입을 뺀 곳
  const skinBase = new Float32Array(n);
  for (let i = 0; i < n; i++) skinBase[i] = inside[i]! > 0.99 && eyeOpen[i]! < 0.01 && mouthOpen[i]! < 0.01 && occSoft[i]! < 0.01 ? 1 : 0;
  for (const p of TRANSFER_PARTS) {
    const part = T.part[p] as { grow: number; skinGrow?: number };
    const wide = grow(raw[p], ((part.skinGrow ?? part.grow) + T.skinExclude) * u);
    for (let i = 0; i < n; i++) if (wide[i]! > 0) skinBase[i] = 0;
  }

  /** 맨살 바탕: 후보 중앙값에서 먼 것(머리카락·안경·손)을 버리고 남은 맨살을 이어 붙인다 */
  const skinField = (im: LabPlanes): LabPlanes & { med: Lab; count: number; used: Float32Array } => {
    const ls: number[] = [], as: number[] = [], bs: number[] = [];
    for (let i = 0; i < n; i++) {
      if (!skinBase[i]) continue;
      ls.push(im.L[i]!);
      as.push(im.a[i]!);
      bs.push(im.b[i]!);
    }
    const med = { L: median(ls), a: median(as), b: median(bs) };
    const s = new Float32Array(n);
    let count = 0;
    for (let i = 0; i < n; i++) {
      if (!skinBase[i] || Math.hypot(im.L[i]! - med.L, im.a[i]! - med.a, im.b[i]! - med.b) >= T.skinMaxDeltaE) continue;
      s[i] = 1;
      count++;
    }
    const f = validBlur(s, w, h, T.skinFieldBlur * u);
    return { L: f(im.L, med.L), a: f(im.a, med.a), b: f(im.b, med.b), med, count, used: s };
  };
  const FB = skinField(B), FR = skinField(R);

  // 화장 = (화장 사진 − 그 맨살 바탕) − (내 얼굴 − 내 맨살 바탕)
  const valid = new Float32Array(n);
  for (let i = 0; i < n; i++) valid[i] = alpha[i]! > 0 && eyeOpen[i]! < 0.5 && mouthOpen[i]! < 0.5 && occ[i]! < 0.5 ? 1 : 0;
  const diff = (c: "L" | "a" | "b"): Float32Array => {
    const d = new Float32Array(n);
    for (let i = 0; i < n; i++) d[i] = R[c][i]! - FR[c][i]! - (B[c][i]! - FB[c][i]!);
    return d;
  };
  const dL = diff("L"), da = diff("a"), db = diff("b");
  const parts = {} as MakeupLayer["parts"];
  const present = {} as MakeupLayer["present"];
  for (const p of TRANSFER_PARTS) {
    const f = validBlur(valid, w, h, T.part[p].smooth * u);
    const pL = f(dL, 0), pa = f(da, 0), pb = f(db, 0);
    if (T.lines.parts.includes(p)) {
      // 가늘고 진한 선 되살리기 — 맨살에서 "흐린 값과 흐리기 전 값의 차이" 가 보통 얼마인지부터 잰다
      const rest: number[] = [];
      for (let i = 0; i < n; i++) if (FB.used[i] && FR.used[i]) rest.push(Math.hypot(dL[i]! - pL[i]!, da[i]! - pa[i]!, db[i]! - pb[i]!));
      const from = Math.max(T.lines.lo, T.lines.noiseK * median(rest)), to = Math.max(T.lines.hi, from * 2);
      // 어긋난 윤곽(어두운 선 + 밝은 선 한 쌍)인지: 둘레에서 밝기 차이를 부호째 더한 것과 크기만 더한 것을 견준다.
      // 흐리기 전 값(dL)으로 본다 — "흐린 값과의 차이" 는 진짜 선도 가운데는 −, 양옆은 + 라서 늘 한 쌍처럼 보인다
      const signed = new Float32Array(n), size = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        if (!valid[i]) continue;
        signed[i] = dL[i]!;
        size[i] = Math.abs(dL[i]!);
      }
      const sumSigned = blur(signed, w, h, T.lines.pair.reach * u), sumSize = blur(size, w, h, T.lines.pair.reach * u);
      for (let i = 0; i < n; i++) {
        if (!valid[i]) continue;
        const rL = dL[i]! - pL[i]!, ra = da[i]! - pa[i]!, rb = db[i]! - pb[i]!;
        const t = Math.max(0, Math.min(1, (Math.hypot(rL, ra, rb) - from) / (to - from)));
        const oneSided = sumSize[i]! > 1e-6 ? Math.abs(sumSigned[i]!) / sumSize[i]! : 1;
        const q = Math.max(0, Math.min(1, (oneSided - T.lines.pair.lo) / (T.lines.pair.hi - T.lines.pair.lo)));
        const k = t * t * (3 - 2 * t) * q * q * (3 - 2 * q);
        if (k === 0) continue;
        pL[i] = pL[i]! + k * rL;
        pa[i] = pa[i]! + k * ra;
        pb[i] = pb[i]! + k * rb;
      }
    }
    // 맨살 잡음: 화장 부위가 아닌 맨살(두 그림 모두 맨살로 본 칸)에서 같은 방법으로 잰 차이 — 이만큼은 화장이 아니어도 난다
    const skinDiff: number[] = [];
    for (let i = 0; i < n; i++) if (FB.used[i] && FR.used[i]) skinDiff.push(Math.hypot(pL[i]!, pa[i]!, pb[i]!));
    const noise = median(skinDiff);
    const base = p === "cheek" ? T.presentCheek : T.present;
    const lo = Math.max(base.lo, T.present.noiseK * noise), hi = Math.max(base.hi, lo * 2);
    const step = (v: number): number => {
      const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
      return t * t * (3 - 2 * t);
    };
    const raw = new Float32Array(n);
    for (let i = 0; i < n; i++) raw[i] = step(Math.hypot(pL[i]!, pa[i]!, pb[i]!));
    if (T.whole.includes(p)) {
      let sum = 0, cnt = 0;
      for (let i = 0; i < n; i++) {
        if (mask[p][i]! < 0.5) continue;
        sum += Math.hypot(pL[i]!, pa[i]!, pb[i]!);
        cnt++;
      }
      const all = cnt ? step(sum / cnt) : 0;
      for (let i = 0; i < n; i++) raw[i] = Math.max(raw[i]!, all);
    }
    // 점점이 튀지 않게 가장자리만 살짝 흐린다 — 흐려서 값이 내려가게 두지는 않는다 (가는 선은 흐리면 "있음" 이 0.3 쯤으로 깎여 사라진다)
    const soft = blur(raw, w, h, T.present.soften * u);
    for (let i = 0; i < n; i++) if (raw[i]! > soft[i]!) soft[i] = raw[i]!;
    parts[p] = { mask: mask[p], amount: soft, dL: pL, da: pa, db: pb };
    present[p] = { noise, lo, hi };
  }
  return { x0, y0, w, h, u, bare: B, skin: FB.med, skinSamples: { bare: FB.count, ref: FR.count }, skinMask: Uint8Array.from(FB.used), hidden, face, parts, present };
}

export type PartStrength = Partial<Record<TransferPart, number>>;

/** 그 칸에 화장을 얼마나 입히나: 영역 × (약한 변화를 버리면) 화장이 있는 정도 */
function weightAt(part: MakeupLayer["parts"][TransferPart], i: number, weak: WeakMode): number {
  return weak === "drop" ? part.mask[i]! * part.amount[i]! : part.mask[i]!;
}

/**
 * 떼어 낸 화장을 내 얼굴에 입힌다. strength: 부위별 세기(0 = 끔, 1 = 화장 사진만큼). 내 사진과 같은 크기의 RGBA.
 * weak "drop"(기본)이면 색이 실제로 바뀐 곳에만 입힌다 — 영역 안의 맨살은 내 사진 그대로
 */
export function applyMakeup(bare: RgbaImage, layer: MakeupLayer, strength: PartStrength = {}, weak: WeakMode = "drop"): Uint8ClampedArray {
  const out = new Uint8ClampedArray(bare.data);
  const { x0, y0, w, h } = layer;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    let L = layer.bare.L[i]!, a = layer.bare.a[i]!, b = layer.bare.b[i]!, touched = false;
    for (const p of TRANSFER_PARTS) {
      const part = layer.parts[p], k = weightAt(part, i, weak) * (strength[p] ?? 1);
      if (k === 0) continue;
      L += k * part.dL[i]!;
      a += k * part.da[i]!;
      b += k * part.db[i]!;
      touched = true;
    }
    if (touched) out.set(labToRgb(L, a, b), ((y + y0) * bare.w + x + x0) * 4);
  }
  return out;
}

/**
 * 다른 그림(other — 생성 모델이 만든 "화장한 내 얼굴" 등, 내 사진과 같은 크기·같은 구도)에서 고른 곳만 내 얼굴에 붙인다.
 * area "parts" = 화장 부위만(부위별 세기, weak "drop" 이면 그 안에서도 색이 바뀐 곳만), "face" = 얼굴 안쪽 전체(세기는 strength.all).
 * 그 밖은 내 사진 그대로 — 머리카락·배경·얼굴 윤곽이 바뀌지 않는다.
 */
export function pasteRegions(bare: RgbaImage, other: RgbaImage, layer: MakeupLayer, area: "parts" | "face", strength: PartStrength & { all?: number } = {}, weak: WeakMode = "drop"): Uint8ClampedArray {
  if (other.w !== bare.w || other.h !== bare.h) throw new Error(`붙일 그림 크기(${other.w}×${other.h})가 내 사진(${bare.w}×${bare.h})과 다름`);
  const out = new Uint8ClampedArray(bare.data);
  const { x0, y0, w, h } = layer;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    let k = 0;
    if (area === "face") k = layer.face[i]! * (strength.all ?? 1);
    else for (const p of TRANSFER_PARTS) k = Math.max(k, weightAt(layer.parts[p], i, weak) * (strength[p] ?? 1));
    if (k <= 0) continue;
    k = Math.min(1, k);
    const o = ((y + y0) * bare.w + x + x0) * 4;
    for (let c = 0; c < 3; c++) out[o + c] = (bare.data[o + c] ?? 0) * (1 - k) + (other.data[o + c] ?? 0) * k;
  }
  return out;
}

/**
 * 닮음을 잴 때: weights = 부위 무게(가이드에 중요한 눈이 가장 크다), quiet = 영역 평균 색 변화가 이보다 작으면 "그 부위엔 화장 없음"(ΔE),
 * blur = 견주기 전에 흐리는 정도(눈 폭 대비 — 몇 px 어긋난 것은 봐준다), maxHidden = 이보다 많이 가려진 부위는 셈에서 뺀다. 전부 눈대중 초기값
 */
export const MATCH = { weights: { eye: 0.4, lip: 0.25, brow: 0.2, cheek: 0.15 }, quiet: 0.5, blur: 0.04, maxHidden: 0.5 } as const;

export interface LookMatch {
  /** 부위별: sim = 닮음(−1~1), ref·got = 그 부위의 평균 색 변화(ΔE, 기준 쪽·견주는 쪽), used = 셈에 넣었나 */
  parts: Record<TransferPart, { sim: number; ref: number; got: number; used: boolean }>;
  /** 부위 무게 평균 (0~1). 1 = 모든 부위에서 같은 자리에 같은 색 방향 */
  score: number;
}

/**
 * 두 "떼어 낸 화장" 이 얼마나 닮았나 — 같은 얼굴(내 맨얼굴) 자리에 놓인 두 layer 를 부위별로 견준다.
 * ref = 화장 사진의 화장을 내 얼굴 자리로 옮긴 것, got = 생성 그림에서 뗀 것.
 *
 * 닮음 = 두 색 변화 그림의 방향이 얼마나 같은가 (코사인). 같은 자리에 같은 색 쪽으로 바뀌었으면 1, 자리가 다르거나(없던 꼬리를 그림)
 * 색이 반대면 낮다. 진하기(크기)는 보지 않는다 — 화장 사진은 조명·보정이 달라 진하기를 믿을 수 없다.
 * 한쪽에만 화장이 있으면 0, 둘 다 없으면 1 ("안 한 것을 안 그렸다").
 */
export function matchLook(ref: MakeupLayer, got: MakeupLayer): LookMatch {
  if (ref.x0 !== got.x0 || ref.y0 !== got.y0 || ref.w !== got.w || ref.h !== got.h) throw new Error("두 layer 가 같은 얼굴 자리에 있지 않음");
  const { w, h } = ref, n = w * h, r = MATCH.blur * ref.u;
  const field = (amount: Float32Array, d: Float32Array): Float32Array => {
    const f = new Float32Array(n);
    for (let i = 0; i < n; i++) f[i] = amount[i]! * d[i]!;
    return blur(f, w, h, r);
  };
  const parts = {} as LookMatch["parts"];
  let total = 0, weight = 0;
  for (const p of TRANSFER_PARTS) {
    const A = ref.parts[p], B = got.parts[p];
    const a = [field(A.amount, A.dL), field(A.amount, A.da), field(A.amount, A.db)] as const;
    const b = [field(B.amount, B.dL), field(B.amount, B.da), field(B.amount, B.db)] as const;
    let dot = 0, aa = 0, bb = 0, ea = 0, eb = 0, ws = 0;
    for (let i = 0; i < n; i++) {
      const m = Math.min(A.mask[i]!, B.mask[i]!);
      if (m <= 0) continue;
      const a2 = a[0][i]! ** 2 + a[1][i]! ** 2 + a[2][i]! ** 2, b2 = b[0][i]! ** 2 + b[1][i]! ** 2 + b[2][i]! ** 2;
      dot += m * (a[0][i]! * b[0][i]! + a[1][i]! * b[1][i]! + a[2][i]! * b[2][i]!);
      aa += m * a2;
      bb += m * b2;
      ea += m * Math.sqrt(a2);
      eb += m * Math.sqrt(b2);
      ws += m;
    }
    const refE = ws ? ea / ws : 0, gotE = ws ? eb / ws : 0;
    const quietA = refE < MATCH.quiet, quietB = gotE < MATCH.quiet;
    const sim = ws === 0 ? 0 : quietA && quietB ? 1 : quietA || quietB ? 0 : dot / Math.sqrt(aa * bb);
    const used = ws > 0 && ref.hidden[p] <= MATCH.maxHidden && got.hidden[p] <= MATCH.maxHidden;
    parts[p] = { sim, ref: refE, got: gotE, used };
    if (used) {
      total += MATCH.weights[p] * Math.max(0, sim);
      weight += MATCH.weights[p];
    }
  }
  return { parts, score: weight ? total / weight : 0 };
}

/**
 * 부위별로 색이 얼마나 바뀌었나 — 영역(0.5 이상) 안 색 차이 크기의 평균(ΔE76).
 * 작으면 그 부위에는 화장이 안 보인다 (service-definition §6 "화장이 보이나" — 만든 뒤 맨얼굴과 차이로 본다)
 */
export function partChange(layer: MakeupLayer): Record<TransferPart, number> {
  const out = {} as Record<TransferPart, number>;
  for (const p of TRANSFER_PARTS) {
    const { mask, dL, da, db } = layer.parts[p];
    let sum = 0, cnt = 0;
    for (let i = 0; i < mask.length; i++) {
      if (mask[i]! < 0.5) continue;
      sum += Math.hypot(dL[i]!, da[i]!, db[i]!);
      cnt++;
    }
    out[p] = cnt ? sum / cnt : 0;
  }
  return out;
}

/**
 * 떼어 낸 화장만 본다 — 내 맨살 중앙값 한 색 위에 화장 차이를 올린 그림 (layer.w × layer.h RGBA).
 * 화장이 없는 곳은 투명 — weak "drop"(기본)이면 영역 안이라도 색이 안 바뀐 맨살은 투명이다
 */
export function makeupPreview(layer: MakeupLayer, strength: PartStrength = {}, weak: WeakMode = "drop"): Uint8ClampedArray {
  const out = new Uint8ClampedArray(layer.w * layer.h * 4);
  for (let i = 0; i < layer.w * layer.h; i++) {
    let L = layer.skin.L, a = layer.skin.a, b = layer.skin.b, m = 0;
    for (const p of TRANSFER_PARTS) {
      const part = layer.parts[p], wgt = weightAt(part, i, weak), k = wgt * (strength[p] ?? 1);
      L += k * part.dL[i]!;
      a += k * part.da[i]!;
      b += k * part.db[i]!;
      m = Math.max(m, Math.min(1, k));
    }
    out.set([...labToRgb(L, a, b), 255 * m], i * 4);
  }
  return out;
}
