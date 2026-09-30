// 촬영·실시간 이마 참조 — 앞머리 (2026-09-30 #175 리뷰): 새 모델 없이 볼보다 한참 어두운 이마 픽셀을 머리카락으로 빼고 중앙값
import { describe, expect, it } from "vitest";
import { FOREHEAD_POLY, FOREHEAD_SKIN, foreheadLab, foreheadRawLab, foreheadSkin, pointInPoly, type Lab, type RgbaImage } from "@core/color";
import { foreheadStep, startForeheadTrack } from "@core/occlusion";
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

describe("가림 판정은 머리카락을 빼지 않은 이마 평균으로 (#212 리뷰)", () => {
  const HAND: Rgb = [90, 62, 52];   // 그림자 진 손 — 볼보다 한참 어둡다 (그래서 피부 필터가 머리카락처럼 뺀다)
  /** 이마 다각형 아래쪽 절반을 손으로 */
  const handHalf = (x: number, y: number) => (y > y0 + (y1 - y0) * 0.5 && pointInPoly(x, y, poly) ? HAND : null);
  /** 프레임을 33ms 간격으로 흘려 가림 여부를 모은다. ref = 이마 값을 뽑는 함수 */
  const run = (frames: readonly RgbaImage[], ref: (im: RgbaImage) => Lab | null): boolean[] => {
    let tr = startForeheadTrack();
    return frames.map((im, i) => {
      const lab = ref(im);
      if (!lab) return false;
      const r = foreheadStep(tr, i * 33, lab, { yaw: 0, pitch: 0 });
      tr = r.track;
      return r.occluded;
    });
  };
  const bareIm = image(() => null), handIm = image(handHalf);
  const seq = [...Array(15).fill(bareIm), ...Array(15).fill(handIm)] as RgbaImage[];

  it("O1 볼보다 어두운 손이 이마 절반을 가리면 가림으로 잡힌다 (전체 평균)", () => {
    expect(run(seq, (im) => foreheadRawLab(im, LMS)).slice(17).every(Boolean)).toBe(true);
  });

  it("O1' 피부만 남긴 값으로 판정하면 같은 손을 못 잡는다 — 그래서 가림에는 쓰지 않는다", () => {
    expect(run(seq, (im) => foreheadLab(im, LMS)).some(Boolean)).toBe(false);
  });

  it("O2 가만히 있는 앞머리는 가림으로 안 잡힌다", () => {
    const still = Array(30).fill(image(bangs(0.6))) as RgbaImage[];
    expect(run(still, (im) => foreheadRawLab(im, LMS)).some(Boolean)).toBe(false);
  });
});
