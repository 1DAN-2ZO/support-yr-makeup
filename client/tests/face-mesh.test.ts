// 얼굴 그물 — 화장 무늬를 얼굴에 삼각형 단위로 휘어 붙이는 데 쓴다 (필터 방식, 2-b 레이어 휘기)
import { describe, expect, it } from "vitest";
import { FaceLandmarker } from "@mediapipe/tasks-vision";
import { FOREHEAD_POLY } from "@core/color";
import {
  EXTENDED_TRIANGLES, FACE_TRIANGLES, HAIRLINE_START, HAIRLINE_TRIANGLES,
  MESH_VERTEX_SRC, estimateHairline, trianglesFromTesselation, withHairline,
} from "@core/face-mesh";
import { LM } from "@core/landmarks";
import { LMS } from "./helpers/synth-face";

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

// [dev] 헤어라인 확장 — makeup-probe의 "피부 보정"이 이마 중간에서 잘리는 문제 때문에 추가.
// 실측 랜드마크가 아니라 지어낸 점이라 정확도는 안 다루고, 기존 468점 그물이 안 흔들리는지만 확인한다.
describe("estimateHairline", () => {
  it("FOREHEAD_POLY 점 수만큼 낸다", () => {
    expect(estimateHairline(LMS)).toHaveLength(FOREHEAD_POLY.length);
  });

  it("미간(168)에서 원래 점보다 항상 더 멀다 — 안쪽으로 들어가면 헤어라인이 아니라 얼굴 속으로 간 것", () => {
    const c = LMS[LM.glabella]!;
    const dist = (p: { x: number; y: number }) => Math.hypot(p.x - c.x, p.y - c.y);
    const hair = estimateHairline(LMS);
    FOREHEAD_POLY.forEach((idx, i) => {
      expect(dist(hair[i]!)).toBeGreaterThan(dist(LMS[idx]!));
    });
  });

  it("미간을 지나는 직선 위에 있다 — 방사형 확대라 방향은 안 바뀐다", () => {
    const c = LMS[LM.glabella]!;
    const hair = estimateHairline(LMS);
    FOREHEAD_POLY.forEach((idx, i) => {
      const p = LMS[idx]!, h = hair[i]!;
      const cross = (p.x - c.x) * (h.y - c.y) - (p.y - c.y) * (h.x - c.x);
      expect(Math.abs(cross)).toBeLessThan(1e-6);
    });
  });
});

describe("withHairline", () => {
  it("원본 478점을 그대로 두고 뒤에 헤어라인 11점만 이어 붙인다 — 기존 점이 안 흔들려야 한다", () => {
    const out = withHairline(LMS);
    expect(out).toHaveLength(LMS.length + FOREHEAD_POLY.length);
    expect(out.slice(0, LMS.length)).toEqual(LMS);
    expect(out[HAIRLINE_START]).toEqual(estimateHairline(LMS)[0]);
  });
});

describe("그물 정점·삼각형 인덱스 정합성", () => {
  it("MESH_VERTEX_SRC 앞 468개는 항등 매핑 — 기존 468점 그물이 그대로 유지된다", () => {
    expect(MESH_VERTEX_SRC.slice(0, 468)).toEqual(Array.from({ length: 468 }, (_, i) => i));
  });

  it("MESH_VERTEX_SRC 길이 = 468(실제) + FOREHEAD_POLY(합성)", () => {
    expect(MESH_VERTEX_SRC).toHaveLength(468 + FOREHEAD_POLY.length);
  });

  it("MESH_VERTEX_SRC 는 withHairline() 결과 안에서 실제로 존재하는 인덱스만 가리킨다", () => {
    const total = withHairline(LMS).length;
    for (const src of MESH_VERTEX_SRC) expect(src).toBeLessThan(total);
  });

  it("HAIRLINE_TRIANGLES 는 FOREHEAD_POLY 점 수보다 하나 적은 구간마다 2개 — 리본", () => {
    expect(HAIRLINE_TRIANGLES).toHaveLength((FOREHEAD_POLY.length - 1) * 2);
  });

  it("HAIRLINE_TRIANGLES 의 슬롯 번호가 전부 MESH_VERTEX_SRC 범위 안에 있다", () => {
    for (const tri of HAIRLINE_TRIANGLES) for (const slot of tri) expect(slot).toBeLessThan(MESH_VERTEX_SRC.length);
  });

  it("EXTENDED_TRIANGLES = FACE_TRIANGLES + HAIRLINE_TRIANGLES — 기존 852개는 그대로 앞에 있다", () => {
    expect(EXTENDED_TRIANGLES).toHaveLength(FACE_TRIANGLES.length + HAIRLINE_TRIANGLES.length);
    expect(EXTENDED_TRIANGLES.slice(0, FACE_TRIANGLES.length)).toEqual(FACE_TRIANGLES);
  });
});
