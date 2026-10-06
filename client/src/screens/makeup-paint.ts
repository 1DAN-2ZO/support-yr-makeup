/**
 * 화장 무늬 그리기 (⑥, 2-b AR) — 룩 색과 개인화 계획으로 기준 얼굴 위에 화장 층 세 장을 그린다.
 *   곱하기 층(눈썹·라이너·섀도·볼·입술·쉐딩) · 색 층(입술 — 밝기는 두고 색만) · 밝히기 층(하이라이트)
 * WebGL(makeup-gl.ts)이 이 층을 얼굴 그물로 지금 얼굴에 휘어 피부와 섞는다.
 *
 * 논문 브랜치의 확인 페이지(makeup-probe.ts)에서 필터 방식만 옮겼다. 모양은 전부 personal-guide.ts 계산을 쓴다 —
 * 예상도·가이드·채점이 같은 모양을 본다.
 */

import { unitScale } from "../core/baseline";
import { contourOutline } from "../core/contour";
import { faceAxis } from "../core/face-measure";
import { GUIDE_PARAMS } from "../core/guides";
import { LM, at } from "../core/landmarks";
import type { Look } from "../core/looks";
import { browOnFace, linerOutline, lipOutline, shadowRegions, shadowTail } from "../core/personal-guide";
import { PLAN_RULES, type LinerStyle, type PersonalPlan } from "../core/personalize";
import type { Pt } from "../core/types";
import { drawLashes, type LashTextures } from "./lash-render";

export type PaintPart = "brow" | "shadow" | "liner" | "cheek" | "lip" | "contour" | "highlight" | "aegyo";

/** 그리는 순서와 번짐(얼굴 폭 비율) */
const PARTS: { id: PaintPart; blur: number }[] = [
  { id: "contour", blur: 0.04 },
  { id: "highlight", blur: 0.04 },
  { id: "cheek", blur: 0.048 },
  // 애교살: 아랫속눈썹 → 볼 사이 띠, 밝히기 층 (④ 실험 화면 0.02 × 부드럽게 1.6 — 다른 부위와 같은 환산)
  { id: "aegyo", blur: 0.032 },
  { id: "brow", blur: 0.0064 },
  { id: "shadow", blur: 0.019 },
  { id: "liner", blur: 0.0024 },
  { id: "lip", blur: 0.0048 },
];

export interface PaintLook {
  color: Partial<Record<PaintPart, string>>;
  alpha: Partial<Record<PaintPart, number>>;
  linerThick: number;
  /** 섀도우 두 색 — at 0 = 속눈썹 쪽, 1 = 눈썹 쪽 (look-v0.2). 없으면 한 색이 위로 옅어진다 */
  shadowStops?: { at: number; color: string }[];
  /** 섀도우가 라이너 꼬리 방향으로 길게 이어진다 */
  shadowTail: boolean;
  /** 입술 가장자리 색 — 가운데(color) → 가장자리 그러데이션. 없으면 한 색 */
  lipEdge?: string;
  /** 글리터 마감 — 단색 대신 점을 흩뿌린다 (섀도우는 띠 위에 더해서, 애교살은 점만) */
  glitter: { shadow: boolean; aegyo: boolean };
  /** 마스카라 (extras.lash) — 없으면 안 그린다 (예: 출근/학생). 채점 안 함 */
  lash?: { color: string; alpha: number };
}

/** 쉐딩·하이라이트는 룩에 없다(얼굴형 규칙 부위, F-04) — 기본 색·진하기 */
const CONTOUR = { color: { contour: "#a07a66", highlight: "#fff3e6" }, alpha: { contour: 0.35, highlight: 0.45 } };

/**
 * 눈썹 기본 색 — 화장 템플릿(rules/looks.json)에 눈썹 색이 없으면 이것으로 칠한다.
 * 폰 시험(2026-09-30): 10개 모두 눈썹 색이 비어 눈썹이 아예 안 그려졌다. 템플릿 값을 대표 이미지(#77·#121)에서 재면 그 색으로
 */
export const BROW_DEFAULT_COLOR = "#5a4032";

