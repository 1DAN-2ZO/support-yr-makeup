// 화면 4 개발용 ?gate 표시 — 폰 시험에서 "안 움직였는데 흔들린다고 안 넘어감" 을 숫자로 보려고 (2026-09-30)
import { describe, expect, it } from "vitest";
import { gateReadout, recentStats } from "@core/gate-readout";
import { LIVE_LIMITS, type LiveMeasure } from "@core/gate";
import type { GateResult } from "@core/types";

const m: LiveMeasure = {
  faceDetected: true, roll: 2.4, yaw: 3.26, pitch: -1.04, poseDiff: { yaw: 1.5, pitch: -2.25 }, exprDiff: 0.12,
  partVisible: true, occluded: false, sharpness: 131.6, foreheadL: 58.2, baselineL: 62, stableCount: 0,
};
const fail: GateResult = { ok: false, firstFail: "sharp", text: "흔들려요. 잠시 멈춰 주세요", stableCount: 0 };

describe("gateReadout", () => {
  it("D1 선명 값 / 기준 · 최근 최소·중앙이 첫 줄 — 기준 근처를 오락가락하는지 본다", () => {
    const t = gateReadout(m, fail, LIVE_LIMITS, { min: 95.2, median: 142.7, n: 90 });
    const first = t.split("\n")[0]!;
    expect(first).toContain(`선명 132/${LIVE_LIMITS.sharpMin}`);
    expect(first).toContain("최근 최소 95");
    expect(first).toContain("중앙 143");
  });

  it("D2 막힌 조건 · 문구 · 안정 프레임 수", () => {
    const t = gateReadout(m, fail, LIVE_LIMITS, null);
    expect(t).toContain("막힘 sharp");
    expect(t).toContain("흔들려요");
    expect(t).toContain(`안정 0/${LIVE_LIMITS.stableFrames}`);
    expect(gateReadout({ ...m, stableCount: 5 }, { ok: true, firstFail: null, text: "확인받을 준비 됨", stableCount: 5 }, LIVE_LIMITS, null)).toContain("통과");
  });

  it("D3 나머지 값: 밝기 차 · 각도 · 기준 각도 차 · 기울기 · 표정 차 · 가림 (없는 값은 -)", () => {
    const t = gateReadout(m, fail, LIVE_LIMITS, null);
    expect(t).toContain(`밝기차 -3.8/${LIVE_LIMITS.brightTol}`);
    expect(t).toContain("각도 y3.3 p-1.0");
    expect(t).toContain(`차 y1.5/${LIVE_LIMITS.dYaw} p-2.3/${LIVE_LIMITS.dPitch}`);
    expect(t).toContain("기울기 2.4");
    expect(t).toContain(`표정 0.12/${LIVE_LIMITS.exprTol}`);
    expect(t).toContain("가림 아니오");
    const bare = gateReadout({ faceDetected: true, yaw: 0, pitch: 0 }, fail, LIVE_LIMITS, null);
    expect(bare).toContain("선명 -/");
    expect(bare).toContain("표정 -/");
  });
});

describe("recentStats", () => {
  it("S1 최근 n 개의 최소 · 중앙 (오래된 것부터 버림)", () => {
    const r = recentStats(3);
    expect(r.stats()).toBeNull();
    for (const v of [500, 10, 20, 30]) r.push(v);   // 500 은 밀려남
    expect(r.stats()).toEqual({ min: 10, median: 20, n: 3 });
  });
});
