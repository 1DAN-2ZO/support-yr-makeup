// 확인받기 프레임 묶음 (2-2, #22) 검증
// ② 는 3~5장을 모아 장마다 랜드마크·손 여부·이마 L* 를 붙여 넘긴다. 평균·손 걸린 장 제외는 ③(#34) 몫.
import { describe, expect, it } from "vitest";
import { createBundleCollector } from "@core/capture-bundle";
import type { Pt } from "@core/types";

const face = (dx = 0): Pt[] => Array.from({ length: 478 }, (_, i) => ({ x: 100 + (i % 20) + dx, y: 100 + Math.floor(i / 20) }));
const frame = (t: number, over: Partial<{ lm: Pt[] | null; hand: boolean | null; fore: number | null; id: string }> = {}) => ({
  image: over.id ?? `f${t}`,
  lm: over.lm === undefined ? face() : over.lm,
  handOverlap: over.hand === undefined ? null : over.hand,
  foreheadL: over.fore === undefined ? 62 : over.fore,
  t,
});

describe("capture bundle", () => {
  it("B1 5장이 모이면 끝난다 — 순서 그대로, 네 배열 길이가 같다", () => {
    const c = createBundleCollector<string>();
    let s = c.push(frame(0));
    for (let i = 1; i < 5; i++) s = c.push(frame(i * 33));
    expect(s.status).toBe("done");
    if (s.status !== "done") return;
    expect(s.bundle.frames).toEqual(["f0", "f33", "f66", "f99", "f132"]);
    expect(s.bundle.pts).toHaveLength(5);
    expect(s.bundle.handOverlap).toHaveLength(5);
    expect(s.bundle.foreheadL).toHaveLength(5);
  });

  it("B2 5장 전에는 모으는 중이다", () => {
    const c = createBundleCollector<string>();
    expect(c.push(frame(0))).toEqual({ status: "collecting", n: 1 });
    expect(c.push(frame(33))).toEqual({ status: "collecting", n: 2 });
  });

  it("B3 얼굴을 못 찾은 장은 빼고 계속 모은다", () => {
    const c = createBundleCollector<string>();
    c.push(frame(0));
    expect(c.push(frame(33, { lm: null }))).toEqual({ status: "collecting", n: 1 });
  });

  it("B4 깨진 랜드마크(NaN)는 뺀다 — NaN 은 모든 비교를 통과해 버린다", () => {
    const bad = face();
    bad[33] = { x: Number.NaN, y: 1 };
    const c = createBundleCollector<string>();
    expect(c.push(frame(0, { lm: bad }))).toEqual({ status: "collecting", n: 0 });
  });

  it("B5 478점이 아닌 랜드마크는 뺀다", () => {
    const c = createBundleCollector<string>();
    expect(c.push(frame(0, { lm: face().slice(0, 468) }))).toEqual({ status: "collecting", n: 0 });
  });

  it("B6 이마 L* 를 못 잰 장은 뺀다 — ③ 이 조명 보정을 못 한다", () => {
    const c = createBundleCollector<string>();
    expect(c.push(frame(0, { fore: null }))).toEqual({ status: "collecting", n: 0 });
    expect(c.push(frame(33, { fore: Number.NaN }))).toEqual({ status: "collecting", n: 0 });
  });

  it("B7 손 걸린 장은 빼지 않고 표시만 한다 — 빼는 건 ③ 몫", () => {
    const c = createBundleCollector<string>();
    let s = c.push(frame(0, { hand: true }));
    for (let i = 1; i < 5; i++) s = c.push(frame(i * 33, { hand: i === 2 ? true : false }));
    expect(s.status).toBe("done");
    if (s.status !== "done") return;
    expect(s.bundle.handOverlap).toEqual([true, false, true, false, false]);
  });

  it("B8 0.5초가 지나면 3장 이상이면 그만큼으로 끝낸다", () => {
    const c = createBundleCollector<string>();
    c.push(frame(0));
    c.push(frame(100, { lm: null }));
    c.push(frame(200));
    c.push(frame(300, { lm: null }));
    c.push(frame(400));
    const s = c.push(frame(501, { lm: null }));
    expect(s.status).toBe("done");
    if (s.status !== "done") return;
    expect(s.bundle.frames).toEqual(["f0", "f200", "f400"]);
  });

  it("B9 0.5초가 지나도 3장이 안 되면 실패 — 얼굴 조건", () => {
    const c = createBundleCollector<string>();
    c.push(frame(0));
    c.push(frame(250, { lm: null }));
    expect(c.push(frame(501, { lm: null }))).toEqual({ status: "failed", reason: "face" });
  });

  it("B10 끝난 뒤에는 더 받지 않고 같은 결과를 돌려준다", () => {
    const c = createBundleCollector<string>();
    let s = c.push(frame(0));
    for (let i = 1; i < 5; i++) s = c.push(frame(i * 33));
    const again = c.push(frame(200, { id: "late" }));
    expect(again).toEqual(s);
  });

  it("B11 한계는 바꿀 수 있다", () => {
    const c = createBundleCollector<string>({ want: 3, min: 2, maxMs: 200 });
    c.push(frame(0));
    c.push(frame(33));
    expect(c.push(frame(66)).status).toBe("done");
  });
});
