// 머리카락 분할기 감싸기 (screens/hair-segmenter) — 실제 모델은 브라우저에서만 돈다. 여기서는 가짜 분할기로
// "결과에서 머리카락 칸을 꺼낸다 · 모델은 한 번만 불러온다 · 실패하면 마스크 없이 계속" 을 본다.
import { describe, expect, it, vi } from "vitest";
import type { RgbaImage } from "@core/color";
import { createHairMasker, maskFromConfidence, type HairSegmenter } from "@screens/hair-segmenter";

const im: RgbaImage = { data: new Uint8ClampedArray(4 * 4 * 4), w: 4, h: 4 };
const fakeMask = (v: number, w = 2, h = 2) => ({ width: w, height: h, getAsFloat32Array: () => new Float32Array(w * h).fill(v) });

describe("머리카락 분할기", () => {
  it("S1 확률 마스크 목록에서 머리카락 칸(1번)을 꺼낸다 — 0번은 배경", () => {
    const m = maskFromConfidence([fakeMask(0.1), fakeMask(0.9)], 1)!;
    expect(m).toMatchObject({ w: 2, h: 2 });
    expect(Array.from(m.data)).toEqual([0.9, 0.9, 0.9, 0.9].map((v) => Math.fround(v)));
    expect(maskFromConfidence(undefined, 1)).toBeNull();
    expect(maskFromConfidence([], 1)).toBeNull();
  });

  it("S2 모델은 처음 한 번만 불러오고, 사진마다 마스크를 준다", async () => {
    const seg = { segment: vi.fn(() => ({ w: 2, h: 2, data: new Float32Array(4).fill(0.7) })) } satisfies HairSegmenter;
    const load = vi.fn(async () => seg);
    const masker = createHairMasker(load);
    const [a, b] = await Promise.all([masker(im), masker(im)]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(seg.segment).toHaveBeenCalledTimes(2);
    expect(a?.data[0]).toBeCloseTo(0.7);
    expect(b?.w).toBe(2);
  });

  it("S3 불러오기가 실패하면 마스크 없이(null) — 다시 시도하지 않고, 오류는 한 번만 알린다", async () => {
    const load = vi.fn(async () => { throw new Error("no model"); });
    const onError = vi.fn();
    const masker = createHairMasker(load, onError);
    expect(await masker(im)).toBeNull();
    expect(await masker(im)).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("S4 한 장 분할이 실패해도 던지지 않고 그 장만 null", async () => {
    const seg: HairSegmenter = { segment: () => { throw new Error("gl lost"); } };
    const onError = vi.fn();
    const masker = createHairMasker(async () => seg, onError);
    expect(await masker(im)).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
