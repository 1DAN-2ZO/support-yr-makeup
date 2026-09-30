/**
 * 이미지에서 Lab 샘플 뽑기 — 순수 로직 (F-08 인식).
 * poc/full/lib/sampling.js 를 옮긴 것. 이미지는 { data, w, h } 만 받아서 Node 에서도 돈다 (canvas 는 화면 쪽 일).
 *
 * 기준 쌩얼과 내 화장을 각자의 랜드마크 위치에서 같은 비율 격자(눈 폭·입술 폭 기준)로 뽑는다.
 * 그래서 두 사진의 픽셀을 겹쳐 맞출 필요가 없다. 뽑은 결과는 score.ts 의 compare*() 입력 모양 그대로다.
 *
 * 가이드 모양(꼬리 선·부위 영역)은 ② 가이드가 주인이다. 여기서는 만들지 않고 인자로 받는다.
 */

import scoreRules from "../../../rules/score.json";
import { unitScale } from "./baseline";
import type { Lab, RgbaImage } from "./color";
import { FOREHEAD_POLY, labAt, meanLabPoly, pointInPoly, rgbToLab } from "./color";
import { LM, at, dist } from "./landmarks";
import type { LinerStrip, LipStrip, RegionGrid, Side } from "./score";
import type { Baseline, Pt } from "./types";

/** 법선 방향 샘플 오프셋 25개. 라이너는 눈 폭 대비 ±0.11, 입술은 입술 폭 대비 ±0.06 */
const mkOffs = (range: number): readonly number[] => Array.from({ length: 25 }, (_, i) => +(-range + (2 * range * i) / 24).toFixed(5));
export const LINER_OFFS = mkOffs(0.11);
export const LIP_OFFS = mkOffs(0.06);

/** 샘플을 뽑을 한 장: 이미지 + 그 이미지 위의 랜드마크(px) + 기준 길이 */
export interface SampleFrame {
  im: RgbaImage;
  lm: readonly Pt[];
  unit: Baseline["unit"];
  /** 머리카락 확률 마스크 (있으면 그 칸·픽셀을 비교에서 뺀다). docs/research/hair-skin-2026-09-29 보고서 3번 */
  hair?: HairMask;
}

/**
 * 머리카락 확률 0~1. 사진과 같은 구도, 크기는 달라도 된다(분할 모델은 256·512 로 준다 — 비율로 맞춘다).
 * 안 뒤집힌 카메라 좌표 (사진과 같게)
 */
export interface HairMask {
  w: number;
  h: number;
  data: ArrayLike<number>;
}

/**
 * 내 화장 프레임은 재검출한 랜드마크가 아니라 score.ts alignToBaseline() 으로 옮긴 기준 랜드마크를 넘긴다.
 * 화장이 랜드마크를 미는 만큼 샘플 위치가 같이 밀리는 것을 막는다
 */
export function frameOf(im: RgbaImage, lm: readonly Pt[], hair?: HairMask): SampleFrame {
  return { im, lm, unit: unitScale(lm), ...(hair ? { hair } : {}) };
}

/** 이 픽셀이 머리카락인가 (마스크 확률 ≥ hairCut). 마스크가 없으면 false */
export function isHair(f: SampleFrame, x: number, y: number): boolean {
  const m = f.hair;
  if (!m) return false;
  const mx = Math.max(0, Math.min(m.w - 1, Math.floor((x * m.w) / f.im.w)));
  const my = Math.max(0, Math.min(m.h - 1, Math.floor((y * m.h) / f.im.h)));
  return (m.data[my * m.w + mx] ?? 0) >= SAMPLE.hairCut;
}

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
const norm = (a: Pt): Pt => {
  const l = Math.hypot(a.x, a.y) || 1;
  return { x: a.x / l, y: a.y / l };
};
const centroid = (poly: readonly Pt[]): Pt => poly.reduce((a, p) => add(a, mul(p, 1 / poly.length)), { x: 0, y: 0 });
const scalePoly = (poly: readonly Pt[], k: number): Pt[] => {
  const c = centroid(poly);
  return poly.map((p) => add(c, mul(sub(p, c), k)));
};

interface PathSample {
  p: Pt;
  /** 법선 */
  n: Pt;
  /** 시작점에서 선을 따라 온 거리 (px) */
  t: number;
}

