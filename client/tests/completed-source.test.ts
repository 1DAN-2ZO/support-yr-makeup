// #182 화면 3 완성본 = 2-b AR 장면 (서버 완성본이 없어짐, #179). 사용자가 2-b 에서 본 그 얼굴 그대로
import { describe, expect, it } from "vitest";
import { completedSource } from "@core/completed-source";
import type { ArFrame } from "@core/ar-frame-store";
import type { Baseline } from "@core/types";

const blob = (s: string) => new Blob([s]);
const lm = (x: number) => Array.from({ length: 478 }, () => ({ x, y: x }));
const baseline: Baseline = {
  lm: lm(10), unit: { eye: 1, lip: 1, face: 1 }, foreheadL: 60, scleraLab: null,
  faceShape: { label: "oval", confidence: 0, method: "rule", version: "t" }, bareImage: blob("bare"), w: 1000, h: 800,
};
const ar: ArFrame = { lookId: "smoky", image: blob("ar"), lm: lm(50), w: 1280, h: 720 };

describe("completedSource", () => {
  it("C1 AR 장면이 있으면 그 장면 + 장면과 함께 저장된 얼굴 점 (맨얼굴과 구도가 다르다)", () => {
    const s = completedSource(ar, baseline);
    expect(s).toEqual({ from: "ar", image: ar.image, lm: ar.lm, w: 1280, h: 720 });
  });

  it("C2 AR 장면이 없으면(AR 이 안 켜짐 · 다른 화장 · 앱을 다시 켬) 쌩얼 + 맨얼굴 점", () => {
    expect(completedSource(null, baseline)).toEqual({ from: "bare", image: baseline.bareImage, lm: baseline.lm, w: 1000, h: 800 });
  });

  it("C3 둘 다 없으면 null — 화면은 '준비 중' 으로 두고 흐름은 안 막는다", () => {
    expect(completedSource(null, { ...baseline, bareImage: null })).toBeNull();
    expect(completedSource(null, null)).toBeNull();
  });

  it("C4 점 개수가 모자란 장면은 안 쓴다 (깨진 저장)", () => {
    expect(completedSource({ ...ar, lm: lm(1).slice(0, 10) }, baseline)?.from).toBe("bare");
  });
});
