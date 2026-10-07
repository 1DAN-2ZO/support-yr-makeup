/**
 * 룩 옮기기 (실험) — 부위 가이드를 얼굴 점에 묶어, 다른 화면(실시간 카메라 · 다른 사진)의 얼굴 위에 다시 놓는다 (AR 로 보기).
 *
 * 부위 가이드(look-guide.ts)의 점 · 선은 내 맨얼굴 "사진의 좌표" 다. 카메라 화면에서는 얼굴이 움직이니 그대로는 못 쓴다.
 * 그래서 점마다 "내 맨얼굴의 얼굴 그물(face-mesh.ts) 어느 삼각형 안의 어디" 인지를 기억해 두고(무게중심 좌표),
 * 새 화면에서 찾은 얼굴 점으로 같은 삼각형의 같은 자리를 다시 찾는다 — look-transfer.ts 가 화장 사진을 내 얼굴에 포개는 것과 같은 대응이다.
 *
 * 얼굴이 화면 안에서 옮겨 가거나 · 커지거나 · 기울어도(평면 안에서) 가이드는 얼굴에 붙어 정확히 따라간다 (삼각형마다의 변환이 그것을 다 담는다).
 * 고개를 옆으로 돌리거나 표정이 바뀌면 삼각형들이 저마다 다르게 변하니 그만큼은 근사다. 얼굴 점이 흔들리는 만큼 가이드도 흔들린다.
 *
 * 해 보고 안 쓴 것 (2026-10-07): 삼각형 하나 대신 둘레의 얼굴 점 12 ~ 32개에 묶기(가까울수록 무겁게 — 이동 최소제곱).
 * 점마다 따로 넣은 가짜 잡음에서는 어긋남이 30 ~ 50% 줄었지만, 실제 얼굴 점 찾기로는 차이가 없었다 —
 * 옮김 · 줄임 · 기울임 · 어둡고 흐림 12장의 어긋남 1.48% → 1.45%, 가만히 있을 때의 떨림 0.72% → 0.70% (눈 폭 대비).
 * 실제 잡음은 이웃한 얼굴 점들이 같이 밀리는 꼴이라 이웃끼리 평균해도 안 줄어든다. 테두리가 엉키는 일은 두 방식 모두 없었다. 그래서 단순한 쪽을 둔다.
 *
 * 순수 함수 — Node 에서도 돈다.
 */

import { FACE_TRIANGLES } from "./face-mesh";
import type { Triangle } from "./face-mesh";
import type { LookGuide, PartGuide } from "./look-guide";
import { GUIDE_PARTS } from "./look-guide";
import type { Pt } from "./types";

/** 점 하나의 자리: 삼각형 번호와 그 안의 무게중심 좌표 (그물 밖의 점이면 음수가 섞인다 — 가장 가까운 삼각형에서 밖으로 뻗은 자리) */
export interface Anchor {
  tri: number;
  b1: number;
  b2: number;
}

/** 가이드의 점을 전부 f 로 바꾼 새 가이드 (숫자 · 문장 · 색은 그대로). 도는 순서는 늘 같다 */
export function mapGuide(guide: LookGuide, f: (p: Pt) => Pt): LookGuide {
  const part = (g: PartGuide): PartGuide => ({
    ...g,
    outline: { polys: g.outline.polys.map((poly) => poly.map(f)), lines: g.outline.lines.map((line) => line.map(f)) },
    dots: g.dots.map((d) => ({ ...d, at: f(d.at) })),
    zones: g.zones.map((z) => ({ ...z, poly: z.poly.map(f) })),
    arrows: g.arrows.map((a) => ({ ...a, from: f(a.from), to: f(a.to) })),
    measures: g.measures.map((m) => ({ ...m, from: f(m.from), to: f(m.to) })),
  });
  const out = {} as LookGuide;
  for (const p of GUIDE_PARTS) out[p] = part(guide[p]);
  return out;
}

