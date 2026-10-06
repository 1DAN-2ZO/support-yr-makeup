/**
 * 화장 떼기 (2026-10-06 POC) — AI 가 내 얼굴에 입힌 화장 사진에서, 맨얼굴과의 차이로 부위별 화장 모양을 떼서 가이드로 쓴다.
 * 사용자가 고른 목표 = AI 가 내 얼굴에 입힌 그 모습이라, 거기서 떼야 "본 대로 그리면 맞는" 가이드가 된다 (사용자와 정리).
 *
 * 두 사진은 같은 크기 · 같은 자리로 맞춰져 있어야 한다 (AI 결과는 얼굴 점으로 맨얼굴에 맞춰 넘긴다).
 *  1. 화장 안 하는 자리(이마)의 색 차이 = AI 가 바꾼 조명 · 피부 톤 → 화장 사진 전체에서 뺀다
 *  2. 부위 찾을 자리 안에서 픽셀마다 색 차(ΔE)
 *  3. 블러셔: 가장 진한 곳의 BLUSH_EXTRACT.edge 까지를 화장으로 → 덩어리 모멘트로 타원(가운데 · 반지름 · 기울기)
 *     완성본(makeup-paint)의 방사형 블러셔는 그 자리가 지금 가이드 타원과 거의 같다
 * 다른 부위(섀도우 · 라이너 · 입술 · 눈썹)는 다음.
 */

import { deltaE, foreheadLab, labAt, type Lab, type RgbaImage } from "./color";
import { LM } from "./landmarks";
import type { Side } from "./score";
import type { Pt } from "./types";

/**
 * minDeltaE: 가장 진한 곳 색 차가 이보다 작으면 블러셔 없음 · edge: 가장 진한 곳의 이 비율까지 화장으로 본다 ·
 * peakPct: 가장 진한 곳 = 자리 안 색 차의 이 백분위(튀는 점 무시) · minPixels: 덩어리가 이보다 작으면 없음. 눈대중 시작값
 */
export const BLUSH_EXTRACT = { minDeltaE: 3, edge: 0.3, peakPct: 0.98, minPixels: 40 } as const;

export interface ExtractedBlob {
  center: Pt;
  /** 긴 · 짧은 반지름 (px) */
  rx: number;
  ry: number;
  /** 긴 축 기울기 (사진 좌표, °) */
  angleDeg: number;
  /** 타원 테두리 (가이드로 쓴다) */
  outline: Pt[];
  /** 가장 진한 곳 색 차 */
  peakDeltaE: number;
}

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: Pt, b: Pt): number => a.x * b.x + a.y * b.y;

/** 얼굴 좌표: 원점 = 두 눈꼬리 가운데, u = 사진 왼쪽 눈꼬리 → 오른쪽 눈꼬리, v = u 에 수직(아래) */
function faceFrame(lm: readonly Pt[]) {
  const a = lm[LM.eyeA.outer]!, b = lm[LM.eyeB.outer]!, d = sub(b, a), len = Math.hypot(d.x, d.y) || 1;
  const u = { x: d.x / len, y: d.y / len }, v = { x: -u.y, y: u.x }, o = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return {
    eyeW: len,
    to: (p: Pt) => ({ a: dot(sub(p, o), u), b: dot(sub(p, o), v) }),
    from: (a2: number, b2: number): Pt => ({ x: o.x + u.x * a2 + v.x * b2, y: o.y + u.y * a2 + v.y * b2 }),
  };
}

/** 볼 찾을 자리 (얼굴 좌표 범위) — 그쪽 눈 아래 ~ 입꼬리 높이, 눈머리 ~ 얼굴 옆선 조금 안쪽 */
function cheekZone(lm: readonly Pt[], side: Side) {
  const f = faceFrame(lm), eye = side === "R" ? LM.eyeA : LM.eyeB;
  const lowLid = Math.max(...eye.lower.map((i) => f.to(lm[i]!).b));
  const mouth = (f.to(lm[LM.lipsOuter[0]!]!).b + f.to(lm[LM.lipsOuter[Math.floor(LM.lipsOuter.length / 2)]!]!).b) / 2;
  const edgeR = f.to(lm[LM.faceL]!).a, edgeL = f.to(lm[LM.faceR]!).a, inner = f.to(lm[eye.inner]!).a;
  const pad = 0.03 * f.eyeW;
  const [a0, a1] = side === "R" ? [Math.min(edgeR, edgeL) + pad, inner] : [inner, Math.max(edgeR, edgeL) - pad];
  return { f, a0: Math.min(a0, a1), a1: Math.max(a0, a1), b0: lowLid + pad, b1: Math.max(lowLid + pad, mouth) };
}

