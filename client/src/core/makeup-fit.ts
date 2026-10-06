/**
 * 모양 숫자 재기 (2026-10-06 POC) — 화장 구역(틀)은 고정하고, 틀의 크기 · 위치 숫자만 AI 가 입힌 사진에서 읽는다.
 * 픽셀마다 화장인지 오려 내면(makeup-extract extractAll) 실사진에서 블러셔 · 섀도가 조각났다 (사용자 캡처) —
 * 옅게 퍼진 화장은 AI 가 바꾼 피부 변화와 크기가 비슷해서다. 넓게 평균 내서 숫자 몇 개만 정하면 조각나도 안정적이다.
 *  - 블러셔: 볼 자리(얼굴 옆선에서 안쪽)에서 주변보다 진한 곳의 무게 중심 · 퍼짐 → 타원
 *  - 아이섀도: 눈꺼풀 → 눈썹 아랫선 세로 줄 여럿을 훑어 색 차가 절반으로 떨어지는 높이 → 띠
 *  - 아이라이너: 속눈썹 선 위 어두운 띠 두께 · 눈꼬리 밖으로 나간 꼬리 끝 → 선 + 꼬리
 * 못 읽으면(그 부위를 AI 가 거의 안 그림) 기본 틀(템플릿 가이드)로 채우고 fromPhoto = false.
 * 색 차 기준(거르기 스위치)은 떼기와 같은 makeup-extract diffField.
 */

import { unitScale } from "./baseline";
import type { RgbaImage } from "./color";
import { linerOutline } from "./guides";
import { LM } from "./landmarks";
import { EXTRACT, cheekZone, diffField, faceFrame, type DiffField, type ExtractOptions } from "./makeup-extract";
import type { Side } from "./score";
import type { GuideSource } from "./score-part";
import type { Pt } from "./types";

export type FitPartId = "cheek" | "shadow" | "liner";

export interface FitPart {
  part: FitPartId;
  /** R = 사진 왼쪽 */
  side: Side;
  /** 가이드 테두리 (닫힌 다각형) */
  poly: Pt[];
  /** 사진에서 읽었나 — false 면 기본 틀 */
  fromPhoto: boolean;
  /** 읽은 숫자 — 블러셔 cx · cy · rx · ry · angle(°) / 섀도 height(눈꺼풀 → 눈썹 비율) / 라이너 thickness(눈 폭 비율) · tipX · tipY · wingLen(눈 폭 비율) · wingAngle(°, 위로 +) */
  params: Partial<Record<string, number>>;
}

/**
 * blushShrink: 볼 자리를 얼굴 옆선 쪽에서 이 비율만큼 덜어 낸다 · blushEdge: 주변보다 진한 정도의 이 비율까지 블러셔 ·
 * blushMinL · blushMaxDarker: 아주 어둡거나(L 아래) 크게 어두워진(밝기 차 넘게) 픽셀은 블러셔가 아니다 — AI 가 얼굴 윤곽을 바꿔 생긴
 *   턱선 줄(경계의 배경 · 머리카락)이었다. 처음엔 옆선 쪽 25% 를 덜어 냈는데 블러셔 바깥까지 잘렸다 (시험 F1) ·
 * shadowSkip: 섀도 높이를 잴 때 속눈썹 선 바로 위(눈꺼풀 → 눈썹의 이 비율)는 뺀다 — 까만 속눈썹이 섀도 색으로 바뀐 차가 '가장 진한 곳' 이 됐다 ·
 * blushMinRed · blushMinAspect · blushMaxTilt · blushMaxR: 블러셔 증거는 '붉어짐'(a* 증가, 이만큼 넘게) — 밝기 · 윤곽 변화는 블러셔가 아니다.
 *   짧은 반지름이 긴 반지름의 이 비율보다 작거나(세로 줄), 이 각도(°)보다 기울었거나, 긴 반지름이 눈 폭 × 이 배보다 크면 블러셔가 아니라 못 읽음
 *   (실사진: 얼굴 옆선을 따라 세로로 긴 타원이 잡혔다, 시험 F10) ·
 * shadowMaxT · shadowDarkL: 섀도 높이는 눈썹 아랫선의 이 비율까지만, 화장 사진에서 이보다 어두운 픽셀(눈썹 털 · 라이너)은 빼고 잰다
 *   (실사진: AI 가 눈썹을 진하고 두껍게 바꿔 섀도가 눈썹까지 올라갔다, 시험 F11) ·
 * minPixels: 덩어리가 이보다 작으면 못 읽음 · shadowSteps: 섀도 세로 줄을 나눌 칸 · linerMaxThick · wingMax: 라이너 두께 · 꼬리를 찾는 거리(눈 폭 배수). 눈대중 시작값
 */