/** p 가 얼굴 그물의 어느 삼각형 어디에 있나. 어느 삼각형에도 안 들면 가장 덜 벗어난 삼각형을 쓴다 */
export function anchorPoint(p: Pt, lm: readonly Pt[], tris: readonly Triangle[] = FACE_TRIANGLES): Anchor {
  let best: Anchor = { tri: 0, b1: 0, b2: 0 }, bestIn = -Infinity;
  for (let k = 0; k < tris.length; k++) {
    const [i0, i1, i2] = tris[k]!;
    const a = lm[i0], b = lm[i1], c = lm[i2];
    if (!a || !b || !c) continue;
    const area = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
    if (Math.abs(area) < 1e-6) continue;
    const b1 = ((p.x - a.x) * (c.y - a.y) - (c.x - a.x) * (p.y - a.y)) / area;
    const b2 = ((b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y)) / area;
    // 안쪽이면 셋 다 0 이상. 가장 작은 좌표가 클수록 덜 벗어났다 — 밖일 때는 삼각형 크기(px)로 곱해 "얼마나 멀리" 를 견준다
    const inside = Math.min(b1, b2, 1 - b1 - b2);
    const score = inside >= 0 ? inside : inside * Math.sqrt(Math.abs(area));
    if (score > bestIn) {
      bestIn = score;
      best = { tri: k, b1, b2 };
      if (inside >= 0) break;
    }
  }
  return best;
}

/** 기억해 둔 자리를 새 얼굴 점에서 다시 찾는다 */
export function placePoint(a: Anchor, lm: readonly Pt[], tris: readonly Triangle[] = FACE_TRIANGLES): Pt {
  const [i0, i1, i2] = tris[a.tri]!;
  const p0 = lm[i0]!, p1 = lm[i1]!, p2 = lm[i2]!, b0 = 1 - a.b1 - a.b2;
  return { x: b0 * p0.x + a.b1 * p1.x + a.b2 * p2.x, y: b0 * p0.y + a.b1 * p1.y + a.b2 * p2.y };
}

/** 얼굴 점에 묶은 가이드: 원래 가이드(문장 · 색 · 숫자)와, 점마다의 자리 (mapGuide 가 도는 순서대로) */
export interface AnchoredGuide {
  guide: LookGuide;
  anchors: Anchor[];
}

/** 가이드를 그것을 잰 얼굴 점(lm — 내 맨얼굴 사진의 것)에 묶는다 */
export function anchorGuide(guide: LookGuide, lm: readonly Pt[], tris: readonly Triangle[] = FACE_TRIANGLES): AnchoredGuide {
  const anchors: Anchor[] = [];
  mapGuide(guide, (p) => {
    anchors.push(anchorPoint(p, lm, tris));
    return p;
  });
  return { guide, anchors };
}

/** 묶어 둔 가이드를 새 얼굴 점(카메라 화면 · 다른 사진) 위에 놓는다. 점의 좌표만 바뀐다 */
export function placeGuide(a: AnchoredGuide, lm: readonly Pt[], tris: readonly Triangle[] = FACE_TRIANGLES): LookGuide {
  let k = 0;
  return mapGuide(a.guide, () => placePoint(a.anchors[k++]!, lm, tris));
}

/**
 * 얼굴 점의 떨림을 줄인다: 가만히 있을 때는 지난 값 쪽으로 많이 끌어당기고(덜 떨린다), 움직일 때는 새 값을 바로 따른다(밀리지 않는다).
 * u = 눈 폭(px). still · moving = 얼굴 점들이 평균 이만큼(눈 폭 대비) 움직였을 때 "가만히" · "움직임" 으로 친다. 눈대중 초기값
 */
export const FOLLOW = { still: 0.004, moving: 0.03, keep: 0.75 } as const;
export function followLandmarks(prev: readonly Pt[] | null, cur: readonly Pt[], u: number): Pt[] {
  if (!prev || prev.length !== cur.length || !(u > 0)) return cur.map((p) => ({ x: p.x, y: p.y }));
  let sum = 0;
  for (let i = 0; i < cur.length; i++) sum += Math.hypot(cur[i]!.x - prev[i]!.x, cur[i]!.y - prev[i]!.y);
  const moved = sum / cur.length / u;
  // 지난 값을 얼마나 남기나: 가만히면 keep, 움직이면 0
  const t = Math.max(0, Math.min(1, (moved - FOLLOW.still) / (FOLLOW.moving - FOLLOW.still)));
  const keep = FOLLOW.keep * (1 - t);
  return cur.map((p, i) => ({ x: p.x + (prev[i]!.x - p.x) * keep, y: p.y + (prev[i]!.y - p.y) * keep }));
}
