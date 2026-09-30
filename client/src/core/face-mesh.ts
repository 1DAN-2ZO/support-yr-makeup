/**
 * 얼굴 그물 — MediaPipe 얼굴 점 468개를 잇는 삼각형 852개.
 *
 * 화장 무늬(기준 얼굴 위에 한 번 그린 것)를 매 프레임 지금 얼굴에 삼각형 단위로 휘어 붙이는 데 쓴다.
 * 고개를 돌리거나 표정이 바뀌어도 무늬가 피부에 붙어 같이 휜다 — 필터 앱 방식.
 * 같은 휘기로 2-b 에서 서버 화장 레이어를 개인화한 모양에 맞출 수 있다.
 */

import { FaceLandmarker } from "@mediapipe/tasks-vision";

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
