// 채점 표본에서 머리카락 빼기 (docs/research/hair-skin-2026-09-29 보고서 3번)
// 앞머리·옆머리가 눈썹·볼을 덮으면 어두운 머리카락이 "화장했다" 로 잡힌다.
// 머리카락 마스크(0~1, MediaPipe Hair Segmentation 같은 것)를 SampleFrame 에 주면 그 칸·픽셀을 비교에서 빼고,
// 너무 많이 가렸으면 확인만(가림, 계약 이름 "occluded" — #155).
import { describe, expect, it } from "vitest";
import { LM } from "@core/landmarks";
import { frameOf, sampleBrow, type HairMask } from "@core/sampling";
import { scoreBundle, scorePart } from "@core/score-part";
import { CHECK_REASON_TEXT, PARAMS, decide } from "@core/score";
import type { PartId } from "@core/types";
import { BARE, BLUSH, LMS, P, W, H, guide, image, inRegion } from "./helpers/synth-face";
import type { Paint, Rgb } from "./helpers/synth-face";

const HAIR_RGB: Rgb = [28, 22, 20];

/** 오른쪽(이미지 왼쪽) 눈썹 둘레를 넉넉히 덮는 앞머리 */
const browR = [...LM.browA.upper, ...LM.browA.lower].map(P);
const bx0 = Math.min(...browR.map((p) => p.x)) - 12, bx1 = Math.max(...browR.map((p) => p.x)) + 12;
const by0 = Math.min(...browR.map((p) => p.y)) - 20, by1 = Math.max(...browR.map((p) => p.y)) + 12;
const bangsOverBrow = (x: number, y: number): boolean => x >= bx0 && x <= bx1 && y >= by0 && y <= by1;

/**
 * 오른쪽 볼터치 영역 바깥쪽 k 만큼에 걸친 머리카락 가닥 (영역 안만).
 * 옆머리가 영역과 둘레 맨살 띠를 같이 덮으면 둘 다 어두워져 서로 상쇄된다 — 문제가 되는 건 영역에만 걸친 가닥
 */
function sideHair(k: number): (x: number, y: number) => boolean {
  const inR = inRegion("cheek", "R");
  let x0 = Infinity, x1 = -Infinity;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inR(x, y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  const cut = x0 + (x1 - x0) * k;
  return (x, y) => x <= cut && inR(x, y);
}

const paintOf = (hair: (x: number, y: number) => boolean, under: Paint = () => null): Paint => (x, y) => (hair(x, y) ? HAIR_RGB : under(x, y));

/** 사진보다 작은 마스크 (실제 분할 모델도 256·512 로 준다) */
function maskOf(hair: (x: number, y: number) => boolean, size = 150): HairMask {
  const data = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) data[y * size + x] = hair(((x + 0.5) * W) / size, ((y + 0.5) * H) / size) ? 1 : 0;
  return { w: size, h: size, data };
}

const run = (partId: PartId, cur: ReturnType<typeof frameOf>, base = BARE) => {
  const { result, ctx } = scorePart(partId, base, cur, guide);
  return { result, ctx, d: decide(partId, result, ctx) };
};

describe("채점 — 머리카락 마스크", () => {
  it("H1 (지금의 문제) 마스크가 없으면 눈썹을 덮은 앞머리를 '그렸다' 로 잡는다", () => {
    const { result } = run("brow", frameOf(image(paintOf(bangsOverBrow)), LMS));
    expect(result.present).toBe(true);
  });

  it("H2 마스크가 있으면 가린 칸을 빼고, 많이 가렸으면 확인만(가림)", () => {
    const cur = frameOf(image(paintOf(bangsOverBrow)), LMS, maskOf(bangsOverBrow));
    const { ctx, d } = run("brow", cur);
    expect(ctx.hairFrac).toBeGreaterThan(PARAMS.hairMax);
    expect(d).toMatchObject({ status: "check_only", reason: "occluded" });
  });

  it("H3 눈썹 격자에 가린 칸 표시 — 덮은 쪽(R) 안쪽 칸만", () => {
    const g = sampleBrow(frameOf(image(paintOf(bangsOverBrow)), LMS, maskOf(bangsOverBrow)));
    const at = (side: "R" | "L") => g.meta.side.map((s, i) => (s === side && g.meta.inside[i] ? g.meta.hidden?.[i] : undefined)).filter((v) => v !== undefined);
    expect(at("R").length).toBeGreaterThan(0);
    expect(at("R").every(Boolean)).toBe(true);
    expect(at("L").length).toBeGreaterThan(0);
    expect(at("L").some(Boolean)).toBe(false);
  });

  it("H4 볼 영역 30% 를 옆머리가 덮고 화장은 안 했으면 — 마스크 없이는 '화장함', 있으면 화장 없음(faint)", () => {
    const hair = sideHair(0.3);
    expect(run("cheek", frameOf(image(paintOf(hair)), LMS)).result.present).toBe(true);
    const { ctx, d } = run("cheek", frameOf(image(paintOf(hair)), LMS, maskOf(hair)));
    expect(ctx.hairFrac).toBeGreaterThan(0.15);
    expect(ctx.hairFrac).toBeLessThan(PARAMS.hairMax);
    expect(d).toMatchObject({ status: "check_only", reason: "faint" });
  });

  it("H5 맨얼굴에도 같은 옆머리가 있고, 안 가린 쪽에 볼터치를 했으면 그대로 잡는다", () => {
    const hair = sideHair(0.3), blush = (x: number, y: number) => (inRegion("cheek", "R")(x, y) || inRegion("cheek", "L")(x, y) ? BLUSH : null);
    const base = frameOf(image(paintOf(hair)), LMS, maskOf(hair));
    const cur = frameOf(image(paintOf(hair, blush)), LMS, maskOf(hair));
    expect(run("cheek", cur, base).result.present).toBe(true);
  });

  it("H6 마스크가 없으면 전과 똑같다 (가린 칸 표시 없음, hairFrac 없음)", () => {
    expect(sampleBrow(BARE).meta.hidden).toBeUndefined();
    expect(run("brow", BARE).ctx.hairFrac).toBeUndefined();
  });

  it("H7 가림 안내 문구가 손만 말하지 않는다", () => {
    expect(CHECK_REASON_TEXT.occluded).toContain("머리카락");
  });
});

describe("묶음 채점 — 사진마다 마스크", () => {
  it("H8 확인받기 여러 장에 각자 마스크를 주면 가린 칸을 빼고 확인만(가림)", () => {
    const cur = image(paintOf(bangsOverBrow)), m = maskOf(bangsOverBrow);
    const frames = [0, 1, 2].map(() => ({ im: cur, pts: LMS, occluded: null, hair: m }));
    expect(scoreBundle("brow", BARE, frames, guide).outcome).toMatchObject({ decision: "check_only", checkReason: "occluded" });
    // 마스크 없이는 앞머리를 그린 것으로 본다
    const bare = [0, 1, 2].map(() => ({ im: cur, pts: LMS, occluded: null }));
    expect(scoreBundle("brow", BARE, bare, guide).outcome.checkReason).not.toBe("occluded");
  });
});
