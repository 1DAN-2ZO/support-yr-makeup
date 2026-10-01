/**
 * 결과 모양 채점 (실험, score-shape 브랜치 2026-10-01) — 맨얼굴과 비교하지 않고 **지금 사진 한 장**에서 잰다.
 *
 * 지금 채점(score-part)은 "맨얼굴 대비 바뀐 칸 = 그린 곳" 이라, 원래 눈썹이 이미 가이드 모양인 사람은 "안 보임" 이 된다.
 * 팀 방향(2026-10-01): 눈썹이 이미 정답 모양이면 무시하지 않는다 → 채움은 "원래 있던 것 + 그린 것" 으로 본다.
 * 여기는 그 채움을 맨얼굴 없이 재는 쪽 — 기준은 같은 사진의 **주변 피부**라서 두 사진의 조명·크기 차이에 안 흔들린다 (#261).
 *
 * 아직 앱에 연결하지 않았다. 합성 세트(eval/samples)로 지금 방식과 비교한 뒤 팀이 정한다.
 */

import { pointInPoly, type Lab } from "./color";
import { boxOf, isHair, labBox, type SampleFrame } from "./sampling";
import type { Pt } from "./types";

export interface ShapeFillOptions {
  /** 주변 피부보다 L* 가 이만큼 어두우면 "있는 칸" (가정값 — 그림자·잡티는 4~6 쯤) */
  darkL: number;
  /** 주변 피부 띠: 가이드를 가운데 기준으로 이 배율만큼 키운 것에서 안쪽 배율까지를 뺀 것 (sampleRegion 과 같은 1.3~1.8) */
  ring: readonly [number, number];
}
export const SHAPE_FILL: ShapeFillOptions = { darkL: 12, ring: [1.3, 1.8] };

export interface ShapeFill {
  /** 가이드 안 칸 중 "있는 칸" 비율 (0~1). 머리카락에 가린 칸은 뺀다 */
  coverage: number;
  /** 센 칸 수 */
  n: number;
  /** 주변 피부 (못 재면 null — coverage 0) */
  skin: Lab | null;
}

const scale = (poly: readonly Pt[], k: number): Pt[] => {
  const c = { x: poly.reduce((s, p) => s + p.x, 0) / poly.length, y: poly.reduce((s, p) => s + p.y, 0) / poly.length };
  return poly.map((p) => ({ x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k }));
};
const medianOf = (v: number[]): number => v.sort((a, b) => a - b)[Math.floor(v.length / 2)]!;

/** 가이드 다각형 안을 칸으로 훑어, 주변 피부보다 뚜렷이 어두운 칸의 비율을 낸다 (눈썹·라이너처럼 어둡게 그리는 부위) */
export function shapeFill(f: SampleFrame, poly: readonly Pt[], opt: ShapeFillOptions = SHAPE_FILL): ShapeFill {
  const box = boxOf(f.unit.eye);
  const hole = scale(poly, opt.ring[0]), outer = scale(poly, opt.ring[1]);
  const cells = (region: readonly Pt[], keep: (x: number, y: number) => boolean): Lab[] => {
    const xs = region.map((p) => p.x), ys = region.map((p) => p.y), out: Lab[] = [];
    for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(f.im.h - 1, Math.ceil(Math.max(...ys))); y += box) {
      for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(f.im.w - 1, Math.ceil(Math.max(...xs))); x += box) {
        if (pointInPoly(x, y, region) && keep(x, y) && !isHair(f, x, y)) out.push(labBox(f.im, x, y, box));
      }
    }
    return out;
  };
  const ring = cells(outer, (x, y) => !pointInPoly(x, y, hole));
  if (!ring.length) return { coverage: 0, n: 0, skin: null };
  const skin: Lab = { L: medianOf(ring.map((c) => c.L)), a: medianOf(ring.map((c) => c.a)), b: medianOf(ring.map((c) => c.b)) };
  const inside = cells(poly, () => true);
  const hit = inside.filter((c) => skin.L - c.L >= opt.darkL).length;
  return { coverage: inside.length ? hit / inside.length : 0, n: inside.length, skin };
}
