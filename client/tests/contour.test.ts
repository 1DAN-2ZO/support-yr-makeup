// 쉐딩·하이라이트 자리 — POC(poc/full/lib/screen3-core.js contourOutline)의 얼굴형 규칙을 TS 로 옮긴 것
// 옮기면서 바꾼 것은 하나: 턱끝 밴드 길이를 사진 폭(× 0.06)이 아니라 얼굴 폭(× 0.15)으로 — 카메라 거리에 안 흔들리게.
import { describe, expect, it } from "vitest";
import { CHIN_HALF, contourOutline } from "@core/contour";
import type { FaceShapeLabel, Pt } from "@core/types";
import { contourOutline as pocContour } from "../../poc/full/lib/screen3-core.js";

const SHAPES: FaceShapeLabel[] = ["oval", "round", "square", "oblong", "heart"];

/** 씨앗 고정 난수로 478점 — 비교만 하므로 실제 얼굴일 필요는 없다(사람 얼굴 데이터를 저장소에 두지 않는다) */
function points(seed = 7): Pt[] {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  return Array.from({ length: 478 }, () => ({ x: 150 + rnd() * 300, y: 120 + rnd() * 400 }));
}

/** POC 는 0~1 좌표 + 사진 크기를 받는다. 턱끝 밴드가 같아지게 사진 폭 = 얼굴 폭 × CHIN_HALF / 0.06 */
function poc(lm: Pt[], shape: FaceShapeLabel): { shading: [number, number][][]; highlight: [number, number][][] } {
  const faceW = Math.hypot(lm[234]!.x - lm[454]!.x, lm[234]!.y - lm[454]!.y);
  const W = (faceW * CHIN_HALF) / 0.06;
  return pocContour(lm.map((p) => ({ x: p.x / W, y: p.y / W })), { w: W, h: W }, shape);
}

const same = (a: readonly (readonly Pt[])[], b: [number, number][][]) => {
  expect(a.length).toBe(b.length);
  a.forEach((band, i) => band.forEach((p, j) => {
    expect(p.x).toBeCloseTo(b[i]![j]![0], 6);
    expect(p.y).toBeCloseTo(b[i]![j]![1], 6);
  }));
};

describe("쉐딩·하이라이트 — POC 규칙과 같다", () => {
  for (const shape of SHAPES) {
    it(`${shape}: 쉐딩·하이라이트 밴드가 POC 와 같다 (T존 옵션 끔)`, () => {
      const lm = points();
      const mine = contourOutline(lm, shape, { tZone: "rule" });
      const ref = poc(lm, shape);
      same(mine.shading, ref.shading);
      same(mine.highlight, ref.highlight);
    });
  }
});

describe("쉐딩·하이라이트 — 개인화 (하이라이트 T존)", () => {
  it("T존을 켜면 T존 하이라이트가 없는 얼굴형(각진형)에 하나 더한다", () => {
    const lm = points();
    expect(contourOutline(lm, "square", { tZone: true }).highlight.length).toBe(poc(lm, "square").highlight.length + 1);
  });

  it("이미 콧대·T존 하이라이트가 있는 얼굴형(계란형·둥근형)은 그대로", () => {
    const lm = points();
    expect(contourOutline(lm, "oval", { tZone: true }).highlight.length).toBe(poc(lm, "oval").highlight.length);
    expect(contourOutline(lm, "round", { tZone: true }).highlight.length).toBe(poc(lm, "round").highlight.length);
  });

  it("T존을 끄면(번들거리는 피부) 콧대·T존 하이라이트를 뺀다", () => {
    const lm = points();
    expect(contourOutline(lm, "round", { tZone: false }).highlight.length).toBe(poc(lm, "round").highlight.length - 1);
    expect(contourOutline(lm, "oval", { tZone: false }).highlight.length).toBe(poc(lm, "oval").highlight.length - 1);
  });
});
