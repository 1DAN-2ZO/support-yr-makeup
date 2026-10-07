// 촬영 이벤트 찍기 검증 (1-5)
import { describe, expect, it } from "vitest";
import { createCaptureEvents } from "@core/capture-events";
import { createLogger, memorySink } from "@core/log";
import type { Versions } from "@core/types";

const ver: Versions = { app: "test", score: "score-v0.1", look: "look-v0.1", faceshape: "faceshape-rule-v1", transfer: "transfer-stub-v0" };

function setup(opts?: Parameters<typeof createCaptureEvents>[1]) {
  const m = memorySink();
  const logger = createLogger({ sid: "s1", screen: "capture", part: null, ver, now: () => 1 }, m.sink);
  return { m, ev: createCaptureEvents(logger, opts) };
}

describe("capture events", () => {
  it("consent 는 ok 만 남긴다", () => {
    const { m, ev } = setup();
    ev.consent(false);
    expect(m.events[0]).toMatchObject({ name: "consent", ok: false, screen: "capture" });
  });

  it("capture 는 shot·ok·retry·reason. 다시 찍기로 하면 다음 이벤트의 retry 가 오른다", () => {
    const { m, ev } = setup();
    ev.shot("front_open", false, "bright");
    ev.retake("front_open");
    ev.shot("front_open", true, null);
    ev.shot("front_closed", true, null);
    expect(m.events[0]).toMatchObject({ name: "capture", shot: "front_open", ok: false, retry: 0, reason: "bright" });
    expect(m.events[1]).toMatchObject({ name: "capture", shot: "front_open", ok: true, retry: 1, reason: null });
    expect(m.events[2]).toMatchObject({ name: "capture", shot: "front_closed", retry: 0 });
    expect(ev.retries()).toEqual({ front_open: 1, front_closed: 0 });
  });

  it("restore 는 ok 와 사진 잔존 여부", () => {
    const { m, ev } = setup();
    ev.restore(true, false);
    expect(m.events[0]).toMatchObject({ name: "restore", ok: true, had_images: false });
  });

  it("사진·좌표는 어느 이벤트에도 없다 (한 줄 JSON 에 lm/pts/image 키 없음)", () => {
    const { m, ev } = setup();
    ev.consent(true); ev.shot("front_open", true, null); ev.restore(true, true);
    for (const line of m.lines) expect(line).not.toMatch(/"(lm|pts|image|frames)"/);
  });

  // ---- 2026-09-21 폰 실측 뒤 추가: ok=false 는 "같은 조건에 3초 막힘" 일 때 한 번 ----
  it("blocked: 같은 조건이 stuckMs 이상 이어질 때만 capture ok=false 한 번", () => {
    const { m, ev } = setup({ stuckMs: 3000 });
    // 17fps 로 2.9초 막힘 → 아직 안 찍음
    for (let t = 0; t < 2900; t += 60) expect(ev.blocked("front_closed", "bright", t)).toBe(false);
    expect(m.events).toHaveLength(0);
    expect(ev.blocked("front_closed", "bright", 3000)).toBe(true);
    // 계속 막혀도 다시 안 찍음
    for (let t = 3060; t < 10000; t += 60) expect(ev.blocked("front_closed", "bright", t)).toBe(false);
    expect(m.events).toHaveLength(1);
    expect(m.events[0]).toMatchObject({ name: "capture", shot: "front_closed", ok: false, reason: "bright", retry: 0 });
  });

  it("blocked: 조건이 바뀌면 시간을 다시 센다, 통과(null)하면 리셋", () => {
    const { m, ev } = setup({ stuckMs: 3000 });
    ev.blocked("front_closed", "bright", 0);
    ev.blocked("front_closed", "angle", 2000);      // 조건 바뀜 → angle 은 2000 부터
    expect(ev.blocked("front_closed", "angle", 4000)).toBe(false);   // 2초밖에 안 됨
    expect(ev.blocked("front_closed", "angle", 5000)).toBe(true);
    ev.blocked("front_closed", null, 5100);          // 통과 중 → 리셋
    expect(ev.blocked("front_closed", "angle", 5200)).toBe(false);
    expect(ev.blocked("front_closed", "angle", 8100)).toBe(false);   // 5200 부터 2.9초
    expect(ev.blocked("front_closed", "angle", 8200)).toBe(true);
    expect(m.events.map((e) => (e.name === "capture" ? e.reason : null))).toEqual(["angle", "angle"]);
  });

  it("blocked 뒤 촬영 성공·재촬영은 막힘 상태를 지운다", () => {
    const { m, ev } = setup({ stuckMs: 1000 });
    ev.blocked("front_closed", "angle", 0);
    ev.shot("front_closed", true, null);
    expect(ev.blocked("front_closed", "angle", 1500)).toBe(false);   // 새 에피소드 시작
    ev.blocked("front_closed", "angle", 2600);
    expect(m.events.filter((e) => e.name === "capture" && !e.ok)).toHaveLength(1);
    ev.retake("front_closed");
    expect(ev.blocked("front_closed", "angle", 2700)).toBe(false);
    expect(ev.blocked("front_closed", "angle", 3800)).toBe(true);
    expect(m.events.at(-1)).toMatchObject({ name: "capture", shot: "front_closed", ok: false, retry: 1 });
  });

  // ---- 2026-09-22 iPhone 실측 뒤 추가: 조건이 계속 바뀌어도 오래 막히면 한 줄 ----
  it("slow: 조건이 3초 안에 계속 바뀌어도 5초 막히면 가장 오래 막힌 조건으로 한 번", () => {
    const { m, ev } = setup({ stuckMs: 3000, slowMs: 5000 });
    // 각도 2초 → 크기 1초 → 각도 1초 → 얼굴 1초 … 어느 조건도 3초를 못 채운다
    const seq: [number, "angle" | "size" | "face"][] = [[0, "angle"], [2000, "size"], [3000, "angle"], [4000, "face"], [4500, "size"]];
    for (const [t, r] of seq) expect(ev.blocked("front_closed", r, t)).toBe(false);
    expect(ev.blocked("front_closed", "size", 5000)).toBe(true);
    // 누적: angle 2000+1000=3000, size 1000+500=1500, face 500 → angle
    expect(m.events).toHaveLength(1);
    expect(m.events[0]).toMatchObject({ name: "capture", shot: "front_closed", ok: false, reason: "angle" });
    // 같은 구간에서 5초 규칙은 다시 안 찍는다. 한 조건이 3초를 채우면 그건 3초 규칙대로 찍는다 (size 는 4500 부터)
    for (let t = 5100; t < 7500; t += 100) expect(ev.blocked("front_closed", "size", t)).toBe(false);
    expect(m.events).toHaveLength(1);
    expect(ev.blocked("front_closed", "size", 7500)).toBe(true);
    expect(m.events.at(-1)).toMatchObject({ reason: "size" });
  });

  it("slow: 3초 규칙으로 이미 찍었으면 5초 규칙은 안 찍는다, 장이 바뀌면 새로 센다", () => {
    const { m, ev } = setup({ stuckMs: 3000, slowMs: 5000 });
    ev.blocked("front_closed", "bright", 0);
    expect(ev.blocked("front_closed", "bright", 3000)).toBe(true);
    for (let t = 3100; t < 9000; t += 100) ev.blocked("front_closed", "bright", t);
    expect(m.events).toHaveLength(1);
    ev.blocked("front_open", "angle", 9000);
    ev.blocked("front_open", "size", 11000);
    expect(ev.blocked("front_open", "angle", 14000)).toBe(true);   // 9000 부터 5초
    expect(m.events.at(-1)).toMatchObject({ shot: "front_open", reason: "size" });   // size 3000 > angle 2000
  });

  it("faceLost: 1초 이상만 landmark_lost 로 찍는다", () => {
    const { m, ev } = setup();
    ev.faceLost(400);
    ev.faceLost(3100.6);
    expect(m.events).toHaveLength(1);
    expect(m.events[0]).toMatchObject({ name: "landmark_lost", ms: 3101 });
  });
});