export const FIT = {
  blushShrink: 0.08, blushEdge: 0.3, blushMinL: 35, blushMaxDarker: 15, blushMinRed: 1.5, blushMinAspect: 0.4, blushMaxTilt: 45, blushMaxR: 1.2,
  minPixels: 40, shadowSteps: 25, shadowSkip: 0.12, shadowMaxT: 0.9, shadowDarkL: 45, linerMaxThick: 0.2, wingMax: 0.7,
} as const;

const NO_IMAGE = { data: new Uint8ClampedArray(0), w: 0, h: 0 };
const mix = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const add = (a: Pt, b: Pt, k: number): Pt => ({ x: a.x + b.x * k, y: a.y + b.y * k });
const median = (v: number[]): number => { const s = [...v].sort((a, b) => a - b); return s.length ? s[s.length >> 1]! : 0; };

function ellipsePts(c: Pt, rx: number, ry: number, deg: number, n = 28): Pt[] {
  const t = (deg * Math.PI) / 180, ct = Math.cos(t), st = Math.sin(t);
  return Array.from({ length: n }, (_, k) => {
    const s = (2 * Math.PI * k) / n, x = rx * Math.cos(s), y = ry * Math.sin(s);
    return { x: c.x + x * ct - y * st, y: c.y + x * st + y * ct };
  });
}

/** 블러셔 — 볼 자리에서 주변(자리 안 중앙값 + 2 × 퍼짐)보다 붉어진 곳 → 그 덩어리 모멘트로 타원. 블러셔 모양이 아니면 못 읽음 */
function fitCheek(f: DiffField, lm: readonly Pt[], side: Side): Omit<FitPart, "part" | "side"> | null {
  const z = cheekZone(lm, side), wid = z.a1 - z.a0;
  const a0 = side === "R" ? z.a0 + FIT.blushShrink * wid : z.a0, a1 = side === "R" ? z.a1 : z.a1 - FIT.blushShrink * wid;
  const corners = [z.f.from(a0, z.b0), z.f.from(a1, z.b0), z.f.from(a1, z.b1), z.f.from(a0, z.b1)];
  const xs = corners.map((p) => p.x), ys = corners.map((p) => p.y);
  const px: { x: number; y: number; d: number }[] = [];
  for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(f.h - 1, Math.ceil(Math.max(...ys))); y++) {
    for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(f.w - 1, Math.ceil(Math.max(...xs))); x++) {
      const q = z.f.to({ x, y });
      if (q.a < a0 || q.a > a1 || q.b < z.b0 || q.b > z.b1) continue;
      const v = f.at(x, y, true);
      if (v && Math.min(v.bL, v.mL) >= FIT.blushMinL && v.dL >= -FIT.blushMaxDarker) px.push({ x, y, d: Math.max(0, v.da) });
    }
  }
  if (px.length < FIT.minPixels) return null;
  const ds = px.map((p) => p.d), m = median(ds), mad = median(ds.map((d) => Math.abs(d - m))) * 1.4826;
  const thr = Math.max(FIT.blushMinRed, m + 2 * mad);
  const sorted = [...ds].sort((x, y) => x - y), peak = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.98))]!;
  if (peak <= thr) return null;
  // 테두리 = 가장 진한 곳의 blushEdge — 완성본 방사형 블러셔에서는 그 자리가 가이드 타원. 다만 주변 잡음(thr)보다 아래로는 안 내려간다.
  // (처음엔 '잡음 문턱을 뺀 나머지의 30%' 로 잡아 가장자리보다 안쪽에서 잘렸다 — 반지름 68%, 시험 F1)
  const on = px.filter((p) => p.d >= Math.max(thr, peak * FIT.blushEdge));
  if (on.length < FIT.minPixels) return null;
  const c = { x: on.reduce((s, p) => s + p.x, 0) / on.length, y: on.reduce((s, p) => s + p.y, 0) / on.length };
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of on) { const dx = p.x - c.x, dy = p.y - c.y; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  sxx /= on.length; syy /= on.length; sxy /= on.length;
  const tr = (sxx + syy) / 2, det = Math.sqrt(Math.max(0, ((sxx - syy) / 2) ** 2 + sxy * sxy));
  // 고르게 찬 타원은 축 방향 분산 = 반지름² / 4
  const rx = 2 * Math.sqrt(tr + det), ry = 2 * Math.sqrt(Math.max(0, tr - det)), angle = (0.5 * Math.atan2(2 * sxy, sxx - syy) * 180) / Math.PI;
  // 블러셔 모양이 아니면(세로 줄 · 많이 기욺 · 너무 큼) 못 읽음 — 기본 틀로
  if (ry < FIT.blushMinAspect * rx || Math.abs(angle) > FIT.blushMaxTilt || rx > FIT.blushMaxR * f.eyeW) return null;
  return { poly: ellipsePts(c, rx, ry, angle), fromPhoto: true, params: { cx: c.x, cy: c.y, rx, ry, angle } };
}

