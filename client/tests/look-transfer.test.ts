// 룩 옮기기 1단계 — 참조 사진을 내 얼굴 모양에 맞춰 포개기 (core/look-transfer.ts)
import { describe, expect, it } from "vitest";
import type { RgbaImage } from "@core/color";
import type { Triangle } from "@core/face-mesh";
import { LM } from "@core/landmarks";
import { checkPhoto, landmarkShift, warpMask, warpToFace } from "@core/look-transfer";
import type { Pt } from "@core/types";
import { faceLandmarks } from "./helpers/synth-face";

const W = 40, H = 40;
/** 픽셀마다 다른 색 — 어느 자리에서 읽어 왔는지 값으로 알 수 있다 */
function gradient(): RgbaImage {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data.set([x * 4, y * 4, 100, 255], (y * W + x) * 4);
  return { data, w: W, h: H };
}
const SQUARE: Pt[] = [{ x: 10, y: 10 }, { x: 30, y: 10 }, { x: 30, y: 30 }, { x: 10, y: 30 }];
const TRIS: Triangle[] = [[0, 1, 2], [0, 2, 3]];
const px = (im: { data: Uint8ClampedArray; w: number }, x: number, y: number): number[] => [...im.data.slice((y * im.w + x) * 4, (y * im.w + x) * 4 + 4)];

describe("warpToFace", () => {
  it("같은 모양이면 그물 안은 원본 그대로, 그물 밖은 투명", () => {
    const out = warpToFace(gradient(), SQUARE, SQUARE, W, H, TRIS);
    expect(px(out, 20, 15)).toEqual([80, 60, 100, 255]);
    expect(px(out, 12, 28)).toEqual([48, 112, 100, 255]);
    expect(px(out, 5, 5)[3]).toBe(0);
    expect(px(out, 35, 20)[3]).toBe(0);
  });

  it("두 삼각형이 만나는 대각선에 구멍이 없다", () => {
    const out = warpToFace(gradient(), SQUARE, SQUARE, W, H, TRIS);
    for (let k = 11; k < 30; k++) expect(px(out, k, k)[3]).toBe(255);
  });

  it("내 얼굴이 오른쪽으로 5px 옮겨 있으면 참조의 같은 살갗이 5px 옮겨 온다", () => {
    const moved = SQUARE.map((p) => ({ x: p.x + 5, y: p.y }));
    const out = warpToFace(gradient(), SQUARE, moved, W, H, TRIS);
    expect(px(out, 25, 15)).toEqual([80, 60, 100, 255]);
  });

  it("내 얼굴이 두 배로 넓으면 참조가 가로로 늘어난다", () => {
    const wide = [{ x: 0, y: 10 }, { x: 40, y: 10 }, { x: 40, y: 30 }, { x: 0, y: 30 }];
    const out = warpToFace(gradient(), SQUARE, wide, W, H, TRIS);
    // dst x 20 = 폭의 가운데 → src x 20
    expect(px(out, 20, 20)).toEqual([80, 80, 100, 255]);
    // dst x 10 = 폭의 1/4 → src x 15
    expect(px(out, 10, 20)).toEqual([60, 80, 100, 255]);
  });
});

describe("warpMask", () => {
  it("확률 지도를 얼굴과 같이 옮긴다 — 지도 크기가 사진의 절반이어도", () => {
    // 20×20 지도: 왼쪽 절반이 1. 사진(40×40) 기준으로는 x < 20 이 1
    const mask = { w: 20, h: 20, data: Float32Array.from({ length: 400 }, (_, i) => (i % 20 < 10 ? 1 : 0)) };
    const moved = SQUARE.map((p) => ({ x: p.x + 5, y: p.y }));
    const out = warpMask(mask, W, H, SQUARE, moved, W, H, TRIS);
    expect(out[20 * W + 18]).toBeCloseTo(1, 1);   // 사진 x 13 에서 옴 (1)
    expect(out[20 * W + 32]).toBeCloseTo(0, 1);   // 사진 x 27 에서 옴 (0)
    expect(out[5 * W + 5]).toBe(0);               // 그물 밖
  });
});

describe("landmarkShift", () => {
  const base = faceLandmarks();   // 눈 폭 90px

  it("같은 얼굴이면 전부 0", () => {
    const s = landmarkShift(base, base);
    expect(s.rigid).toBe(0);
    expect(s.brow.max).toBe(0);
    expect(s.lip.mean).toBe(0);
  });

  it("얼굴 전체가 9px 밀리면 전체 밀림 10%, 부위 어긋남은 0 — 모양은 그대로", () => {
    const s = landmarkShift(base, base.map((p) => ({ x: p.x + 9, y: p.y })));
    expect(s.rigid).toBeCloseTo(0.1, 5);
    expect(s.brow.max).toBeCloseTo(0, 5);
    expect(s.eye.max).toBeCloseTo(0, 5);
  });

  it("눈썹만 4.5px 올라가면 눈썹 어긋남 5%, 전체 밀림과 입술은 0", () => {
    const moved = base.map((p) => ({ ...p }));
    for (const i of [...LM.browA.upper, ...LM.browA.lower, ...LM.browB.upper, ...LM.browB.lower]) moved[i] = { x: base[i]!.x, y: base[i]!.y - 4.5 };
    const s = landmarkShift(base, moved);
    expect(s.rigid).toBe(0);
    expect(s.brow.mean).toBeCloseTo(0.05, 5);
    expect(s.lip.max).toBe(0);
  });
});

describe("checkPhoto", () => {
  it("정면 합성 얼굴: 좌우 눈 폭 같고 기울기 0", () => {
    const c = checkPhoto(faceLandmarks());
    expect(c.eyeWidthPx).toBeCloseTo(90, 5);
    expect(c.eyeWidthRatio).toBeCloseTo(1, 5);
    expect(c.rollDeg).toBeCloseTo(0, 5);
  });
});
