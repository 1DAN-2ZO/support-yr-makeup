// 화면 5 시도사진 (2026-10-06 새 흐름, ⑥) — 화장을 다 한 뒤 정면 눈 뜬 장 · 감은 장 두 장만.
// 판정 · 장 순서는 화면 1 과 같은 규칙(① capture-run · shotGate)을 쓴다
import { describe, expect, it } from "vitest";
import { ATTEMPT_BURST, ATTEMPT_SHOTS, attemptBurstStep, startAttemptBurst, startAttemptRun } from "@core/attempt";
import type { ShotMeasure } from "@core/flow";

describe("시도사진 장 순서", () => {
  it("AR1 정면 눈 뜬 장 하나뿐 — 눈 감은 장은 뺐다 (#386: 찍기만 하고 쓰는 곳이 없었다)", () => {
    expect(ATTEMPT_SHOTS).toEqual(["front_open"]);
    expect(startAttemptRun({}, 0).shot).toBe("front_open");
    expect(startAttemptRun({ front_open: {} }, 0).shot).toBeNull();
  });

  it("AR2 눈 뜬 장은 화면 1 기준 장처럼 카메라가 자리 잡기를 기다린다", () => {
    expect(startAttemptRun({}, 0).settle).not.toBeNull();
  });

  const OK: ShotMeasure = { faceDetected: true, yaw: 0, pitch: 0, closedA: false, closedB: false, faceRatio: 0.5, faceInset: 0.1, eyeWidthPx: 120, sharpness: 400, foreheadL: 62 };

  it("AR3 눈 뜬 장은 다섯 장 묶음 — 첫 장(셔터)이 이미 한 장", () => {
    expect(ATTEMPT_BURST.count).toEqual({ front_open: 5 });
    let b = startAttemptBurst("front_open", 0);
    expect(b.done).toBe(false);
    let takes = 0;
    for (let t = 33; t < 2000 && !b.done; t += 33) {
      const r = attemptBurstStep(b, OK, t);
      b = r.state;
      if (r.take) takes++;
    }
    expect(takes).toBe(4);   // 셔터 한 장 + 넷
    expect(b.done).toBe(true);
  });

  it("AR5 묶음 간격은 0.2초 — 다섯 장이 0.8초 넘게 걸쳐 있다 (흔들림이 줄어드는 것을 확인한 조건, #333)", () => {
    expect(ATTEMPT_BURST.minGapMs).toBe(200);
    let b = startAttemptBurst("front_open", 0), last = 0;
    for (let t = 33; t < 2000 && !b.done; t += 33) {
      const r = attemptBurstStep(b, OK, t);
      b = r.state;
      if (r.take) last = t;
    }
    expect(b.got).toBe(5);
    expect(last).toBeGreaterThanOrEqual(800);
    expect(last).toBeLessThan(ATTEMPT_BURST.maxMs);
  });

  it("AR4 묶음은 조건(정면 · 눈 · 크기 · 선명)을 통과한 장면만, 너무 붙은 장면은 건너뛰고, 제한 시간이 지나면 모은 만큼으로 끝", () => {
    const b0 = startAttemptBurst("front_open", 0);
    expect(attemptBurstStep(b0, OK, ATTEMPT_BURST.minGapMs - 1).take).toBe(false);           // 너무 붙음
    expect(attemptBurstStep(b0, { ...OK, closedA: true, closedB: true }, 200).take).toBe(false);   // 눈 감음
    expect(attemptBurstStep(b0, { ...OK, yaw: 30 }, 200).take).toBe(false);                   // 고개 돌림
    expect(attemptBurstStep(b0, { ...OK, faceDetected: false }, 200).take).toBe(false);
    expect(attemptBurstStep(b0, OK, 200).take).toBe(true);
    const late = attemptBurstStep(b0, { ...OK, closedA: true, closedB: true }, ATTEMPT_BURST.maxMs);
    expect(late).toMatchObject({ take: false, state: { done: true } });
  });
});