/** 섀도 — 눈꺼풀 → 눈썹 아랫선 세로 줄마다 색 차를 재고 줄들의 중앙값 → 가장 진한 곳의 절반으로 떨어지는 높이 */
function fitShadow(f: DiffField, lm: readonly Pt[], side: Side, opts: ExtractOptions): Omit<FitPart, "part" | "side"> | null {
  const P = (i: number): Pt => lm[i]!;
  const lid = (side === "R" ? LM.eyeA : LM.eyeB).upper.map(P), bl = (side === "R" ? LM.browA : LM.browB).lower.map(P);
  const top = (i: number) => bl[Math.min(bl.length - 1, Math.round((i / (lid.length - 1)) * (bl.length - 1)))]!;
  const r = Math.max(1, Math.round(f.eyeW * 0.02)), color = opts.chroma;
  const sample = (p: Pt): number | null => {
    const v: number[] = [];
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = Math.round(p.x) + dx, y = Math.round(p.y) + dy;
      if (x < 0 || y < 0 || x >= f.w || y >= f.h) continue;
      const q = f.at(x, y, color);
      if (q && q.mL > FIT.shadowDarkL) v.push(q.d);   // 아주 어두운 픽셀은 눈썹 털 · 라이너
    }
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const T = FIT.shadowSteps, prof: number[] = [];
  for (let s = 0; s <= T; s++) {
    const t = (s / T) * FIT.shadowMaxT, col: number[] = [];
    for (let k = 1; k < lid.length - 1; k++) { const v = sample(mix(lid[k]!, top(k), t)); if (v !== null) col.push(v); }
    prof.push(col.length ? median(col) : 0);
  }
  const base = Math.max(opts.minDeltaE.shadow, f.floor * (color ? opts.chromaL : 1));
  const s0 = Math.round((T * FIT.shadowSkip) / FIT.shadowMaxT);
  let im = s0;
  for (let s = s0; s <= Math.round(T * 0.6); s++) if (prof[s]! > prof[im]!) im = s;
  const pmax = prof[im]!;
  if (pmax < base) return null;
  const half = pmax / 2;
  let height = 1;
  for (let s = im + 1; s <= T; s++) {
    if (prof[s]! < half) { const a = prof[s - 1]!, b = prof[s]!; height = ((s - 1 + (a - half) / (a - b || 1)) / T) * FIT.shadowMaxT; break; }
  }
  if (height === 1) height = FIT.shadowMaxT;
  const poly = [...lid, ...lid.map((p, i) => mix(p, top(i), height)).reverse()];
  return { poly, fromPhoto: true, params: { height } };
}

