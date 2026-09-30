/**
 * 마스카라(속눈썹) PNG 텍스처 — 눈꺼풀 선에 붙이는 띠 좌표와 눈 뜸 3단계.
 *
 * Ulike·SODA 방식을 따른다 (2026-09-30 조사 + 실기기 관찰):
 *  - 속눈썹은 3D 가 아니라 눈꺼풀 선에 붙인 그림 한 장이다 (45° 에서 얼굴 밖으로 안 튀어나옴, 매 프레임 같은 배치).
 *  - 눈 뜬 정도에 따라 위(up)·중간(mid)·아래(down) 그림을 **뚝 끊어** 바꿔 낀다 (섞지 않음).
 *
 * 그림 규격(u/v)은 client/public/lashes/lashes.json, 그림은 scripts/gen_lash_textures.py 가 만든다.
 * 이 파일은 DOM 없이 숫자만 다룬다 — 그리기는 screens/makeup-probe.ts.
 */

import type { Pt } from "./types";

export type LashState = "up" | "mid" | "down";

export interface LashTexMeta { file: string; vMin: number; vMax: number }
export interface LashMeta {
  version: number;
  uMin: number;
  uMax: number;
  textures: Record<LashState | "lower", LashTexMeta>;
}

/**
 * 눈 뜸 비율 = 윗·아랫눈꺼풀 가운데 사이 거리 ÷ 눈 폭.
 * 문턱 시작값(2026-09-30): danghaeung_poc_3x4_20 5명 정면 사진에서 눈 감음 0.038~0.104, 눈 뜸 0.349~0.408
 * (MediaPipe 는 감은 눈도 한쪽이 0.1 안팎으로 벌어져 나온다). 그 사이를 셋으로 나눴다 — 실기기에서 조정한다.
 * hysteresis: 문턱 근처에서 그림이 깜빡이지 않게, 지금 상태를 벗어나려면 이만큼 더 넘어야 한다.
 */
export const LASH_RULES = {
  upAbove: 0.24,
  downBelow: 0.13,
  hysteresis: 0.015,
  /** 눈꺼풀 선을 따라 나누는 칸 수 — 많을수록 곡선이 매끈하다 */
  segments: 24,
} as const;

/** 윗눈꺼풀·아랫눈꺼풀 점(같은 순서)과 눈 폭으로 눈 뜸 비율. 가운데 세 점 평균이라 한 점 흔들림에 덜 민감하다 */
export function eyeOpenness(upper: readonly Pt[], lower: readonly Pt[], eyeWidth: number): number {
  if (upper.length !== lower.length || upper.length < 3 || eyeWidth <= 0) return 0;
  const m = Math.floor(upper.length / 2);
  let sum = 0;
  for (const i of [m - 1, m, m + 1]) sum += Math.hypot(upper[i]!.x - lower[i]!.x, upper[i]!.y - lower[i]!.y);
  return sum / 3 / eyeWidth;
}

/** 눈 뜸 비율 → 상태. prev 가 있으면 문턱에 hysteresis 를 준다. 섞지 않고 셋 중 하나만 고른다 */
export function lashState(openness: number, prev: LashState | null, rules = LASH_RULES): LashState {
  const { upAbove: up, downBelow: down, hysteresis: h } = rules;
  if (prev === "up") return openness >= up - h ? "up" : openness <= down ? "down" : "mid";
  if (prev === "down") return openness <= down + h ? "down" : openness >= up ? "up" : "mid";
  if (prev === "mid") return openness >= up + h ? "up" : openness <= down - h ? "down" : "mid";
  return openness >= up ? "up" : openness <= down ? "down" : "mid";
}

