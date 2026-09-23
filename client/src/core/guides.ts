/**
 * ② 가이드 기하 (2-1, #21). 랜드마크(px)를 받아 부위별 가이드의 자리와 치수를 그 자리에서 계산한다.
 *
 * 두 곳이 쓴다.
 *  - 채점: lookGuide(룩) → GuideSource. 모양은 score-part.ts 의 PartGeometry (#139 계약).
 *    맨얼굴·화장 사진에 각각 부르므로 저장하지 않고 넘긴 랜드마크로 만든다 (결정 A2).
 *  - 화면: linerOutline() — 라이너를 얼마나 두껍게 칠할지 보여 주는 윤곽.
 *
 * 채점에 주는 값은 임시 guide-poc.ts 와 같다 — 갈아끼워도 점수가 안 바뀐다(검증 G3).
 * 쉐딩은 아직 자리표시(둥근형 예시 타원)다. contour.ts 가 얼굴형 규칙(contourOutline) 밴드로 바꾼다.
 *
 * R = 이미지 왼쪽 눈(eyeA) = 피험자 오른쪽. 진단 문구 "오른쪽 꼬리가…" 가 여기 묶여 있어 뒤집으면 반대로 안내한다.
 */

import { LM, at } from "./landmarks";
import type { LookPart, LookPartId } from "./looks";
import type { GuideSource, PartGeometry } from "./score-part";
import type { Side } from "./score";
import type { Baseline, Pt } from "./types";

/**
 * 가이드 치수 — 가정값은 여기 한 곳 (dev-stack §6). 길이는 전부 비율: 눈 부위는 눈 폭, 입술은 입술 폭, 볼·쉐딩은 얼굴 폭.
 * 라이너 두께만 룩(rules/looks.json parts.liner.thick)이 정하고, 여기 값은 룩에 두께가 없을 때(룩이 빈 평가 문항)의 기본이다.
 * 나머지는 룩에 없는 값이라 POC TEMPLATE 그대로 — 최종 값은 #78(룩 확정)·#121(값 측정)에서 온다.
 * 주의: 채점은 이 선을 0점으로 삼는다. 여기 숫자가 미용적으로 틀리면 앱이 사용자에게 "틀렸다" 고 말한다 (결정 B1).
 */
export const GUIDE_PARAMS = {
  liner: { wingAngle: 30, wing: 0.15, thick: 0.045 },
  lip: { offset: 0.01 },
  shadow: { rangeRatio: 0.55 },
  cheek: { toward: 0.25, rx: 0.11, ry: 0.07, tilt: -25 },
  contour: { rx: 0.13, ry: 0.05, tilt: -30, down: 0.06, toward: 0.35 },
  highlight: { rx: 0.09, ry: 0.035, tilt: -20, up: 0.05, toward: 0.2 },
} as const;

/** 랜드마크와 기준 길이만 있으면 된다 — 화면에서는 이미지 없이 부른다 */
export type GuideFrame = { lm: readonly Pt[]; unit: Baseline["unit"] };

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
const both = <T>(fn: (s: SideSpec) => T): Record<Side, T> => ({ R: fn(SIDES[0]), L: fn(SIDES[1]) });

/** 꼬리 선 [눈꼬리, 꼬리 끝]: 눈 축(안쪽→바깥)에서 wingAngle 만큼 화면 위로, 길이는 눈 폭 × wing */
function wingOf(f: GuideFrame, eye: SideSpec["eye"]): readonly [Pt, Pt] {
  const outer = at(f.lm, eye.outer), inner = at(f.lm, eye.inner);
  const v = norm(sub(outer, inner)), a = (GUIDE_PARAMS.liner.wingAngle * Math.PI) / 180;
  const dir = norm(add(mul(v, Math.cos(a)), { x: 0, y: -Math.sin(a) }));
  return [outer, add(outer, mul(dir, GUIDE_PARAMS.liner.wing * f.unit.eye))] as const;
}

