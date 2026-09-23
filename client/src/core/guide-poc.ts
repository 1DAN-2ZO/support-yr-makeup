/**
 * [임시] 채점용 가이드 기하 — poc/full/lib/guides.js 의 buildGuide 에서 채점이 쓰는 부분만 TS 로.
 *
 * ② 가이드가 guides.ts·contour.ts(#21) 를 올리면 이 파일을 지우고 그것을 쓴다. 그때까지 화면 5 와
 * 평가 CLI(eval/score/score_cli.mjs) 가 같은 이 파일을 써서, 평가가 앱과 같은 것을 잰다.
 *
 * 모양은 score-part.ts 의 GuideSource: (partId, frame) → PartGeometry. R = 이미지 왼쪽 눈(eyeA) = 피험자 오른쪽.
 * 치수: 라이너 두께는 룩(rules/looks.json parts.liner.thick)에서 읽는다 — 룩을 고르면 채점 잣대가 따라가야 한다 (#44).
 * 나머지(꼬리 각 30°·길이 0.15, 섀도우 0.55, 볼 0.11×0.07 −25°, 입술 오프셋 0.01)는 POC TEMPLATE 값 그대로.
 *
 * 쉐딩은 자리표시다 — 앱은 얼굴형 규칙(contourOutline, screen3-core.js)의 밴드를 쓴다. 여기서는 guides.js 의
 * 둥근형 예시 타원(좌우 하나씩)만 낸다. ② contour.ts 가 그 배열을 그대로 넘기면 된다.
 */

import { LM, at } from "./landmarks";
import type { LookPart } from "./looks";
import type { GuideSource, PartGeometry } from "./score-part";
import type { Side } from "./score";
import type { PartId, Pt } from "./types";

const TEMPLATE = {
  liner: { wingAngle: 30, wing: 0.15, thick: 0.045 },
  lip: { offset: 0.01 },
  shadow: { rangeRatio: 0.55 },
  cheek: { rx: 0.11, ry: 0.07, tilt: -25 },
  contour: { rx: 0.13, ry: 0.05, tilt: -30, down: 0.06, toward: 0.35 },
  highlight: { rx: 0.09, ry: 0.035, tilt: -20, up: 0.05, toward: 0.2 },
} as const;

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
const norm = (a: Pt): Pt => {
  const l = Math.hypot(a.x, a.y) || 1;
  return { x: a.x / l, y: a.y / l };
};
const mix = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

function ellipse(c: Pt, rx: number, ry: number, deg: number, n = 28): Pt[] {
  const t = (deg * Math.PI) / 180, out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI, x = rx * Math.cos(a), y = ry * Math.sin(a);
    out.push({ x: c.x + x * Math.cos(t) - y * Math.sin(t), y: c.y + x * Math.sin(t) + y * Math.cos(t) });
  }
  return out;
}

const SIDES = [
  { key: "R" as Side, eye: LM.eyeA, brow: LM.browA, cheek: LM.cheekA, face: LM.faceL, sign: -1 },
  { key: "L" as Side, eye: LM.eyeB, brow: LM.browB, cheek: LM.cheekB, face: LM.faceR, sign: 1 },
] as const;
type SideSpec = (typeof SIDES)[number];

/** @param lookParts 고른 룩의 parts (looks.json). 라이너 두께를 여기서 읽는다. 없으면 POC 기본 */
export function pocGuide(lookParts: Partial<Record<Exclude<PartId, "contour">, LookPart>> = {}): GuideSource {
  const linerThick = lookParts.liner?.thick && lookParts.liner.thick > 0 ? lookParts.liner.thick : TEMPLATE.liner.thick;
  return (partId, f): PartGeometry => {
    const P = (i: number): Pt => at(f.lm, i);
    const faceW = f.unit.face;
    const both = <T>(fn: (s: SideSpec) => T): Record<Side, T> => ({ R: fn(SIDES[0]), L: fn(SIDES[1]) });

    if (partId === "liner") {
      return {
        liner: {
          wing: both(({ eye }) => {
            const outer = P(eye.outer), inner = P(eye.inner);
            const v = norm(sub(outer, inner)), a = (TEMPLATE.liner.wingAngle * Math.PI) / 180;
            const dir = norm(add(mul(v, Math.cos(a)), { x: 0, y: -Math.sin(a) }));
            return [outer, add(outer, mul(dir, TEMPLATE.liner.wing * f.unit.eye))] as const;
          }),
          thick: linerThick,
        },
      };
    }
    if (partId === "lip") return { lip: { offset: TEMPLATE.lip.offset } };
    if (partId === "shadow") {
      return {
        regions: both(({ eye, brow }) => {
          const lid = eye.upper.map(P), browLo = brow.lower.map(P);
          const top = lid.map((p, i) => mix(p, browLo[Math.min(browLo.length - 1, Math.round((i / (lid.length - 1)) * (browLo.length - 1)))]!, TEMPLATE.shadow.rangeRatio));
          return [...lid, ...top.reverse()];
        }),
      };
    }
    if (partId === "cheek") {
      return {
        regions: both(({ cheek, face, sign }) => ellipse(mix(P(cheek), P(face), 0.25), faceW * TEMPLATE.cheek.rx, faceW * TEMPLATE.cheek.ry, sign * TEMPLATE.cheek.tilt)),
      };
    }
    if (partId === "contour") {
      const c = TEMPLATE.contour, h = TEMPLATE.highlight;
      return {
        contour: {
          shading: SIDES.map(({ cheek, face, sign }) => ellipse(add(mix(P(cheek), P(face), c.toward), { x: 0, y: faceW * c.down }), faceW * c.rx, faceW * c.ry, sign * c.tilt)),
          highlight: SIDES.map(({ cheek, face, sign }) => ellipse(add(mix(P(cheek), P(face), h.toward), { x: 0, y: -faceW * h.up }), faceW * h.rx, faceW * h.ry, sign * h.tilt)),
        },
      };
    }
    return {};
  };
}