/** 한 점 목록을 호 길이 기준 n+1 개로 다시 뽑는다 (Catmull-Rom). 반환: 점과 누적 호 길이 비율(0~1) */
export function resampleLid(pts: readonly Pt[], n: number): { p: Pt[]; t: number[] } {
  if (pts.length < 2) throw new Error("눈꺼풀 점이 2개 미만");
  const dense: Pt[] = [];
  const k = 8;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!, p1 = pts[i]!, p2 = pts[i + 1]!, p3 = pts[Math.min(pts.length - 1, i + 2)]!;
    for (let j = 0; j < k; j++) {
      const s = j / k, s2 = s * s, s3 = s2 * s;
      const f = (a: number, b: number, c: number, d: number): number =>
        0.5 * (2 * b + (-a + c) * s + (2 * a - 5 * b + 4 * c - d) * s2 + (-a + 3 * b - 3 * c + d) * s3);
      dense.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  dense.push(pts[pts.length - 1]!);
  const acc = [0];
  for (let i = 1; i < dense.length; i++) acc.push(acc[i - 1]! + Math.hypot(dense[i]!.x - dense[i - 1]!.x, dense[i]!.y - dense[i - 1]!.y));
  const L = acc[acc.length - 1]! || 1;
  const p: Pt[] = [], t: number[] = [];
  let j = 0;
  for (let i = 0; i <= n; i++) {
    const target = (i / n) * L;
    while (j < acc.length - 2 && acc[j + 1]! < target) j++;
    const seg = acc[j + 1]! - acc[j]! || 1;
    const f = Math.min(1, Math.max(0, (target - acc[j]!) / seg));
    p.push({ x: dense[j]!.x + (dense[j + 1]!.x - dense[j]!.x) * f, y: dense[j]!.y + (dense[j + 1]!.y - dense[j]!.y) * f });
    t.push(i / n);
  }
  return { p, t };
}

/** 띠의 한 세로줄: 텍스처 좌표(u, v)와 화면 좌표 */
export interface StripVertex { u: number; v: number; at: Pt }

/**
 * 눈꺼풀 선(안쪽 → 바깥 순) 위에 텍스처를 붙일 띠 격자를 만든다.
 * outward: 눈에서 먼 쪽을 가리키는 대략의 방향(윗눈꺼풀이면 눈 → 눈썹). 각 점의 법선을 이쪽으로 맞춘다.
 * 반환은 세로줄(column) 목록 — 각 줄은 [vMin, 0, vMax] 세 점. 이웃 두 줄 사이를 삼각형 넷으로 그리면 된다.
 * 양끝은 u 범위(uMin<0, uMax>1)만큼 접선 방향으로 곧게 늘린다 — 눈꼬리 밖으로 뻗는 윙 가닥 자리.
 */
export function lidStrip(lid: readonly Pt[], outward: Pt, eyeWidth: number, meta: Pick<LashMeta, "uMin" | "uMax">, tex: Pick<LashTexMeta, "vMin" | "vMax">, segments = LASH_RULES.segments): StripVertex[][] {
  const { p, t } = resampleLid(lid, segments);
  const n = p.length - 1;
  const lidLen = p.slice(1).reduce((a, q, i) => a + Math.hypot(q.x - p[i]!.x, q.y - p[i]!.y), 0) || 1;
  const tangent = (i: number): Pt => {
    const a = p[Math.max(0, i - 1)]!, b = p[Math.min(n, i + 1)]!;
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  };
  const normal = (tg: Pt): Pt => {
    const nx = -tg.y, ny = tg.x;
    return nx * outward.x + ny * outward.y >= 0 ? { x: nx, y: ny } : { x: -nx, y: -ny };
  };
  const cols: { u: number; at: Pt; n: Pt }[] = [];
  const t0 = tangent(0), tn = tangent(n);
  if (meta.uMin < 0) cols.push({ u: meta.uMin, at: { x: p[0]!.x + t0.x * meta.uMin * lidLen, y: p[0]!.y + t0.y * meta.uMin * lidLen }, n: normal(t0) });
  for (let i = 0; i <= n; i++) cols.push({ u: t[i]!, at: p[i]!, n: normal(tangent(i)) });
  if (meta.uMax > 1) {
    const e = (meta.uMax - 1) * lidLen;
    cols.push({ u: meta.uMax, at: { x: p[n]!.x + tn.x * e, y: p[n]!.y + tn.y * e }, n: normal(tn) });
  }
  return cols.map((c) => [tex.vMin, 0, tex.vMax].map((v) => ({ u: c.u, v, at: { x: c.at.x + c.n.x * v * eyeWidth, y: c.at.y + c.n.y * v * eyeWidth } })));
}

/** 텍스처 좌표 (u, v) → 그림 픽셀 */
export function texPx(u: number, v: number, meta: Pick<LashMeta, "uMin" | "uMax">, tex: Pick<LashTexMeta, "vMin" | "vMax">, w: number, h: number): Pt {
  return { x: ((u - meta.uMin) / (meta.uMax - meta.uMin)) * w, y: ((tex.vMax - v) / (tex.vMax - tex.vMin)) * h };
}

/**
 * 삼각형 src(그림 픽셀) → dst(화면) 아핀 변환 [a, b, c, d, e, f] (캔버스 setTransform 순서).
 * 세 점이 한 줄 위에 있으면 null.
 */
export function affine(s0: Pt, s1: Pt, s2: Pt, d0: Pt, d1: Pt, d2: Pt): [number, number, number, number, number, number] | null {
  const den = (s1.x - s0.x) * (s2.y - s0.y) - (s2.x - s0.x) * (s1.y - s0.y);
  if (Math.abs(den) < 1e-9) return null;
  const a = ((d1.x - d0.x) * (s2.y - s0.y) - (d2.x - d0.x) * (s1.y - s0.y)) / den;
  const c = ((d2.x - d0.x) * (s1.x - s0.x) - (d1.x - d0.x) * (s2.x - s0.x)) / den;
  const b = ((d1.y - d0.y) * (s2.y - s0.y) - (d2.y - d0.y) * (s1.y - s0.y)) / den;
  const d = ((d2.y - d0.y) * (s1.x - s0.x) - (d1.y - d0.y) * (s2.x - s0.x)) / den;
  return [a, b, c, d, d0.x - a * s0.x - c * s0.y, d0.y - b * s0.x - d * s0.y];
}