/** 폴리라인을 등간격 N점으로 다시 뽑고 법선을 붙인다. up 이면 법선이 항상 화면 위쪽을 본다 */
function resample(poly: readonly Pt[], N: number, up: boolean): PathSample[] {
  const cum = [0];
  for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1]! + dist(poly[i - 1]!, poly[i]!));
  const total = cum[cum.length - 1]!;
  const out: PathSample[] = [];
  for (let k = 0; k < N; k++) {
    const t = (k / (N - 1)) * total;
    let i = 1;
    while (i < cum.length - 1 && cum[i]! < t) i++;
    const a = poly[i - 1]!, b = poly[i]!, s0 = cum[i - 1]!, s1 = cum[i]!;
    const u = s1 > s0 ? (t - s0) / (s1 - s0) : 0;
    const tg = norm(sub(b, a));
    let n: Pt = { x: -tg.y, y: tg.x };
    if (up && n.y > 0) n = mul(n, -1);
    out.push({ p: add(a, mul(sub(b, a), u)), n, t });
  }
  return out;
}

/** 눈 감김 (EAR: 위·아래 눈꺼풀 거리 / 눈 폭). poc guides.js eyeClosed 와 같은 식·임계 */
export function eyeClosed(lm: readonly Pt[], side: Side): boolean {
  const [u, l, c] = side === "R" ? [[159, 158], [145, 153], [33, 133]] : [[386, 385], [374, 380], [263, 362]];
  const ear = (dist(at(lm, u[0]!), at(lm, l[0]!)) + dist(at(lm, u[1]!), at(lm, l[1]!))) / (2 * dist(at(lm, c[0]!), at(lm, c[1]!)));
  return ear < 0.15;
}

/**
 * 채점 샘플을 한 픽셀이 아니라 box×box 평균으로 읽는다 (#174 리뷰: 카메라 잡음만으로 맨얼굴에 점수가 났다 —
 * 두 사진의 픽셀마다 잡음이 따로 붙어 "색이 바뀌었다" 가 됐다).
 * box = 눈 폭 × boxRatio (반올림, 1 이상). 합성 얼굴(눈 폭 90px) 실험 2026-09-29, 잡음 σ 0·3·6·10 × 5회, 미세 정렬 켬:
 *   1×1 — σ6 부터 맨얼굴 15/15 오채점 · 2×2 — σ10 에서 15/15 · **3×3 — 전부 0, 그린 라이너 ≥91 · 눈썹 ≥94 · 입술 ≥93**
 *   4×4~6×6 — 오채점 0 이지만 가는 라이너가 흐려져 88 → 82
 */
export const SAMPLE = { boxRatio: scoreRules.sample.boxRatio, hairCut: scoreRules.sample.hairCut };   // 값은 rules/score.json (#44)

const boxOf = (eyePx: number): number => Math.max(1, Math.round(eyePx * SAMPLE.boxRatio));

function labBox(im: RgbaImage, x: number, y: number, box: number): Lab {
  if (box <= 1) return labAt(im, x, y);
  const x0 = Math.round(x - (box - 1) / 2), y0 = Math.round(y - (box - 1) / 2);
  let r = 0, g = 0, b = 0, n = 0;
  for (let dy = 0; dy < box; dy++) {
    const yi = Math.max(0, Math.min(im.h - 1, y0 + dy));
    for (let dx = 0; dx < box; dx++) {
      const xi = Math.max(0, Math.min(im.w - 1, x0 + dx)), i = (yi * im.w + xi) * 4;
      r += im.data[i] ?? 0; g += im.data[i + 1] ?? 0; b += im.data[i + 2] ?? 0; n++;
    }
  }
  return rgbToLab(r / n, g / n, b / n);
}

/**
 * 아이라이너 스트립 (한쪽 눈): 속눈썹 선 + 꼬리 선을 따라 80행, 법선 방향 25칸. + 가 위쪽.
 * 선 아래(−)는 눈을 뜨고 있으면 눈알이다 — meta.eyeOpen 으로 표시해서 채점이 그 칸을 뺀다.
 * wing = 가이드의 꼬리 선 [눈꼬리, 꼬리 끝], thick = 가이드 선 두께 (눈 폭 비율) — 둘 다 ② 가 이 룩에서 그린 값.
 * R = 이미지 왼쪽 눈(eyeA) = 피험자 오른쪽
 */
