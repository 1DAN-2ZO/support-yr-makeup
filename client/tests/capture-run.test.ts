// 화면 1 촬영 진행 (프레임마다): 안정 프레임 → 자동 촬영, 15초 힌트, 다음 장
import { describe, expect, it } from "vitest";
import { CAPTURE_LIMITS, type ShotMeasure } from "@core/flow";
import { SLOW_HINT, SLOW_HINT_MS, runStep, startRun } from "@core/capture-run";

const OK: ShotMeasure = { faceDetected: true, yaw: 0, pitch: 0, closedA: false, closedB: false, faceRatio: 0.5, eyeWidthPx: 100, sharpness: 400, foreheadL: 60 };

describe("runStep", () => {
  it("K1 조건을 stableFrames 프레임 연속 통과해야 찍는다", () => {
    let st = startRun({}, 0);
    expect(st.shot).toBe("front_open");
    for (let i = 1; i < CAPTURE_LIMITS.stableFrames; i++) {
      const r = runStep(st, OK, i);
      expect(r.take).toBe(false);
      expect(r.gate?.firstFail).toBe("stable");
      st = r.state;
    }
    expect(runStep(st, OK, 99).take).toBe(true);
  });

  it("K2 중간에 한 프레임이라도 틀리면 안정이 0 부터", () => {
    let st = startRun({}, 0);
    for (let i = 0; i < 3; i++) st = runStep(st, OK, i).state;
    const r = runStep(st, { ...OK, closedA: true, closedB: true }, 4);
    expect(r.state.stable).toBe(0);
    expect(r.gate?.firstFail).toBe("eyes");
  });

  it("K3 찍은 장은 건너뛰고 다음 장부터, 다 찍었으면 할 일 없음", () => {
    expect(startRun({ front_open: {} }, 0).shot).toBe("front_closed");
    const done = startRun({ front_open: 1, front_closed: 1, left_45: 1, right_45: 1 }, 0);
    expect(done.shot).toBeNull();
    expect(runStep(done, OK, 1)).toMatchObject({ take: false, gate: null });
  });

  it("K4 한 장을 15초 넘게 못 찍으면 힌트, 통과 중이면 힌트 없음", () => {
    const st = startRun({}, 0);
    expect(runStep(st, { ...OK, faceDetected: false }, SLOW_HINT_MS - 1).hint).toBeNull();
    expect(runStep(st, { ...OK, faceDetected: false }, SLOW_HINT_MS).hint).toBe(SLOW_HINT);
    expect(runStep({ ...st, stable: 99 }, OK, SLOW_HINT_MS * 2).hint).toBeNull();
  });
});
