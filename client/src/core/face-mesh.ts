/**
 * 얼굴 그물 — MediaPipe 얼굴 점 468개를 잇는 삼각형 852개.
 *
 * 화장 무늬(기준 얼굴 위에 한 번 그린 것)를 매 프레임 지금 얼굴에 삼각형 단위로 휘어 붙이는 데 쓴다.
 * 고개를 돌리거나 표정이 바뀌어도 무늬가 피부에 붙어 같이 휜다 — 필터 앱 방식.
 * 같은 휘기로 2-b 에서 서버 화장 레이어를 개인화한 모양에 맞출 수 있다.
 */

import { FaceLandmarker } from "@mediapipe/tasks-vision";
import { FOREHEAD_POLY } from "./color";
import type { Pt } from "./types";

export type Triangle = readonly [number, number, number];

/**
 * MediaPipe 의 연결선은 삼각형마다 세 변(a→b, b→c, c→a)이 차례로 들어 있다.
 * 닫히지 않은 묶음은 버린다 — 순서가 바뀌면 조용히 틀린 그물이 되지 않고 테스트에서 개수가 어긋난다.
 */
export function trianglesFromTesselation(edges: readonly { start: number; end: number }[]): Triangle[] {
  const out: Triangle[] = [];
  for (let i = 0; i + 2 < edges.length; i += 3) {
    const a = edges[i]!, b = edges[i + 1]!, c = edges[i + 2]!;
    if (a.end === b.start && b.end === c.start && c.end === a.start) out.push([a.start, b.start, c.start]);
  }
  return out;
}

export const FACE_TRIANGLES: readonly Triangle[] = trianglesFromTesselation(FaceLandmarker.FACE_LANDMARKS_TESSELATION);

/**
 * [dev] 헤어라인 확장 — MediaPipe 468점 그물은 헤어라인이 아니라 FOREHEAD_POLY(이마 중간쯤)에서 끝난다.
 * "피부 보정" 같은 전체 얼굴 효과가 그 경계에서 잘려 보이는 문제(makeup-probe)를 없애려고,
 * 안 잡히는 헤어라인 점 11개를 미간(168) 기준 방사형 확대로 눈대중 추정해 그물을 한 겹 더 늘린다.
 * 실측 랜드마크가 아니라 지어낸 점이라, 과학적 정확도가 필요한 채점·가이드 쪽에는 절대 쓰지 않는다.
 */
const GLABELLA = 168;
/** 확대 비율(1+k). 클수록 헤어라인이 더 위로. 눈대중 시작값 — 어색하면 여기만 조정 */
const HAIRLINE_SCALE = 1.4;
/** 합성 헤어라인 점이 시작하는 인덱스. lm 배열이 478점(홍채 포함)이라 그 다음 자리부터 이어 붙인다 */
export const HAIRLINE_START = 478;

/** FOREHEAD_POLY 각 점을 미간에서 바깥으로 밀어 헤어라인 점 11개를 만든다. 순서는 FOREHEAD_POLY와 같다 */
export function estimateHairline(lm: readonly Pt[]): Pt[] {
  const c = lm[GLABELLA];
  if (!c) throw new Error(`랜드마크 ${GLABELLA} 없음 (${lm.length}점)`);
  return FOREHEAD_POLY.map((i) => {
    const p = lm[i];
    if (!p) throw new Error(`랜드마크 ${i} 없음 (${lm.length}점)`);
    return { x: c.x + (p.x - c.x) * HAIRLINE_SCALE, y: c.y + (p.y - c.y) * HAIRLINE_SCALE };
  });
}

/** lm(478점) 뒤에 헤어라인 합성점 11개(인덱스 478~488)를 이어 붙인다 */
export function withHairline(lm: readonly Pt[]): Pt[] {
  return [...lm, ...estimateHairline(lm)];
}

/**
 * 기존 그물 슬롯(0~467)에 더해, 합성 헤어라인(478~488)을 새 슬롯으로 얹는다. 홍채(468~477)는 그물에 안 쓰여 건너뛴다.
 * MakeupGl 은 이 배열 순서대로 정점을 채운다 — "슬롯 i가 랜드마크 배열의 몇 번을 읽나"의 유일한 근거.
 */
export const MESH_VERTEX_SRC: readonly number[] = [
  ...Array.from({ length: 468 }, (_, i) => i),
  ...Array.from({ length: FOREHEAD_POLY.length }, (_, i) => HAIRLINE_START + i),
];

/** FOREHEAD_POLY(실제, 슬롯=자기 인덱스) ↔ 합성 헤어라인(슬롯 468~478) 리본 삼각형 20개 */
export const HAIRLINE_TRIANGLES: readonly Triangle[] = (() => {
  const slotOf = (real: number): number => MESH_VERTEX_SRC.indexOf(real);
  const out: Triangle[] = [];
  for (let i = 0; i < FOREHEAD_POLY.length - 1; i++) {
    const a = slotOf(FOREHEAD_POLY[i]!), b = slotOf(FOREHEAD_POLY[i + 1]!);
    const ah = slotOf(HAIRLINE_START + i), bh = slotOf(HAIRLINE_START + i + 1);
    out.push([a, b, bh], [a, bh, ah]);
  }
  return out;
})();

/** 기존 얼굴 그물 + 헤어라인 리본. 화장은 그대로 FACE_TRIANGLES만 써도 되고, 피부 보정처럼 전체를 덮는 효과만 이걸 쓴다 */
export const EXTENDED_TRIANGLES: readonly Triangle[] = [...FACE_TRIANGLES, ...HAIRLINE_TRIANGLES];
