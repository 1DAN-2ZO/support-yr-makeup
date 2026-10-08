/**
 * 얼굴 그물 — MediaPipe 얼굴 점 468개를 잇는 삼각형 852개.
 *
 * 화장 무늬(기준 얼굴 위에 한 번 그린 것)를 매 프레임 지금 얼굴에 삼각형 단위로 휘어 붙이는 데 쓴다.
 * 고개를 돌리거나 표정이 바뀌어도 무늬가 피부에 붙어 같이 휜다 — 필터 앱 방식.
 * 같은 휘기로 2-b 에서 서버 화장 레이어를 개인화한 모양에 맞출 수 있다.
 */

import { FaceLandmarker } from "@mediapipe/tasks-vision";
import { HAIRLINE } from "./hairline";

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
 * 머리선 확장 그물(#312) — 468개 뒤에 칸마다 두 점(이마 위 선 위의 base, 머리선 at)을 더해
 * 이마 위 선과 머리선 사이를 삼각형 띠로 잇는다. base는 기존 그물의 맨 위 변(FOREHEAD_ARC) 위에
 * 있어서 틈이 안 생긴다. 머리선을 못 찾은 칸(at === base)은 삼각형 넓이가 0이라 저절로 안 그려진다.
 * 점 순서: base_0, at_0, base_1, at_1, ... (칸마다 2개, HAIRLINE.columns개)
 */
export const HAIRLINE_VERT_BASE = 468;
export const MESH_VERTEX_COUNT = HAIRLINE_VERT_BASE + HAIRLINE.columns * 2;

function hairlineStripTriangles(): Triangle[] {
  const out: Triangle[] = [];
  for (let k = 0; k < HAIRLINE.columns - 1; k++) {
    const base0 = HAIRLINE_VERT_BASE + k * 2, at0 = base0 + 1, base1 = base0 + 2, at1 = base0 + 3;
    out.push([base0, base1, at0], [at0, base1, at1]);
  }
  return out;
}

export const EXTENDED_TRIANGLES: readonly Triangle[] = [...FACE_TRIANGLES, ...hairlineStripTriangles()];
