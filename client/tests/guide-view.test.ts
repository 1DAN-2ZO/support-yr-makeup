// 화면 3 (부위 완성본) 표시 규칙 · 부위 확대 박스 — 순수 함수 검증
// 정의서 3-1: 3-2b 완성본 범위(부위 크롭), 3-3 확대(눈: 양 끝 + 여백 15%, 입술·볼: 부위 2~3배), 3-5 근거 한 줄, 3-6 필요한 것 한 줄
import { describe, expect, it } from "vitest";
import { EYE_CROP_MARGIN, coverView, cropSpec, scaleLm } from "@core/crop";
import { partCard } from "@core/guide-view";
import { LOOKS, LOOK_PART_ORDER, CONTOUR_RATIONALE } from "@core/looks";
import { LM, PART_POINTS } from "@core/landmarks";
import type { FaceShape, PartId } from "@core/types";
import { LMS } from "./helpers/synth-face";

const PARTS: readonly PartId[] = ["brow", "liner", "shadow", "lip", "cheek", "contour"];
const round: FaceShape = { label: "round", confidence: 0.8, method: "model", version: "t" };
const pending: FaceShape = { label: "oval", confidence: 0, method: "rule", version: "faceshape-pending" };

describe("partCard", () => {
  it("V1 룩 부위: 근거는 룩의 한 줄, 필요한 것은 그 부위 제품에서 '눈 · ' 머리를 뗀 것", () => {
    const edgy = LOOKS.find((l) => l.products.some((p) => p.includes("블랙 젤 라이너")))!;
    const c = partCard("liner", edgy, null);
    expect(c.title).toBe("아이라이너");
    expect(c.rationale).toBe(edgy.rationale.liner);
    expect(c.need).toBe("지금 필요한 것: 블랙 젤 라이너");   // 정의서 3-6 예시 모양 (look-v0.2 세미 스모키)
  });

  it("V2 모든 룩·부위에서 제품 순서 = partOrder", () => {
    for (const look of LOOKS) {
      LOOK_PART_ORDER.forEach((p, i) => {
        expect(partCard(p, look, null).need).toBe(`지금 필요한 것: ${look.products[i]!.split(" · ").slice(1).join(" · ")}`);
      });
    }
  });

  it("V3 쉐딩: 얼굴형을 알면 얼굴형 멘트, 자리값(confidence 0)이면 멘트 없음", () => {
    expect(partCard("contour", LOOKS[0]!, round).rationale).toBe(CONTOUR_RATIONALE.round);
    expect(partCard("contour", LOOKS[0]!, pending).rationale).toBeNull();
    expect(partCard("contour", LOOKS[0]!, null).rationale).toBeNull();
    expect(partCard("contour", LOOKS[0]!, round).need).toBe("지금 필요한 것: 컨투어 파우더, 하이라이터, 사선 브러시");
  });

  it("V4 화면에 숫자가 없다 (F-05)", () => {
    for (const look of LOOKS) for (const p of PARTS) {
      const c = partCard(p, look, round);
      expect(`${c.title}${c.rationale ?? ""}`).not.toMatch(/\d/);
    }
  });
});

describe("cropSpec", () => {
  it("C1 부위 점이 전부 박스 안, 박스 비율 = 화면 비율", () => {
    for (const p of PARTS) for (const aspect of [3 / 4, 16 / 9]) {
      const r = cropSpec(p, LMS, aspect);
      expect(r.w / r.h).toBeCloseTo(aspect, 6);
      for (const i of PART_POINTS[p]) {
        const q = LMS[i]!;
        expect(q.x).toBeGreaterThanOrEqual(r.x);
        expect(q.x).toBeLessThanOrEqual(r.x + r.w);
        expect(q.y).toBeGreaterThanOrEqual(r.y);
        expect(q.y).toBeLessThanOrEqual(r.y + r.h);
      }
    }
  });

  it("C2 눈 부위: 두 눈꼬리 거리 × EYE_CROP_MARGIN (확대를 줄여 흔들림을 덜 보이게, #204 — 전에는 1.3)", () => {
    const span = LMS[LM.eyeB.outer]!.x - LMS[LM.eyeA.outer]!.x;
    expect(cropSpec("liner", LMS, 16 / 9).w).toBeCloseTo(span * EYE_CROP_MARGIN, 6);
  });

  it("C3 입술: 입술 폭의 2.5배 (확대 2~3배)", () => {
    const xs = LM.lipsOuter.map((i) => LMS[i]!.x);
    expect(cropSpec("lip", LMS, 3 / 4).w).toBeCloseTo((Math.max(...xs) - Math.min(...xs)) * 2.5, 6);
  });

  it("C4 두꺼운 입술은 세로로도 입술 높이 3배를 담는다", () => {
    const cy = 420;
    const thick = LMS.map((p, i) => ((LM.lipsOuter as readonly number[]).includes(i) ? { x: p.x, y: cy + (p.y - cy) * 4 } : p));
    const ys = LM.lipsOuter.map((i) => thick[i]!.y);
    const r = cropSpec("lip", thick, 16 / 9);
    expect(r.h).toBeGreaterThanOrEqual((Math.max(...ys) - Math.min(...ys)) * 3 - 1e-9);
  });
});

describe("coverView", () => {
  it("V1 가로 영상을 세로 칸에 꽉 채우면(object-fit: cover) 양옆이 잘린다 — 보이는 부분만", () => {
    // 1920×1080 영상을 3:4 칸에 → 세로 1080 을 다 쓰고 가로는 810 만 보인다
    expect(coverView(1920, 1080, 300, 400)).toEqual({ x: 555, y: 0, w: 810, h: 1080 });
  });
  it("V2 비율이 같으면 다 보인다", () => {
    expect(coverView(1280, 720, 640, 360)).toEqual({ x: 0, y: 0, w: 1280, h: 720 });
  });
  it("V3 칸 크기를 모르면(0) 전체", () => {
    expect(coverView(1280, 720, 0, 0)).toEqual({ x: 0, y: 0, w: 1280, h: 720 });
  });
});

describe("scaleLm", () => {
  it("S1 촬영 프레임 좌표를 다른 크기 그림 좌표로 — 가로·세로 배율을 따로", () => {
    expect(scaleLm([{ x: 100, y: 50 }], { w: 1000, h: 500 }, { w: 500, h: 500 })).toEqual([{ x: 50, y: 50 }]);
  });
});