export function sampleLiner(f: SampleFrame, side: Side, wing: readonly [Pt, Pt], thick: number): LinerStrip {
  const eye = side === "R" ? LM.eyeA : LM.eyeB;
  const lid = eye.upper.map((i) => at(f.lm, i)).reverse();   // 안쪽 → 바깥쪽
  let lidLen = 0;
  for (let i = 1; i < lid.length; i++) lidLen += dist(lid[i - 1]!, lid[i]!);
  const ue = f.unit.eye;
  const lab: Lab[][] = [], isWing: boolean[] = [], tFromCorner: number[] = [];
  for (const s of resample([...lid, wing[1]], 80, true)) {
    lab.push(LINER_OFFS.map((o) => labBox(f.im, s.p.x + s.n.x * o * ue, s.p.y + s.n.y * o * ue, boxOf(ue))));
    isWing.push(s.t > lidLen);
    tFromCorner.push((s.t - lidLen) / ue);
  }
  return { lab, meta: { offs: LINER_OFFS, isWing, tFromCorner, wingLen: dist(wing[0], wing[1]) / ue, thick, eyeOpen: !eyeClosed(f.lm, side), blur: (boxOf(ue) - 1) / ue } };
}

/** 눈썹 격자 세로 위치. 0~1 이 테두리 안, 그 밖은 바깥 띠 */
const BROW_V = [-0.6, -0.3, 0.1, 0.3, 0.5, 0.7, 0.9, 1.3, 1.6] as const;
const BROW_U = 24;

/** 눈썹 격자 (양쪽): 가로 24 × 세로 9. u = 0 이 바깥 꼬리, 1 이 안쪽. 두 사진에서 점 개수·순서가 같다 */
export function sampleBrow(f: SampleFrame): RegionGrid {
  const lab: Lab[] = [], inside: boolean[] = [], tail: boolean[] = [], side: Side[] = [], lift: number[] = [], hidden: boolean[] = [];
  const along = (pts: readonly Pt[], u: number): Pt => {
    const t = u * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(t));
    return add(pts[i]!, mul(sub(pts[i + 1]!, pts[i]!), t - i));
  };
  // 좌우 공통 두께 (양쪽 눈썹 평균, px). 높이는 "자기 눈썹 안에서의 위치(v)" × 이 두께로 잰다 —
  // 각자 두께를 곱하면 원래 두꺼운 쪽이 "높게 그렸다" 가 됐다 (#174 리뷰)
  const thickOf = (brow: { upper: readonly number[]; lower: readonly number[] }): number => {
    const up = brow.upper.map((i) => at(f.lm, i)), lo = brow.lower.map((i) => at(f.lm, i));
    let sum = 0;
    for (let ui = 0; ui < BROW_U; ui++) sum += dist(along(lo, ui / (BROW_U - 1)), along(up, ui / (BROW_U - 1)));
    return sum / BROW_U;
  };
  const thick = (thickOf(LM.browA) + thickOf(LM.browB)) / 2;
  for (const [brow, key] of [[LM.browA, "R"], [LM.browB, "L"]] as const) {
    const up = brow.upper.map((i) => at(f.lm, i)), lo = brow.lower.map((i) => at(f.lm, i));   // 인덱스 0 = 바깥 꼬리
    for (let ui = 0; ui < BROW_U; ui++) {
      const u = ui / (BROW_U - 1), a = along(lo, u), b = along(up, u);
      for (const v of BROW_V) {
        const q = add(a, mul(sub(b, a), v));
        lab.push(labBox(f.im, q.x, q.y, boxOf(f.unit.eye)));
        hidden.push(isHair(f, q.x, q.y));
        inside.push(v >= 0 && v <= 1);
        lift.push((v * thick) / (f.unit.eye || 1));   // 그 눈썹 아래 선에서 위로 (눈 폭 비율) — 좌우 높이 차(#35)
        tail.push(u < 0.4);
        side.push(key);
      }
    }
  }
  // 가린 칸 표시는 마스크가 있을 때만 — 없으면 전과 같은 모양
  return { lab, meta: { inside, tail, side, lift, ...(f.hair ? { hidden } : {}) } };
}

/** 입술 경계 스트립: 바깥 윤곽을 따라 60행, 안쪽(−) … 바깥쪽(+) 25칸. offset = 가이드 경계 오프셋 (입술 폭 비율, ② 값) */
export function sampleLip(f: SampleFrame, offset: number): LipStrip {
  const lip = LM.lipsOuter.map((i) => at(f.lm, i)), c = centroid(lip), ul = f.unit.lip;
  const lab: Lab[][] = [], half: ("upper" | "lower")[] = [], side: Side[] = [];
  for (const s of resample([...lip, lip[0]!], 60, false)) {
    const n = norm(sub(s.p, c));   // 법선 = 입술 중심에서 바깥
    lab.push(LIP_OFFS.map((o) => labBox(f.im, s.p.x + n.x * o * ul, s.p.y + n.y * o * ul, boxOf(f.unit.eye))));
    half.push(s.p.y < c.y ? "upper" : "lower");
    side.push(s.p.x < c.x ? "R" : "L");
  }
  return { lab, meta: { offs: LIP_OFFS, half, side, offset } };
}

