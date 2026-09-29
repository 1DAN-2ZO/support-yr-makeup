/**
 * 쉐딩·하이라이트 자리 (F-05) — 얼굴형 규칙으로 밴드를 만든다.
 * POC poc/full/lib/screen3-core.js contourOutline 을 옮긴 것 (규칙 값: screen3-rules.js CONTOUR_RULES).
 *
 * 옮기며 바꾼 것:
 *  - 입력이 0~1 좌표 + 사진 크기가 아니라 프레임 px 랜드마크다 (채점 계약, guide-decisions #21 — 변환을 빠뜨리면 조용히 엉뚱한 자리에 밴드가 생긴다)
 *  - 턱끝 밴드 길이: 사진 폭 × 0.06 → 얼굴 폭 × CHIN_HALF. 사진 폭 기준이면 카메라 거리에 따라 길이가 바뀐다
 *  - 개인화: 하이라이트 T존을 켜거나(얼굴형 규칙에 없으면 더함) 끈다(번들거리는 피부)
 * 라벨 앵커(화면 글자 자리)는 옮기지 않았다 — 채점·가이드는 밴드만 쓴다.
 */

import type { FaceShapeLabel, Pt } from "./types";

type Region = "jawline" | "jawCorner" | "underCheek" | "cheekTop" | "foreheadSide" | "foreheadTop" | "chinTip" | "noseBridge" | "tZone" | "underEye";
interface BandSpec { region: Region; width: number }

/** 얼굴형별 밴드 (폭은 얼굴 폭 비율). POC screen3-rules.js 와 같은 값 */
export const CONTOUR_RULES: Record<FaceShapeLabel, { shading: BandSpec[]; highlight: BandSpec[] }> = {
  oval: { shading: [{ region: "underCheek", width: 0.07 }], highlight: [{ region: "cheekTop", width: 0.07 }, { region: "noseBridge", width: 0.05 }] },
  round: { shading: [{ region: "jawline", width: 0.085 }, { region: "underCheek", width: 0.1 }], highlight: [{ region: "cheekTop", width: 0.07 }, { region: "tZone", width: 0.064 }] },
  square: { shading: [{ region: "jawCorner", width: 0.093 }, { region: "foreheadSide", width: 0.079 }], highlight: [{ region: "cheekTop", width: 0.07 }, { region: "chinTip", width: 0.057 }] },
  oblong: { shading: [{ region: "foreheadTop", width: 0.085 }, { region: "chinTip", width: 0.085 }], highlight: [{ region: "cheekTop", width: 0.1 }] },
  heart: { shading: [{ region: "foreheadSide", width: 0.085 }, { region: "chinTip", width: 0.07 }], highlight: [{ region: "cheekTop", width: 0.07 }, { region: "underEye", width: 0.057 }] },
};

/** 턱끝 밴드의 반 길이 (얼굴 폭 비율). 얼굴이 사진 폭의 약 40% 일 때 POC 의 사진 폭 × 0.06 과 같다 */
export const CHIN_HALF = 0.15;
/** T존을 더할 때의 폭 — 둥근형 규칙의 T존 값 */
const TZONE_WIDTH = 0.064;

const IDX = {
  cheek: { r: [116, 117, 118, 101, 36, 205, 187, 123], l: [345, 346, 347, 330, 266, 425, 411, 352] },
  jawline: [172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397],
  faceEdge: { r: 234, l: 454 },
  foreheadTop: 10,
  foreheadSide: { r: 54, l: 284 },
  chinTip: 152,
  noseBridge: [168, 6, 197, 195, 5, 4],
  underEye: { r: [228, 229, 230, 231, 232], l: [448, 449, 450, 451, 452] },
} as const;

function px(lm: readonly Pt[], ids: readonly number[]): Pt[] {
  return ids.map((i) => {
    const p = lm[i];
    if (!p) throw new Error(`랜드마크 ${i} 없음`);
    return { x: p.x, y: p.y };
  });
}

/** 링 점들을 가운데 높이로 갈라 위/아래 반을 x 순서 폴리라인으로 */
function halfRing(pts: Pt[], which: "upper" | "lower"): Pt[] {
  const cy = pts.reduce((a, p) => a + p.y, 0) / (pts.length || 1);
  const half = pts.filter((p) => (which === "upper" ? p.y <= cy : p.y >= cy));
  return (half.length >= 2 ? half : pts).slice().sort((a, b) => a.x - b.x);
}

