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
    ev.shot("left_45", true, null);
    expect(m.events[0]).toMatchObject({ name: "capture", shot: "front_open", ok: false, retry: 0, reason: "bright" });
    expect(m.events[1]).toMatchObject({ name: "capture", shot: "front_open", ok: true, retry: 1, reason: null });
    expect(m.events[2]).toMatchObject({ name: "capture", shot: "left_45", retry: 0 });
    expect(ev.retries()).toEqual({ front_open: 1, front_closed: 0, left_45: 0, right_45: 0 });
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
    for (let t = 0; t < 2900; t += 60) expect(ev.blocked("right_45", "bright", t)).toBe(false);
    expect(m.events).toHaveLength(0);
    expect(ev.blocked("right_45", "bright", 3000)).toBe(true);
    // 계속 막혀도 다시 안 찍음
    for (let t = 3060; t < 10000; t += 60) expect(ev.blocked("right_45", "bright", t)).toBe(false);
    expect(m.events).toHaveLength(1);
    expect(m.events[0]).toMatchObject({ name: "capture", shot: "right_45", ok: false, reason: "bright", retry: 0 });
  });

  it("blocked: 조건이 바뀌면 시간을 다시 센다, 통과(null)하면 리셋", () => {
    const { m, ev } = setup({ stuckMs: 3000 });
    ev.blocked("right_45", "bright", 0);
    ev.blocked("right_45", "angle", 2000);      // 조건 바뀜 → angle 은 2000 부터
    expect(ev.blocked("right_45", "angle", 4000)).toBe(false);   // 2초밖에 안 됨
    expect(ev.blocked("right_45", "angle", 5000)).toBe(true);
    ev.blocked("right_45", null, 5100);          // 통과 중 → 리셋
    expect(ev.blocked("right_45", "angle", 5200)).toBe(false);
    expect(ev.blocked("right_45", "angle", 8100)).toBe(false);   // 5200 부터 2.9초
    expect(ev.blocked("right_45", "angle", 8200)).toBe(true);
    expect(m.events.map((e) => (e.name === "capture" ? e.reason : null))).toEqual(["angle", "angle"]);
  });

  it("blocked 뒤 촬영 성공·재촬영은 막힘 상태를 지운다", () => {
    const { m, ev } = setup({ stuckMs: 1000 });
    ev.blocked("left_45", "angle", 0);
    ev.shot("left_45", true, null);
    expect(ev.blocked("left_45", "angle", 1500)).toBe(false);   // 새 에피소드 시작
    ev.blocked("left_45", "angle", 2600);
    expect(m.events.filter((e) => e.name === "capture" && !e.ok)).toHaveLength(1);
    ev.retake("left_45");
    expect(ev.blocked("left_45", "angle", 2700)).toBe(false);
    expect(ev.blocked("left_45", "angle", 3800)).toBe(true);
    expect(m.events.at(-1)).toMatchObject({ name: "capture", shot: "left_45", ok: false, retry: 1 });
  });

  it("faceLost: 1초 이상만 landmark_lost 로 찍는다", () => {
    const { m, ev } = setup();
    ev.faceLost(400);
    ev.faceLost(3100.6);
    expect(m.events).toHaveLength(1);
    expect(m.events[0]).toMatchObject({ name: "landmark_lost", ms: 3101 });
  });
});