/** 라이너 — 속눈썹 선 위 어두운 띠의 두께(가운데 줄들의 중앙값) + 눈꼬리 밖으로 이어진 어두운 꼬리의 끝 */
function fitLiner(f: DiffField, lm: readonly Pt[], side: Side, opts: ExtractOptions): Omit<FitPart, "part" | "side"> | null {
  const P = (i: number): Pt => lm[i]!, eye = side === "R" ? LM.eyeA : LM.eyeB;
  const o = P(eye.outer), i0 = P(eye.inner), ew = Math.hypot(o.x - i0.x, o.y - i0.y) || 1;
  const out = { x: (o.x - i0.x) / ew, y: (o.y - i0.y) / ew };
  const ff = faceFrame(lm), a = ff.from(0, 0), b = ff.from(0, -1), up = { x: b.x - a.x, y: b.y - a.y };
  const raw = eye.upper.map(P);
  const lid = Math.hypot(raw[0]!.x - o.x, raw[0]!.y - o.y) < Math.hypot(raw[raw.length - 1]!.x - o.x, raw[raw.length - 1]!.y - o.y) ? raw : [...raw].reverse();
  const dark = (p: Pt): boolean => {
    const x = Math.round(p.x), y = Math.round(p.y);
    if (x < 0 || y < 0 || x >= f.w || y >= f.h) return false;
    const q = f.at(x, y);
    return !!q && q.d >= Math.max(opts.minDeltaE.liner, f.floor) && (q.L <= opts.linerMaxL || q.dL <= -opts.linerDarker);
  };
  // 두께: 가운데 줄마다 속눈썹 선에서 위로 처음 3px 안에서 시작하는 어두운 길이 (1px 끊김은 이어 본다)
  const maxT = FIT.linerMaxThick * ew, thick: number[] = [];
  for (let k = 2; k < lid.length - 2; k++) {
    let start = -1, end = -1, gap = 0;
    for (let s = 0; s <= maxT; s += 0.5) {
      if (dark(add(lid[k]!, up, s))) { if (start < 0) { if (s > 3) break; start = s; } end = s; gap = 0; }
      else if (start >= 0 && ++gap > 2) break;
    }
    if (start >= 0) thick.push(end - start + 0.5);
  }
  // 꼬리: 눈꼬리에서 바깥으로 0.5px 씩 — 그 자리에서 위아래로 훑어 어두운 곳이 있으면 이어 간다 (3px 끊기면 끝)
  let lastS = 0, lastV = 0, gap = 0;
  for (let s = 0; s <= FIT.wingMax * ew; s += 0.5) {
    const vs: number[] = [];
    for (let v = -0.05 * ew; v <= 0.35 * ew; v += 0.5) if (dark(add(add(o, out, s), up, v))) vs.push(v);
    if (vs.length) { lastS = s; lastV = vs.reduce((x, y) => x + y, 0) / vs.length; gap = 0; } else if (++gap > 6) break;
  }
  const hasLine = thick.length * 2 >= lid.length - 4, hasWing = lastS >= 0.04 * ew;
  if (!hasLine && !hasWing) return null;
  const t = hasLine ? median(thick) : 0.03 * ew;
  const tip = hasWing ? add(add(o, out, lastS), up, lastV) : o;
  const poly = [...lid, ...[...lid].reverse().map((p) => add(p, up, t)), ...(hasWing ? [tip] : [])];
  const angle = (Math.atan2(lastV, Math.max(1e-6, lastS)) * 180) / Math.PI;
  return { poly, fromPhoto: true, params: { thickness: t / ew, tipX: tip.x, tipY: tip.y, wingLen: lastS / ew, wingAngle: hasWing ? angle : 0 } };
}

/**
 * 맨얼굴 · AI 화장 사진(같은 크기 · 같은 자리) → 부위마다 가이드 테두리.
 * fallback: 못 읽은 부위를 채울 기본 틀 (템플릿 가이드 — 앱은 planGuide)
 */
export function fitMakeup(bare: RgbaImage, made: RgbaImage, lm: readonly Pt[], fallback: GuideSource, opts: ExtractOptions = EXTRACT): FitPart[] {
  const field = diffField(bare, made, lm, opts);
  const frame = { im: NO_IMAGE, lm, unit: unitScale(lm) };
  const fbCheek = fallback("cheek", frame).regions, fbShadow = fallback("shadow", frame).regions, fbLiner = fallback("liner", frame).liner;
  const fbLinerPoly = fbLiner ? linerOutline(frame, fbLiner.thick, fbLiner.wing) : null;
  const out: FitPart[] = [];
  for (const side of ["R", "L"] as const) {
    const c = fitCheek(field, lm, side);
    out.push(c ? { part: "cheek", side, ...c } : { part: "cheek", side, poly: [...(fbCheek?.[side] ?? [])], fromPhoto: false, params: {} });
    const s = fitShadow(field, lm, side, opts);
    out.push(s ? { part: "shadow", side, ...s } : { part: "shadow", side, poly: [...(fbShadow?.[side] ?? [])], fromPhoto: false, params: {} });
    const l = fitLiner(field, lm, side, opts);
    out.push(l ? { part: "liner", side, ...l } : { part: "liner", side, poly: [...(fbLinerPoly?.[side] ?? [])], fromPhoto: false, params: {} });
  }
  return out;
}