function lines(lm: readonly Pt[], region: Region, faceW: number): Pt[][] {
  const one = (i: number): Pt => px(lm, [i])[0]!;
  switch (region) {
    case "jawline": return [px(lm, IDX.jawline)];
    case "jawCorner": {
      const j = px(lm, IDX.jawline), k = Math.max(2, Math.round(j.length / 3));
      return [j.slice(0, k), j.slice(-k)];
    }
    case "underCheek": return [halfRing(px(lm, IDX.cheek.r), "lower"), halfRing(px(lm, IDX.cheek.l), "lower")];
    case "cheekTop": return [halfRing(px(lm, IDX.cheek.r), "upper"), halfRing(px(lm, IDX.cheek.l), "upper")];
    case "foreheadSide": {
      const top = one(IDX.foreheadTop), r = one(IDX.foreheadSide.r), l = one(IDX.foreheadSide.l);
      return [[r, { x: (r.x + top.x) / 2, y: top.y }], [l, { x: (l.x + top.x) / 2, y: top.y }]];
    }
    case "foreheadTop": {
      const r = one(IDX.foreheadSide.r), l = one(IDX.foreheadSide.l), top = one(IDX.foreheadTop);
      return [[{ x: r.x, y: top.y }, { x: l.x, y: top.y }]];
    }
    case "chinTip": {
      const c = one(IDX.chinTip), d = faceW * CHIN_HALF;
      return [[{ x: c.x - d, y: c.y }, { x: c.x + d, y: c.y }]];
    }
    case "noseBridge": return [px(lm, IDX.noseBridge)];
    case "tZone": return [px(lm, [IDX.foreheadTop, ...IDX.noseBridge])];
    case "underEye": return [px(lm, IDX.underEye.r), px(lm, IDX.underEye.l)];
  }
}

/** 폴리라인을 법선 방향으로 ±폭/2 밀어 닫힌 밴드로 */
function band(pts: Pt[], width: number): Pt[] {
  if (pts.length < 2) return [];
  const half = width / 2, up: Pt[] = [], dn: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)]!, b = pts[Math.min(pts.length - 1, i + 1)]!;
    let tx = b.x - a.x, ty = b.y - a.y;
    const len = Math.hypot(tx, ty) || 1;
    tx /= len; ty /= len;
    const nx = -ty, ny = tx, p = pts[i]!;
    up.push({ x: p.x + nx * half, y: p.y + ny * half });
    dn.push({ x: p.x - nx * half, y: p.y - ny * half });
  }
  return [...up, ...dn.reverse()];
}

export interface ContourOptions {
  /** true: T존 하이라이트를 넣는다(없으면 더함) · false: 콧대·T존 하이라이트를 뺀다 · "rule": 얼굴형 규칙 그대로 */
  tZone: boolean | "rule";
}

/** 얼굴형 규칙 + 개인화로 쉐딩·하이라이트 밴드(프레임 px). 좌우 구분·가운데 밴드 제외는 채점이 한다 */
export function contourOutline(lm: readonly Pt[], faceShape: FaceShapeLabel, opts: ContourOptions = { tZone: "rule" }): { shading: Pt[][]; highlight: Pt[][] } {
  const rule = CONTOUR_RULES[faceShape];
  const faceW = Math.max(1, Math.hypot(lm[IDX.faceEdge.r]!.x - lm[IDX.faceEdge.l]!.x, lm[IDX.faceEdge.r]!.y - lm[IDX.faceEdge.l]!.y));
  let hl = rule.highlight;
  const centre = (s: BandSpec) => s.region === "tZone" || s.region === "noseBridge";
  if (opts.tZone === true && !hl.some(centre)) hl = [...hl, { region: "tZone", width: TZONE_WIDTH }];
  if (opts.tZone === false) hl = hl.filter((s) => !centre(s));
  const build = (specs: readonly BandSpec[]) =>
    specs.flatMap((s) => lines(lm, s.region, faceW).map((l) => band(l, s.width * faceW))).filter((b) => b.length >= 4);
  return { shading: build(rule.shading), highlight: build(hl) };
}
