// 얼굴 그물 — 화장 무늬를 얼굴에 삼각형 단위로 휘어 붙이는 데 쓴다 (필터 방식, 2-b 레이어 휘기)
import { describe, expect, it } from "vitest";
import { FaceLandmarker } from "@mediapipe/tasks-vision";
import { FACE_TRIANGLES, trianglesFromTesselation } from "@core/face-mesh";

describe("얼굴 그물 삼각형", () => {
  it("연결선 세 개가 닫힌 삼각형이면 그 세 점", () => {
    const e = (start: number, end: number) => ({ start, end });
    expect(trianglesFromTesselation([e(1, 2), e(2, 3), e(3, 1), e(4, 5), e(5, 6), e(6, 4)])).toEqual([[1, 2, 3], [4, 5, 6]]);
  });

  it("닫히지 않은 묶음은 버린다 — MediaPipe 가 순서를 바꾸면 조용히 틀린 그물이 되지 않게", () => {
    const e = (start: number, end: number) => ({ start, end });
    expect(trianglesFromTesselation([e(1, 2), e(2, 3), e(3, 9)])).toEqual([]);
  });

  it("MediaPipe 얼굴 그물: 삼각형 852개, 점 번호는 얼굴 점 468개 안", () => {
    expect(FaceLandmarker.FACE_LANDMARKS_TESSELATION.length).toBe(852 * 3);
    expect(FACE_TRIANGLES.length).toBe(852);
    expect(Math.max(...FACE_TRIANGLES.flat())).toBeLessThan(468);
  });
});