const hex = (c: readonly number[]): string => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

export function paintLookOf(look: Look): PaintLook {
  const color: PaintLook["color"] = { ...CONTOUR.color }, alpha: PaintLook["alpha"] = { ...CONTOUR.alpha };
  for (const [k, p] of Object.entries(look.parts) as [PaintPart, NonNullable<Look["parts"][keyof Look["parts"]]>][]) {
    if (p.color) color[k] = hex(p.color);
    alpha[k] = p.alpha ?? p.alphaR ?? 0.5;
  }
  color.brow ??= BROW_DEFAULT_COLOR;
  const sh = look.parts.shadow, lip = look.parts.lip, ae = look.extras?.aegyo;
  if (ae) { color.aegyo = hex(ae.color); alpha.aegyo = ae.alpha; }
  return {
    color, alpha, linerThick: look.parts.liner?.thick ?? GUIDE_PARAMS.liner.thick,
    ...(sh?.stops?.length ? { shadowStops: sh.stops.map((s) => ({ at: s.at, color: hex(s.color) })) } : {}),
    shadowTail: !!sh?.tailExtend,
    ...(lip?.edge ? { lipEdge: hex(lip.edge) } : {}),
    glitter: { shadow: sh?.finish === "glitter", aegyo: ae?.finish === "glitter" },
    ...(look.extras?.lash ? { lash: { color: hex(look.extras.lash.color), alpha: look.extras.lash.alpha } } : {}),
  };
}

export interface Layers { mul: CanvasRenderingContext2D; col: CanvasRenderingContext2D; light: CanvasRenderingContext2D }

const mix = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const LIP_INNER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95];
const SIDES = [
  { eye: LM.eyeA, brow: LM.browA, cheek: LM.cheekA, face: LM.faceL, sign: -1 },
  { eye: LM.eyeB, brow: LM.browB, cheek: LM.cheekB, face: LM.faceR, sign: 1 },
] as const;

function path(ctx: CanvasRenderingContext2D, pts: readonly Pt[]): void {
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.closePath();
}

/** 고정 시드 난수 — 글리터 점 자리가 매번 같게 (AR 에서 반짝이며 흔들리지 않게) */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 시험에서 바꿔 끼우는 것 — 번짐 대체용 임시 캔버스 만들기 */
export const paintEnv = { makeCanvas: (): HTMLCanvasElement => document.createElement("canvas") };

/** 번짐(px) → 절반으로 줄이는 단계 수. 한 단계마다 번짐이 두 배쯤 (1단계 ≈ 1px, 4단계 ≈ 8px). 화면에서 filter 번짐과 눈으로 맞춘 값 */
export function softenLevels(blurPx: number): number {
  return Math.max(1, Math.min(6, Math.round(Math.log2(Math.max(1, blurPx))) + 1));
}

/**
 * 캔버스 번짐(ctx.filter)이 없는 브라우저용 대체 — **절반씩 여러 번 줄였다가 두 배씩 다시 키운다**.
 * 일부 WebKit(Safari)은 `getContext("2d").filter` 가 undefined 라 `filter = "blur(…)"` 가 조용히 무시된다 —
 * 화장이 딱딱한 도형으로 나왔다 (④ #263 이 실험 화면에서 실기기로 확인).
 * 한 번에 크게 줄이면(④ 방식) 중간 픽셀을 건너뛰어 볼·쉐딩처럼 번짐이 큰 부위가 계단 모양으로 나온다 (2026-10-01 캡처로 확인) —
 * 절반씩 줄이면 단계마다 이웃 네 픽셀이 고르게 섞인다. 정확한 가우시안은 아니다.
 * tmps: 단계마다 하나씩 쓰는 임시 캔버스 (부르는 쪽이 들고 다시 쓴다)
 */
