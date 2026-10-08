// 개발용 ?perf (#343) — 실시간 화면이 초당 몇 장 나오나 · 장면마다 어느 단계가 오래 걸리나
import { describe, expect, it } from "vitest";
import { createPerfMeter } from "@core/perf-meter";

describe("실시간 속도 재기", () => {
  it("PM1 장면 시각으로 초당 장 수 — 40ms 마다면 25장", () => {
    const m = createPerfMeter();
    for (let k = 0; k <= 30; k++) m.frame(1000 + 40 * k);
    expect(m.fps()).toBeCloseTo(25, 5);
  });

  it("PM2 최근 window 장만 본다 — 느려지면 바로 보인다", () => {
    const m = createPerfMeter(10);
    for (let k = 0; k <= 20; k++) m.frame(40 * k);          // 25장
    for (let k = 1; k <= 10; k++) m.frame(800 + 100 * k);   // 그 뒤 10장은 100ms 마다
    expect(m.fps()).toBeCloseTo(10, 5);
  });

  it("PM3 단계별 시간은 최근 window 장 평균", () => {
    const m = createPerfMeter(3);
    for (const ms of [100, 10, 20, 30]) m.stage("얼굴 찾기", ms);   // 처음 100 은 밀려난다
    expect(m.avg("얼굴 찾기")).toBeCloseTo(20, 5);
    expect(m.avg("없는 단계")).toBe(0);
  });

  it("PM4 한 줄로 — 초당 장 수 다음에 단계를 처음 나온 순서대로, 반올림", () => {
    const m = createPerfMeter();
    for (let k = 0; k <= 30; k++) m.frame(40 * k);
    m.stage("얼굴 찾기", 18.26);
    m.stage("그리기", 3.4);
    expect(m.text()).toBe("초당 25.0장 · 얼굴 찾기 18.3ms · 그리기 3.4ms");
  });

  it("PM5 장면이 두 장도 안 되면 초당 장 수는 0", () => {
    const m = createPerfMeter();
    expect(m.fps()).toBe(0);
    m.frame(10);
    expect(m.fps()).toBe(0);
  });
});