/**
 * 채점용 가이드. 룩을 고르면 라이너 두께가 따라간다 (#44 — 두께가 상수면 룩 선택이 채점에 영향이 없었다).
 * @param lookParts 고른 룩의 parts (looks.json). 비어 있으면 기본 치수
 */
export function lookGuide(lookParts: Partial<Record<LookPartId, LookPart>> = {}): GuideSource {
  const t = lookParts.liner?.thick;
  const linerThick = t && t > 0 ? t : GUIDE_PARAMS.liner.thick;
  return (partId, f): PartGeometry => {
    const P = (i: number): Pt => at(f.lm, i);
    const faceW = f.unit.face;

    if (partId === "liner") return { liner: { wing: both(({ eye }) => wingOf(f, eye)), thick: linerThick } };
    if (partId === "lip") return { lip: { offset: GUIDE_PARAMS.lip.offset } };
    if (partId === "shadow") {
      return {
        regions: both(({ eye, brow }) => {
          const lid = eye.upper.map(P), browLo = brow.lower.map(P);
          const top = lid.map((p, i) => mix(p, browLo[Math.min(browLo.length - 1, Math.round((i / (lid.length - 1)) * (browLo.length - 1)))]!, GUIDE_PARAMS.shadow.rangeRatio));
          return [...lid, ...top.reverse()];
        }),
      };
    }
    if (partId === "cheek") {
      const c = GUIDE_PARAMS.cheek;
      return { regions: both(({ cheek, face, sign }) => ellipse(mix(P(cheek), P(face), c.toward), faceW * c.rx, faceW * c.ry, sign * c.tilt)) };
    }
    if (partId === "contour") {
      // [자리표시] contour.ts 가 얼굴형 규칙 밴드(contourOutline)로 바꾼다
      const c = GUIDE_PARAMS.contour, h = GUIDE_PARAMS.highlight;
      return {
        contour: {
          shading: SIDES.map(({ cheek, face, sign }) => ellipse(add(mix(P(cheek), P(face), c.toward), { x: 0, y: faceW * c.down }), faceW * c.rx, faceW * c.ry, sign * c.tilt)),
          highlight: SIDES.map(({ cheek, face, sign }) => ellipse(add(mix(P(cheek), P(face), h.toward), { x: 0, y: -faceW * h.up }), faceW * h.rx, faceW * h.ry, sign * h.tilt)),
        },
      };
    }
    return {};   // 눈썹: 채점이 랜드마크만으로 뽑는다
  };
}

/**
 * 라이너 두께 윤곽 (화면용). 칠할 자리를 선으로 닫아 보여 준다 — 면 채우기 없음(F-07).
 *   아래 테두리 = 속눈썹 선(윗눈꺼풀 점), 위 테두리 = 거기서 화면 위쪽으로 thick × 눈 폭, 끝은 꼬리 끝에서 만난다.
 * 순서: 속눈썹 선(안쪽 → 바깥) → 꼬리 끝 → 위 테두리(바깥 → 안쪽). 닫힌 다각형으로 그리면 된다.
 * 두께 띠를 속눈썹 선에서 **위로** 잡는 뜻은 채점과 맞춰야 한다 (#153).
 */
export function linerOutline(f: GuideFrame, thick: number): Record<Side, Pt[]> {
  return both(({ eye }) => {
    const lid = eye.upper.map((i) => at(f.lm, i)).reverse();   // 안쪽 → 바깥
    const off = thick * f.unit.eye;
    const top = lid.map((p, i) => {
      const a = lid[Math.max(0, i - 1)]!, b = lid[Math.min(lid.length - 1, i + 1)]!;
      let n = norm({ x: -(b.y - a.y), y: b.x - a.x });   // 접선에 수직
      if (n.y > 0) n = mul(n, -1);                       // 화면 위쪽(y 가 작아지는 쪽)으로
      return add(p, mul(n, off));
    });
    return [...lid, wingOf(f, eye)[1], ...top.reverse()];
  });
}