function softenByResize(o: CanvasRenderingContext2D, off: HTMLCanvasElement, tmps: HTMLCanvasElement[], blurPx: number): void {
  const n = softenLevels(blurPx);
  const ctxs: CanvasRenderingContext2D[] = [];
  let src: HTMLCanvasElement = off;
  for (let i = 0; i < n; i++) {
    const c = (tmps[i] ??= paintEnv.makeCanvas());
    c.width = Math.max(1, Math.round(off.width / 2 ** (i + 1)));
    c.height = Math.max(1, Math.round(off.height / 2 ** (i + 1)));
    const t = c.getContext("2d");
    if (!t) return;   // 못 번지면 그린 그대로 둔다
    t.imageSmoothingEnabled = true;
    t.clearRect(0, 0, c.width, c.height);
    t.drawImage(src, 0, 0, c.width, c.height);
    ctxs.push(t);
    src = c;
  }
  // 가장 작은 것부터 한 단계씩 키워 올라간다
  for (let i = n - 1; i >= 1; i--) {
    const up = tmps[i - 1]!, t = ctxs[i - 1]!;
    t.clearRect(0, 0, up.width, up.height);
    t.drawImage(tmps[i]!, 0, 0, up.width, up.height);
  }
  o.clearRect(0, 0, off.width, off.height);
  o.imageSmoothingEnabled = true;
  o.drawImage(tmps[0]!, 0, 0, off.width, off.height);
}

/**
 * 다각형들 안에만 글리터 점을 흩뿌린다 — ④ 실험 화면(makeup-probe.ts fillGlitter)과 같은 방법.
 * darken: 곱하기 층용(섀도우) — 점 가운데를 어둡게. 아니면 밝히기 층용(애교살) — 가운데를 희게.
 * 부위의 번짐이 끝난 뒤에 부른다 — 번지면 점이 아니라 흐린 얼룩이 된다
 */