/** 정원 n 점 타원 (사진 좌표) */
function ellipsePts(c: Pt, rx: number, ry: number, deg: number, n = 28): Pt[] {
  const t = (deg * Math.PI) / 180, ct = Math.cos(t), st = Math.sin(t);
  return Array.from({ length: n }, (_, k) => {
    const s = (2 * Math.PI * k) / n, x = rx * Math.cos(s), y = ry * Math.sin(s);
    return { x: c.x + x * ct - y * st, y: c.y + x * st + y * ct };
  });
}

/** 맨얼굴 · 화장 사진의 이마 색 차 — AI 가 바꾼 조명 · 톤. 화장 사진 색에서 빼면 맨얼굴 기준이 된다 */
function toneShift(bare: RgbaImage, made: RgbaImage, lm: readonly Pt[]): Lab {
  const a = foreheadLab(bare, lm), b = foreheadLab(made, lm);
  return a && b ? { L: b.L - a.L, a: b.a - a.a, b: b.b - a.b } : { L: 0, a: 0, b: 0 };
}

/** 블러셔 떼기 — 좌우마다 타원. 없으면 null */
export function extractCheek(bare: RgbaImage, made: RgbaImage, lm: readonly Pt[], opts: typeof BLUSH_EXTRACT = BLUSH_EXTRACT): Record<Side, ExtractedBlob | null> {
  const shift = toneShift(bare, made, lm);
  const one = (side: Side): ExtractedBlob | null => {
    const z = cheekZone(lm, side);
    const corners = [z.f.from(z.a0, z.b0), z.f.from(z.a1, z.b0), z.f.from(z.a1, z.b1), z.f.from(z.a0, z.b1)];
    const xs = corners.map((p) => p.x), ys = corners.map((p) => p.y);
    const px: { x: number; y: number; d: number }[] = [];
    for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(bare.h - 1, Math.ceil(Math.max(...ys))); y++) {
      for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(bare.w - 1, Math.ceil(Math.max(...xs))); x++) {
        const q = z.f.to({ x, y });
        if (q.a < z.a0 || q.a > z.a1 || q.b < z.b0 || q.b > z.b1) continue;
        const m = labAt(made, x, y);
        px.push({ x, y, d: deltaE(labAt(bare, x, y), { L: m.L - shift.L, a: m.a - shift.a, b: m.b - shift.b }) });
      }
    }
    if (!px.length) return null;
    const sorted = px.map((p) => p.d).sort((a, b) => a - b);
    const peak = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * opts.peakPct))]!;
    if (peak < opts.minDeltaE) return null;
    const on = px.filter((p) => p.d >= peak * opts.edge);
    if (on.length < opts.minPixels) return null;
    const c = { x: on.reduce((s, p) => s + p.x, 0) / on.length, y: on.reduce((s, p) => s + p.y, 0) / on.length };
    let sxx = 0, syy = 0, sxy = 0;
    for (const p of on) { const dx = p.x - c.x, dy = p.y - c.y; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    sxx /= on.length; syy /= on.length; sxy /= on.length;
    const tr = (sxx + syy) / 2, det = Math.sqrt(Math.max(0, ((sxx - syy) / 2) ** 2 + sxy * sxy));
    // 고르게 찬 타원은 축 방향 분산 = 반지름² / 4
    const rx = 2 * Math.sqrt(tr + det), ry = 2 * Math.sqrt(Math.max(0, tr - det));
    const angleDeg = (0.5 * Math.atan2(2 * sxy, sxx - syy) * 180) / Math.PI;
    return { center: c, rx, ry, angleDeg, outline: ellipsePts(c, rx, ry, angleDeg), peakDeltaE: peak };
  };
  return { R: one("R"), L: one("L") };
}
