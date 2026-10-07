import { describe, expect, it } from "vitest";
import type { PartMask } from "../src/core/makeup-extract";
import { FEEDBACK, guideFeedback } from "../src/core/guide-feedback";
import type { PartGuide } from "../src/core/part-guide";
import type { Pt } from "../src/core/types";

const W = 200, H = 120, TOL = 4;
/** 가이드: 가로 40~160 · 세로 30~90 직사각형 */
const RECT: Pt[] = [{ x: 40, y: 30 }, { x: 160, y: 30 }, { x: 160, y: 90 }, { x: 40, y: 90 }];
const guide = (part: PartGuide["part"], polys: Pt[][] = [RECT], side: PartGuide["side"] = null): PartGuide => ({ part, side, polys, count: 1, from: "region" });
function mask(inside: (x: number, y: number) => boolean): Uint8Array {
  const m = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inside(x, y)) m[y * W + x] = 1;
  return m;
}
const painted = (part: PartMask["part"], m: Uint8Array, side: PartMask["side"] = null): PartMask => ({ part, side, mask: m, count: m.reduce((s, v) => s + v, 0), peakDeltaE: 20 });
const inRect = (x0: number, y0: number, x1: number, y1: number) => (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const sum = (m: Uint8Array) => m.reduce((s, v) => s + v, 0);
/** 정답사진에서 뗀 부위 — 기본은 가이드 직사각형을 다 칠한 정답 */
const FULL = [painted("lip", mask(inRect(40, 30, 160, 90)))];

describe("가이드 대 시도 — 덜 그림 · 넘침 (새 흐름 POC, 점수 없음)", () => {
  it("F9 정답사진이 가이드 일부만 칠했으면(원래 진한 눈썹 털은 안 바뀐다) 시도사진이 정답과 같을 때 덜 그림이 아니다 (실사진)", () => {
    // 정답: 가이드 왼쪽 2/3 만 · 띄엄띄엄(털 사이) — 가이드 테두리 안을 다 칠하라고 하면 정답 그대로여도 덜 그림이었다
    const answer = mask((x, y) => inRect(40, 30, 120, 90)(x, y) && (x + y) % 3 !== 0);
    const [f] = guideFeedback([guide("brow")], [painted("brow", answer)], [painted("brow", answer)], W, H, TOL);
    expect(f!.notes).toEqual([FEEDBACK.say.ok]);
    expect(sum(f!.missed)).toBe(0);
    // 정답이 칠한 자리를 시도가 안 칠하면 그건 덜 그림
    const [g] = guideFeedback([guide("brow")], [painted("brow", answer)], [painted("brow", mask(inRect(40, 30, 70, 90)))], W, H, TOL);
    expect(g!.notes).toEqual([FEEDBACK.say.miss]);
    for (let i = 0; i < W * H; i++) if (g!.missed[i]) expect(i % W, "덜 그린 곳 = 정답이 칠한 자리 안").toBeLessThanOrEqual(120 + TOL);
  });

  it("F1 가이드를 그대로 칠하면 '가이드대로' — 덜 그림 · 넘침 없음", () => {
    const [f] = guideFeedback([guide("lip")], FULL, [painted("lip", mask(inRect(40, 30, 160, 90)))], W, H, TOL);
    expect(f!.part).toBe("lip");
    expect(f!.notes).toEqual([FEEDBACK.say.ok]);
    expect(sum(f!.missed)).toBe(0);
    expect(sum(f!.over)).toBe(0);
  });

  it("F10 가는 띠(라이너)는 테두리 폭만큼 깎으면 없어진다 — 그래도 안 칠하면 '안 칠함', 반만 칠하면 덜 그림 (실사진: 맨얼굴인데 라이너 '가이드대로')", () => {
    const band: Pt[] = [{ x: 40, y: 58 }, { x: 160, y: 58 }, { x: 160, y: 62 }, { x: 40, y: 62 }];
    const ans = [painted("liner", mask(inRect(40, 58, 160, 62)))];
    expect(guideFeedback([guide("liner", [band])], ans, [], W, H, TOL)[0]!.notes).toEqual([FEEDBACK.say.none]);
    expect(guideFeedback([guide("liner", [band])], ans, ans, W, H, TOL)[0]!.notes).toEqual([FEEDBACK.say.ok]);
    expect(guideFeedback([guide("liner", [band])], ans, [painted("liner", mask(inRect(40, 58, 100, 62)))], W, H, TOL)[0]!.notes).toEqual([FEEDBACK.say.miss]);
  });

  it("F2 왼쪽 반만 칠하면 덜 그림 — 덜 그린 곳은 오른쪽 반 안", () => {
    const [f] = guideFeedback([guide("lip")], FULL, [painted("lip", mask(inRect(40, 30, 100, 90)))], W, H, TOL);
    expect(f!.notes).toEqual([FEEDBACK.say.miss]);
    expect(f!.missRatio).toBeGreaterThan(FEEDBACK.miss);
    for (let i = 0; i < W * H; i++) if (f!.missed[i]) expect(i % W, "덜 그린 곳 x").toBeGreaterThan(100);
    expect(sum(f!.over)).toBe(0);
  });

  it("F3 가이드 밖으로 크게 나가면 넘침 — 테두리에서 TOL 안쪽으로 살짝 나간 건 안 센다", () => {
    const [f] = guideFeedback([guide("lip")], FULL, [painted("lip", mask(inRect(40, 30, 190, 90)))], W, H, TOL);
    expect(f!.notes).toEqual([FEEDBACK.say.over]);
    expect(f!.overRatio).toBeGreaterThan(FEEDBACK.over);
    for (let i = 0; i < W * H; i++) if (f!.over[i]) expect(i % W, "넘친 곳 x").toBeGreaterThanOrEqual(160 + TOL);
    const [g] = guideFeedback([guide("lip")], FULL, [painted("lip", mask(inRect(37, 27, 163, 93)))], W, H, TOL);
    expect(g!.notes).toEqual([FEEDBACK.say.ok]);
    expect(sum(g!.over)).toBe(0);
  });

  it("F4 테두리 안쪽 TOL 만큼 덜 칠한 건 '가이드대로' (테두리를 딱 맞출 순 없다)", () => {
    const [f] = guideFeedback([guide("lip")], FULL, [painted("lip", mask(inRect(43, 33, 157, 87)))], W, H, TOL);
    expect(f!.notes).toEqual([FEEDBACK.say.ok]);
    expect(sum(f!.missed)).toBe(0);
  });

  it("F5 거의 안 칠했으면 '안 칠한 것 같아요' 하나만", () => {
    const [f] = guideFeedback([guide("lip")], FULL, [], W, H, TOL);
    expect(f!.notes).toEqual([FEEDBACK.say.none]);
  });

  it("F6 덜 그림 · 넘침이 같이 있으면 둘 다", () => {
    const [f] = guideFeedback([guide("lip")], FULL, [painted("lip", mask(inRect(100, 30, 195, 90)))], W, H, TOL);
    expect(f!.notes).toEqual([FEEDBACK.say.miss, FEEDBACK.say.over]);
  });

  it("F7 아래 섀도는 섀도 화면에 합치고, 쉐딩 · 하이라이트는 안 본다 · 화면 순서는 눈썹 → 라이너 → 섀도 → 입술 → 블러셔", () => {
    const top: Pt[] = [{ x: 40, y: 10 }, { x: 160, y: 10 }, { x: 160, y: 50 }, { x: 40, y: 50 }];
    const under: Pt[] = [{ x: 40, y: 70 }, { x: 160, y: 70 }, { x: 160, y: 110 }, { x: 40, y: 110 }];
    const r = guideFeedback(
      [guide("cheek"), guide("lip"), guide("shadow", [top], "R"), guide("underShadow", [under], "R"), guide("brow")],
      [painted("shadow", mask(inRect(40, 10, 160, 50)), "R"), painted("underShadow", mask(inRect(40, 70, 160, 110)), "R")],
      [painted("shadow", mask(inRect(40, 10, 160, 50)), "R"), painted("contour", mask(() => true))],
      W, H, TOL,
    );
    expect(r.map((f) => f.part)).toEqual(["brow", "shadow", "lip", "cheek"]);
    const sh = r.find((f) => f.part === "shadow")!;
    expect(sh.notes, "위 섀도만 칠하고 아래는 안 칠함").toEqual([FEEDBACK.say.miss]);
    for (let i = 0; i < W * H; i++) if (sh.missed[i]) expect(Math.floor(i / W), "덜 그린 곳은 아래 섀도 자리").toBeGreaterThanOrEqual(70);
  });

  it("F8 블러셔는 비교하지 않고 '확인만' (볼터치는 채점에서 뺐다, 2026-10-06)", () => {
    const [f] = guideFeedback([guide("cheek")], [], [painted("cheek", mask(inRect(0, 0, 10, 10)))], W, H, TOL);
    expect(f!.part).toBe("cheek");
    expect(f!.notes).toEqual([FEEDBACK.say.checkOnly]);
    expect(sum(f!.missed) + sum(f!.over)).toBe(0);
  });
});
