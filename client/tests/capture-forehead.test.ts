// 촬영·실시간 이마 참조 — 앞머리 (2026-09-30 #175 리뷰): 새 모델 없이 볼보다 한참 어두운 이마 픽셀을 머리카락으로 빼고 중앙값
import { describe, expect, it } from "vitest";
import { FOREHEAD_POLY, FOREHEAD_SKIN, foreheadLab, foreheadSkin, pointInPoly } from "@core/color";
import { shotGate, SHOT_TEXT, type ShotMeasure } from "@core/flow";
import { LMS, image } from "./helpers/synth-face";
import type { Rgb } from "./helpers/synth-face";

const HAIR: Rgb = [28, 22, 20];
const poly = FOREHEAD_POLY.map((i) => LMS[i]!);
const ys = poly.map((p) => p.y);
const y0 = Math.min(...ys), y1 = Math.max(...ys);
/** 이마 다각형 위쪽 k 만큼을 머리카락으로 */
const bangs = (k: number) => (x: number, y: number) => (y < y0 + (y1 - y0) * k && pointInPoly(x, y, poly) ? HAIR : null);
const bare = foreheadLab(image(() => null), LMS)!;

describe("이마 참조 — 앞머리", () => {
  it("H1 앞머리가 이마의 60% 를 덮어도 밝기는 맨얼굴과 거의 같다 (중앙값만으로는 머리카락 값이 될 양)", () => {
    const r = foreheadSkin(image(bangs(0.6)), LMS)!;
    expect(r.skinFrac).toBeLessThan(0.6);
    expect(r.skinFrac).toBeGreaterThan(FOREHEAD_SKIN.minSkin);
    expect(Math.abs(r.lab.L - bare.L)).toBeLessThan(2);
  });

  it("H2 이마가 거의 다 가려지면 조명을 모른다 → null", () => {
    expect(foreheadLab(image(bangs(0.97)), LMS)).toBeNull();
  });

  it("H3 조명이 진짜로 어두워지면 그대로 잡힌다 (볼도 같이 어두워져 피부로 남는다)", () => {
    const dim = foreheadLab(image(() => null, 0.7), LMS)!;
    expect(bare.L - dim.L).toBeGreaterThan(8);
  });

  it("H4 촬영 게이트: 얼굴은 있는데 이마를 못 재면 '앞머리를 넘겨 주세요'", () => {
    const m: ShotMeasure = { faceDetected: true, yaw: 0, pitch: 0, closedA: false, closedB: false, foreheadHidden: true };
    const g = shotGate("front_open", m);
    expect(g).toMatchObject({ ok: false, firstFail: "visible", text: SHOT_TEXT.bangs });
  });
});
