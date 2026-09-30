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
import { browOnFace, linerOutline, lipOutline } from "../core/personal-guide";
import { PLAN_RULES, type LinerStyle, type PersonalPlan } from "../core/personalize";
import type { Pt } from "../core/types";

export type PaintPart = "brow" | "shadow" | "liner" | "cheek" | "lip" | "contour" | "highlight";

/** 그리는 순서와 번짐(얼굴 폭 비율) */
const PARTS: { id: PaintPart; blur: number }[] = [
  { id: "contour", blur: 0.04 },
  { id: "highlight", blur: 0.04 },
  { id: "cheek", blur: 0.048 },
  { id: "brow", blur: 0.0064 },
  { id: "shadow", blur: 0.019 },
  { id: "liner", blur: 0.0024 },
  { id: "lip", blur: 0.0048 },
];

export interface PaintLook {
  color: Partial<Record<PaintPart, string>>;
  alpha: Partial<Record<PaintPart, number>>;
  linerThick: number;
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
  return { color, alpha, linerThick: look.parts.liner?.thick ?? GUIDE_PARAMS.liner.thick };
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

const rgba = (h: string, a: number): string => {
  const n = parseInt(h.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/**
 * 기준 얼굴 점(lm) 위에 화장 층을 그린다. layers 는 호출하는 쪽이 비워 둔다.
 * off 는 부위마다 번짐(blur)을 먹이는 작업용 캔버스 — layers 와 같은 크기.
 */
export function paintMakeup(layers: Layers, off: HTMLCanvasElement, lm: readonly Pt[], look: PaintLook, plan: PersonalPlan | null, style: LinerStyle): void {
  const o = off.getContext("2d");
  if (!o) return;
  const P = (i: number): Pt => at(lm, i);
  const unit = unitScale(lm), faceW = unit.face;
  for (const p of PARTS) {
    const color = look.color[p.id];
    if (!color) continue;
    const scale = p.id === "contour" || p.id === "highlight" ? 1 : (plan?.intensity[p.id] ?? 1);
    const alpha = Math.min(1, (look.alpha[p.id] ?? 0.5) * scale);
    o.filter = "none";
    o.clearRect(0, 0, off.width, off.height);
    o.filter = `blur(${Math.max(0.5, p.blur * faceW)}px)`;
    o.fillStyle = color;
    o.beginPath();
    if (p.id === "brow") {
      // 가이드 테두리와 같은 자리 — 표준 모양을 실제 눈썹 높이에 맞춘 것 (personal-guide browOnFace)
      const std = browOnFace({ lm, unit }, plan?.brow);
      if (std) for (const s of ["R", "L"] as const) path(o, std[s].outline);
      else for (const { brow } of SIDES) path(o, [...brow.upper.map(P), ...[...brow.lower].reverse().map(P)]);
      o.fill();
    } else if (p.id === "shadow") {
      // 속눈썹 선에서 가장 진하고 위로 갈수록 옅어진다
      for (const { eye, brow } of SIDES) {
        const lid = eye.upper.map(P), lo = brow.lower.map(P);
        const top = lid.map((q, i) => mix(q, lo[Math.min(lo.length - 1, Math.round((i / (lid.length - 1)) * (lo.length - 1)))]!, GUIDE_PARAMS.shadow.rangeRatio * (plan?.shadow.range ?? 1)));
        const a = lid[Math.floor(lid.length / 2)]!, b = top[Math.floor(top.length / 2)]!;
        const grad = o.createLinearGradient(a.x, a.y, b.x, b.y);
        grad.addColorStop(0, rgba(color, 1));
        grad.addColorStop(0.55, rgba(color, 0.6));
        grad.addColorStop(1, rgba(color, 0));
        o.fillStyle = grad;
        o.beginPath();
        path(o, [...lid, ...[...top].reverse()]);
        o.fill();
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
    } else if (p.id === "lip") {
      path(o, lipOutline(lm, plan?.lip.overline ?? 0));
      path(o, LIP_INNER.map(P));
      o.fill("evenodd");
    } else {
      const bands = contourOutline(lm, plan?.faceShape ?? "oval", { tZone: plan?.highlight.tZone ?? true });
      for (const b of p.id === "contour" ? bands.shading : bands.highlight) path(o, b);
      o.fill();
    }
    // 층에는 색과 세기만 담는다 — 섞는 건 셰이더가 한다
    if (p.id === "highlight") {
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
}