function glitterIn(ctx: CanvasRenderingContext2D, polys: readonly (readonly Pt[])[], color: string, darken: boolean): void {
  const pts = polys.flat();
  const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, h = Math.max(...ys) - y0;
  ctx.save();
  ctx.beginPath();
  for (const poly of polys) path(ctx, poly);
  ctx.clip();
  const rnd = mulberry32(0x9e3779b9);
  const n = Math.max(40, Math.round(w * h * 0.02));
  for (let i = 0; i < n; i++) {
    const x = x0 + rnd() * w, y = y0 + rnd() * h, r = 0.45 + rnd() * 0.85;
    ctx.beginPath();
    ctx.fillStyle = rgba(color, (darken ? 0.7 : 0.55) + rnd() * 0.4);
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = darken ? `rgba(0,0,0,${0.35 + rnd() * 0.35})` : rgba("#ffffff", 0.6 + rnd() * 0.4);
    ctx.arc(x, y, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

const rgba = (h: string, a: number): string => {
  const n = parseInt(h.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/**
 * 기준 얼굴 점(lm) 위에 화장 층을 그린다. layers 는 호출하는 쪽이 비워 둔다.
 * off 는 부위마다 번짐(blur)을 먹이는 작업용 캔버스 — layers 와 같은 크기.
 * lashes: 불러 둔 마스카라 텍스처 (screens/lash-assets). 없거나 아직 못 불렀으면 마스카라만 빼고 그린다
 */
export function paintMakeup(layers: Layers, off: HTMLCanvasElement, lm: readonly Pt[], look: PaintLook, plan: PersonalPlan | null, style: LinerStyle, lashes: LashTextures | null = null): void {
  const o = off.getContext("2d");
  if (!o) return;
  const P = (i: number): Pt => at(lm, i);
  const unit = unitScale(lm), faceW = unit.face;
  // 번짐 기능이 있는지 한 번 본다 (UA 가 아니라 기능으로). 없으면 그린 뒤 줄였다 키워 번지게 한다 (softenByResize)
  const hasFilter = typeof o.filter === "string";
  const tmps: HTMLCanvasElement[] = [];   // 번짐 대체용 — 이번 그리기에서 필요한 만큼 만들어 부위마다 다시 쓴다
  for (const p of PARTS) {
    const color = look.color[p.id];
    if (!color) continue;
    const scale = p.id === "contour" || p.id === "highlight" || p.id === "aegyo" ? 1 : (plan?.intensity[p.id] ?? 1);
    const alpha = Math.min(1, (look.alpha[p.id] ?? 0.5) * scale);
    const blurPx = Math.max(0.5, p.blur * faceW);
    /** 번짐이 끝난 뒤에 그릴 것 (글리터 점) */
    const crisp: (() => void)[] = [];
    if (hasFilter) o.filter = "none";
    o.clearRect(0, 0, off.width, off.height);
    if (hasFilter) o.filter = `blur(${blurPx}px)`;
    o.fillStyle = color;
    o.beginPath();
    if (p.id === "brow") {
      // 가이드 테두리와 같은 자리 — 표준 모양을 실제 눈썹 높이에 맞춘 것 (personal-guide browOnFace)
      const std = browOnFace({ lm, unit }, plan?.brow);
      if (std) for (const s of ["R", "L"] as const) path(o, std[s].outline);
      else for (const { brow } of SIDES) path(o, [...brow.upper.map(P), ...[...brow.lower].reverse().map(P)]);
      o.fill();
    } else if (p.id === "shadow") {
      // 속눈썹 선에서 가장 진하고 위로 갈수록 옅어진다. 두 색 화장은 속눈썹 쪽 → 눈썹 쪽 두 색 (④ 실험 화면과 같은 방법)
      // 띠 = 섀도 영역(눈꺼풀 → 위 테두리 거꾸로) + 눈꼬리 연장 쐐기 — 화면 3·4 테두리와 같은 계산 (personal-guide, #30)
      const f = { lm, unit };
      const regions = shadowRegions(f, GUIDE_PARAMS.shadow.rangeRatio * (plan?.shadow.range ?? 1));
      const tails = look.shadowTail ? shadowTail(f, regions, look.linerThick * (plan?.linerThick.scale ?? 1), style) : null;
      for (const side of ["R", "L"] as const) {
        const r = regions[side], n = r.length / 2;
        const band = tails ? [...r, ...tails[side]] : r;
        // 그라데이션 방향: 눈꺼풀 가운데 → 그 위 테두리
        const a = r[Math.floor(n / 2)]!, b = r[r.length - 1 - Math.floor(n / 2)]!;
        const grad = o.createLinearGradient(a.x, a.y, b.x, b.y);
        if (look.shadowStops) {
          for (const st of look.shadowStops) grad.addColorStop(Math.max(0, Math.min(1, st.at)), st.color);
          const last = look.shadowStops[look.shadowStops.length - 1]!;
          if (last.at < 1) grad.addColorStop(1, rgba(last.color, 0));   // 눈썹 쪽으로 스며들듯
        } else {
          grad.addColorStop(0, rgba(color, 1));
          grad.addColorStop(0.55, rgba(color, 0.6));
          grad.addColorStop(1, rgba(color, 0));
        }
        o.fillStyle = grad;
        o.beginPath();
        path(o, band);
        o.fill();
        // 글리터 화장(아이돌·러블리·키치): 그라데이션 위, 같은 띠 안에만 점 — 번짐 뒤에
        if (look.glitter.shadow) crisp.push(() => glitterIn(o, [band], color, true));
      }
    } else if (p.id === "liner") {
      const outline = linerOutline({ lm, unit }, look.linerThick * (plan?.linerThick.scale ?? 1), style);
      path(o, outline.R);
      path(o, outline.L);
      o.fill();
    } else if (p.id === "cheek") {
      // 가운데에서 바깥으로 사라지는 블러셔. 위치·크기는 계획대로 (personal-guide planGuide 의 cheek 과 같은 계산)
      const c0 = GUIDE_PARAMS.cheek, sz = plan?.blush.size ?? 1;
      const ax = faceAxis(lm), shift = plan?.blush.position === "higher" ? PLAN_RULES.blushShift : plan?.blush.position === "lower" ? -PLAN_RULES.blushShift : 0;
      for (const { cheek, face, sign } of SIDES) {
        const c1 = mix(P(cheek), P(face), c0.toward);
        const ctr = { x: c1.x + ax.y * shift * faceW, y: c1.y - ax.x * shift * faceW };
        o.save();
        o.translate(ctr.x, ctr.y);
        o.rotate((sign * c0.tilt * Math.PI) / 180);
        o.scale(1, c0.ry / c0.rx);
        const r = faceW * c0.rx * sz * 1.3;
        const grad = o.createRadialGradient(0, 0, 0, 0, 0, r);
        grad.addColorStop(0, rgba(color, 1));
        grad.addColorStop(0.5, rgba(color, 0.55));
        grad.addColorStop(1, rgba(color, 0));
        o.fillStyle = grad;
        o.beginPath();
        o.arc(0, 0, r, 0, Math.PI * 2);
        o.fill();
        o.restore();
      }
    } else if (p.id === "aegyo") {
      // 애교살: 아랫속눈썹 선 → 볼 점 사이 10~35% 띠 (④ 실험 화면과 같은 눈대중 시작값)
      const bands = SIDES.map(({ eye, cheek }) => {
        const lash = eye.lower.map(P), c = P(cheek);
        return [...lash.map((q) => mix(q, c, 0.1)), ...lash.map((q) => mix(q, c, 0.35)).reverse()];
      });
      if (look.glitter.aegyo) crisp.push(() => glitterIn(o, bands, color, false));   // 글리터면 단색 대신 점만
      else {
        for (const b of bands) path(o, b);
        o.fill();
      }
    } else if (p.id === "lip") {
      const inner = LIP_INNER.map(P);
      if (look.lipEdge) {
        // 가운데 → 가장자리 그러데이션 (④ 실험 화면과 같은 방법): 입 안쪽 가운데에서 입꼬리 폭 절반까지
        const cx = inner.reduce((s, q) => s + q.x, 0) / inner.length, cy = inner.reduce((s, q) => s + q.y, 0) / inner.length;
        const grad = o.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(P(291).x - P(61).x, P(291).y - P(61).y) / 2);
        grad.addColorStop(0.2, color);
        grad.addColorStop(1, look.lipEdge);
        o.fillStyle = grad;
      }
      path(o, lipOutline(lm, plan?.lip.overline ?? 0));
      path(o, inner);
      o.fill("evenodd");
    } else {
      const bands = contourOutline(lm, plan?.faceShape ?? "oval", { tZone: plan?.highlight.tZone ?? true });
      for (const b of p.id === "contour" ? bands.shading : bands.highlight) path(o, b);
      o.fill();
    }
    // 번짐을 끝낸다 — 기능이 있으면 끄고, 없으면 지금까지 그린 것을 줄였다 키운다. 점(글리터)은 그 뒤에 또렷하게
    if (hasFilter) o.filter = "none";
    else softenByResize(o, off, tmps, blurPx);
    for (const draw of crisp) draw();
    // 층에는 색과 세기만 담는다 — 섞는 건 셰이더가 한다
    if (p.id === "highlight" || p.id === "aegyo") {
      layers.light.globalAlpha = alpha;
      layers.light.drawImage(off, 0, 0);
      continue;
    }
    layers.mul.globalAlpha = alpha;
    layers.mul.drawImage(off, 0, 0);
    if (p.id === "lip") {
      layers.col.globalAlpha = alpha * 0.5;
      layers.col.drawImage(off, 0, 0);
    }
  }
  // 마스카라 — ④ 텍스처를 눈꺼풀 선에 휘어 붙인다 (screens/lash-render). 기준 얼굴의 눈 뜬 모양으로 한 번만 그리고,
  // AR 은 셰이더가 다른 화장처럼 휘어 붙인다 — 프레임마다 다시 그리지 않는다. 번짐 없이, 곱하기 층 맨 위에
  if (look.lash && lashes?.ready) {
    if (hasFilter) o.filter = "none";
    o.clearRect(0, 0, off.width, off.height);
    drawLashes(o, lashes, lm, look.lash.color, Math.min(1, look.lash.alpha));
    layers.mul.globalAlpha = 1;
    layers.mul.drawImage(off, 0, 0);
  }
}
