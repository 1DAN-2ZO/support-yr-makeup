// 화면 1 촬영 진행 (프레임마다): 안정 프레임 → 자동 촬영, 15초 힌트, 다음 장
import { describe, expect, it } from "vitest";
import { CAPTURE_LIMITS, type ShotMeasure } from "@core/flow";
import { BASE_SETTLE, SLOW_HINT, SLOW_HINT_MS, runStep, settleStep, startRun, startSettle } from "@core/capture-run";

const OK: ShotMeasure = { faceDetected: true, yaw: 0, pitch: 0, closedA: false, closedB: false, faceRatio: 0.5, eyeWidthPx: 100, sharpness: 400, foreheadL: 60 };

describe("runStep", () => {
  it("K1 조건을 stableFrames 프레임 연속 통과해야 찍는다", () => {
    let st = startRun({}, 0);
    expect(st.shot).toBe("front_open");
    // 기준 장은 켠 뒤 1.5초가 지나야 하므로 2초부터 100ms 간격으로
    for (let i = 1; i < CAPTURE_LIMITS.stableFrames; i++) {
      const r = runStep(st, OK, 2000 + i * 100);
      expect(r.take).toBe(false);
      expect(r.gate?.firstFail).toBe("stable");
      st = r.state;
    }
    expect(runStep(st, OK, 2000 + CAPTURE_LIMITS.stableFrames * 100).take).toBe(true);
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
    // 통과 중(둘째 장 — 기준 장의 자리 잡기 대기 없음)이면 힌트 없음
    const second = startRun({ front_open: {} }, 0);
    expect(runStep({ ...second, stable: 99 }, { ...OK, closedA: true, closedB: true }, SLOW_HINT_MS * 2).hint).toBeNull();
  });
});

describe("기준 장 자리 잡기 (2026-09-28 실내등: 켜자마자 찍힌 첫 장이 하얗게 날아감)", () => {
  it("S1 조건이 다 맞아도 차례가 된 뒤 1.5초 전에는 안 찍는다", () => {
    let st = startRun({}, 0);
    let took = false;
    for (let t = 0; t < BASE_SETTLE.minMs; t += 50) {
      const r = runStep(st, OK, t);
      took ||= r.take;
      st = r.state;
    }
    expect(took).toBe(false);
  });

  it("S2 이마 밝기가 0.5초 동안 2 넘게 움직이면(카메라가 맞추는 중) 안 찍는다", () => {
    let st = startRun({}, 0);
    let took = false;
    for (let t = 2000; t < 4000; t += 50) {
      const r = runStep(st, { ...OK, foreheadL: 60 + ((t / 50) % 2) * 5 }, t);   // 60 ↔ 65 로 흔들림
      took ||= r.take;
      st = r.state;
    }
    expect(took).toBe(false);
  });

  it("S3 둘째 장부터는 기다리지 않는다", () => {
    let st = startRun({ front_open: {} }, 0);
    expect(st.settle).toBeNull();
    let tookAt = -1;
    for (let t = 0; tookAt < 0 && t < 1000; t += 10) {
      const r = runStep(st, { ...OK, closedA: true, closedB: true }, t);
      if (r.take) tookAt = t;
      st = r.state;
    }
    expect(tookAt).toBeGreaterThanOrEqual(0);
    expect(tookAt).toBeLessThan(BASE_SETTLE.minMs);
  });

  it("S5 이마를 계속 못 재도 5초가 지나면 자리 잡기를 건너뛰고 찍는다 (#168 리뷰)", () => {
    let st = startRun({}, 0);
    let tookAt = -1;
    for (let t = 0; tookAt < 0 && t < 10000; t += 50) {
      const { foreheadL: _L, ...noForehead } = OK;
      const r = runStep(st, noForehead, t);
      if (r.take) tookAt = t;
      st = r.state;
    }
    expect(tookAt).toBeGreaterThanOrEqual(BASE_SETTLE.maxWaitMs);
    expect(tookAt).toBeLessThan(BASE_SETTLE.maxWaitMs + 500);
  });

  it("S4 settleStep: 이마를 못 재면 기록을 비운다", () => {
    let s = startSettle(0);
    s = settleStep(s, 2000, 60).state;
    const r = settleStep(s, 2100, undefined);
    expect(r.ready).toBe(false);
    expect(r.state.hist).toHaveLength(0);
  });
});