/** 강도 부위 한쪽: 영역 평균과 그 둘레 맨살 띠 평균. 섀도우는 눈꼬리 쪽·안쪽 반 평균도 (방향) */
export interface RegionSample {
  part: Lab;
  /** 영역을 1.8배 키운 것에서 1.3배까지를 뺀 띠. 화장하지 않은 인접 피부 참조 */
  ring: Lab;
  outer?: Lab;
  inner?: Lab;
  /** 영역 픽셀 중 머리카락 비율 (마스크가 있을 때만). part·ring·outer·inner 는 머리카락 픽셀을 뺀 평균 */
  hidden?: number;
}

/** 영역이 사진 밖이라 픽셀이 없으면 null */
export function sampleRegion(f: SampleFrame, poly: readonly Pt[], side: Side, halves = false): RegionSample | null {
  const skin = f.hair ? (_lab: Lab, x: number, y: number) => !isHair(f, x, y) : undefined;
  const all = f.hair ? meanLabPoly(f.im, poly) : null;
  const part = meanLabPoly(f.im, poly, 2, skin);
  const hole = scalePoly(poly, 1.3);
  const ring = meanLabPoly(f.im, scalePoly(poly, 1.8), 2, (lab, x, y) => !pointInPoly(x, y, hole) && (!skin || skin(lab, x, y)));
  // 전부 머리카락 — 잴 게 없다. 가린 비율 1 로 넘겨 확인만(가림)이 되게
  if (all && (!part || !ring)) return { part: all.lab, ring: all.lab, hidden: 1 };
  if (!part || !ring) return null;
  const out: RegionSample = { part: part.lab, ring: ring.lab, ...(all ? { hidden: 1 - part.n / all.n } : {}) };
  if (halves) {
    const xs = poly.map((p) => p.x), mid = (Math.min(...xs) + Math.max(...xs)) / 2;
    // 눈꼬리 쪽 = 얼굴 바깥쪽. R(이미지 왼쪽 눈)은 x 가 작은 쪽, L 은 큰 쪽
    const outerPts = poly.filter((p) => (side === "R" ? p.x <= mid : p.x >= mid));
    const innerPts = poly.filter((p) => (side === "R" ? p.x > mid : p.x < mid));
    out.outer = (outerPts.length > 2 ? meanLabPoly(f.im, outerPts, 2, skin) : null)?.lab ?? part.lab;
    out.inner = (innerPts.length > 2 ? meanLabPoly(f.im, innerPts, 2, skin) : null)?.lab ?? part.lab;
  }
  return out;
}

/**
 * 이마 참조 (조명). ① 의 Baseline.foreheadL 과 같은 다각형을 쓰되 **평균 대신 채널별 중앙값** —
 * 다각형이 머리선 바로 아래라 앞머리가 일부 내려오면 평균이 머리카락 쪽으로 끌려 "조명이 바뀌었다"(확인만)가 됐다.
 * 이마의 40% 를 가려도 L* 23 차이 → 중앙값은 2 이내 (hair-forehead.test F1, docs/research/hair-skin-2026-09-29 보고서 2번).
 * 절반 넘게 가리면 중앙값도 머리카락이다 — 그건 머리카락 마스크로 (보고서 3번)
 */
export function sampleForehead(f: SampleFrame): Lab | null {
  return medianLabPoly(f.im, FOREHEAD_POLY.map((i) => at(f.lm, i)), 2);
}

function medianLabPoly(im: RgbaImage, poly: readonly Pt[], step: number): Lab | null {
  const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
  const L: number[] = [], A: number[] = [], B: number[] = [];
  for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(im.h - 1, Math.max(...ys)); y += step) {
    for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(im.w - 1, Math.max(...xs)); x += step) {
      if (!pointInPoly(x, y, poly)) continue;
      const lab = labAt(im, x, y);
      L.push(lab.L); A.push(lab.a); B.push(lab.b);
    }
  }
  if (!L.length) return null;
  const med = (v: number[]): number => {
    v.sort((p, q) => p - q);
    const m = v.length >> 1;
    return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
  };
  return { L: med(L), a: med(A), b: med(B) };
}
