// #204 눈 부위 확대가 폰에서 깨짐 — 자동 회전이 꺼진 채 폰을 가로로 돌리면 영상 속 얼굴만 90° 눕는다.
// 확대 폭을 두 눈의 x 차이로 잡아서 누운 얼굴에선 폭이 0 → 엄청나게 확대(한쪽 눈만 · 피부만). 폭을 두 눈 사이 "거리"로
import { describe, expect, it } from "vitest";
import { EYE_CROP_MARGIN, ROLL_MAX, cropSpec, faceRoll } from "@core/crop";
import { LM, PART_POINTS } from "@core/landmarks";
import type { PartId, Pt } from "@core/types";
import { LMS } from "./helpers/synth-face";

const rot = (lm: readonly Pt[], deg: number, c: Pt = { x: 300, y: 300 }): Pt[] => {
  const t = (deg * Math.PI) / 180, co = Math.cos(t), si = Math.sin(t);
  return lm.map((p) => ({ x: c.x + (p.x - c.x) * co - (p.y - c.y) * si, y: c.y + (p.x - c.x) * si + (p.y - c.y) * co }));
};
const eyeDist = (lm: readonly Pt[]) => Math.hypot(lm[LM.eyeB.outer]!.x - lm[LM.eyeA.outer]!.x, lm[LM.eyeB.outer]!.y - lm[LM.eyeA.outer]!.y);
const inside = (r: { x: number; y: number; w: number; h: number }, p: Pt) => p.x >= r.x - 1e-6 && p.x <= r.x + r.w + 1e-6 && p.y >= r.y - 1e-6 && p.y <= r.y + r.h + 1e-6;
const EYE_PARTS: PartId[] = ["brow", "liner", "shadow"];

describe("눈 부위 확대 창 (#204)", () => {
  it("C1 누운 얼굴(90°)에서도 창이 작아지지 않고 눈을 다 담는다 — 지금은 5배쯤 작아져 한쪽 눈만·피부만 보였다", () => {
    // (⑥ 제안은 "크기가 같다" 였지만, 누운 얼굴은 두 눈이 위아래로 서서 같은 크기면 눈이 잘린다 → "작아지지 않는다 + 다 담는다")
    for (const p of EYE_PARTS) {
      const up = cropSpec(p, LMS, 16 / 9), lm = rot(LMS, 90), lying = cropSpec(p, lm, 16 / 9);
      expect(lying.w).toBeGreaterThanOrEqual(up.w - 1e-6);
      for (const i of PART_POINTS[p]) expect(inside(lying, lm[i]!)).toBe(true);
    }
  });

  it("C3 기운 얼굴(30°)에서도 · 가로로 돌리는 도중의 세로 칸에서도 부위 점을 다 담는다 (확인받기는 가로에서만 — 게이트)", () => {
    for (const p of EYE_PARTS) for (const aspect of [16 / 9, 3 / 4]) for (const deg of [0, 30, -30]) {
      const lm = rot(LMS, deg), r = cropSpec(p, lm, aspect);
      expect(r.w / r.h).toBeCloseTo(aspect, 6);
      for (const i of PART_POINTS[p]) expect(inside(r, lm[i]!)).toBe(true);
    }
  });

  it("C4 눈썹 창은 두 눈썹의 모든 점(앞머리~꼬리) + 넘겨받은 표준 눈썹 꼬리까지 — 한쪽만 확대하지 않는다", () => {
    const brows = [...LM.browA.upper, ...LM.browA.lower, ...LM.browB.upper, ...LM.browB.lower];
    for (const deg of [0, 30]) {
      const lm = rot(LMS, deg);
      const r = cropSpec("brow", lm, 16 / 9);
      for (const i of brows) expect(inside(r, lm[i]!)).toBe(true);
    }
    const tail: Pt = { x: 20, y: 205 };   // 눈썹 바깥 끝(160)보다 훨씬 밖
    expect(inside(cropSpec("brow", LMS, 16 / 9), tail)).toBe(false);
    expect(inside(cropSpec("brow", LMS, 16 / 9, [tail]), tail)).toBe(true);
  });

  it("C6 입술·볼·쉐딩도 넘겨받은 테두리 점이 밖이면 비율을 지킨 채 넓혀 담는다 (오버라인 입술선 등)", () => {
    for (const p of ["lip", "cheek", "contour"] as const) for (const aspect of [3 / 4, 16 / 9]) {
      const far: Pt = { x: 590, y: 590 };
      const r = cropSpec(p, LMS, aspect, [far]);
      expect(inside(r, far)).toBe(true);
      expect(r.w / r.h).toBeCloseTo(aspect, 6);
    }
  });

  it("C5 확대를 줄인다 — 창 폭은 두 눈꼬리 거리의 EYE_CROP_MARGIN 배 이상 (흔들림이 배율만큼 커 보여서)", () => {
    expect(EYE_CROP_MARGIN).toBeGreaterThanOrEqual(1.6);
    for (const p of EYE_PARTS) expect(cropSpec(p, LMS, 16 / 9).w).toBeGreaterThanOrEqual(eyeDist(LMS) * EYE_CROP_MARGIN - 1e-6);
  });
});

describe("faceRoll (#204 C2)", () => {
  it("R1 얼굴 기울기(도) — 두 눈꼬리 선 기준, 크기만", () => {
    expect(faceRoll(LMS)).toBeCloseTo(0, 6);
    expect(faceRoll(rot(LMS, 30))).toBeCloseTo(30, 6);
    expect(faceRoll(rot(LMS, -90))).toBeCloseTo(90, 6);
    expect(ROLL_MAX).toBe(45);
  });
});
