// 화면 4 이벤트 (2-4, #24): gate_fail{first_fail} · landmark_lost{ms}
// 찍는 규칙은 화면 1(capture-events.ts)과 같다 — ⑥ 퍼널이 두 화면을 같은 기준(사람이 느끼는 시간)으로 본다
import { describe, expect, it } from "vitest";
import { createLogger, memorySink } from "@core/log";
import { createLiveEvents } from "@core/live-events";
import type { GateFail, Versions } from "@core/types";

const ver: Versions = { app: "test", score: "s", look: "l", faceshape: "f", transfer: "t" };

function setup() {
  const m = memorySink();
  const log = createLogger({ sid: "s1", screen: "live", part: "liner", ver }, m.sink);
  return { ev: createLiveEvents(log), events: m.events };
}
/** t0 부터 33ms 마다 같은 조건 */
const run = (ev: ReturnType<typeof createLiveEvents>, fail: GateFail | null, t0: number, ms: number): number => {
  let t = t0;
  for (; t <= t0 + ms; t += 33) ev.gate(fail, t);
  return t;
};
const fails = (events: readonly { name: string }[]) => events.filter((e) => e.name === "gate_fail");

describe("live events", () => {
  it("E1 같은 조건에 3초 막히면 gate_fail 한 번 — 계속 막혀 있어도 더 안 찍는다", () => {
    const { ev, events } = setup();
    run(ev, "angle", 0, 2900);
    expect(fails(events)).toHaveLength(0);
    run(ev, "angle", 2933, 6000);
    expect(fails(events)).toEqual([expect.objectContaining({ name: "gate_fail", first_fail: "angle", part: "liner", screen: "live" })]);
  });

  it("E2 조건이 3초 안에 계속 바뀌어도 5초 못 넘기면 가장 오래 막힌 조건으로 한 번", () => {
    const { ev, events } = setup();
    let t = 0;
    for (let k = 0; k < 4; k++) {
      t = run(ev, "sharp", t, 1500);
      t = run(ev, "bright", t, 500);
    }
    expect(fails(events)).toEqual([expect.objectContaining({ first_fail: "sharp" })]);
  });

  it("E3 통과하면 처음부터 — 다시 3초 막히면 또 한 번", () => {
    const { ev, events } = setup();
    let t = run(ev, "angle", 0, 3100);
    t = run(ev, null, t, 500);
    run(ev, "angle", t, 3100);
    expect(fails(events)).toHaveLength(2);
  });

  it("E4 얼굴 없음은 gate_fail 로 안 센다 (landmark_lost 가 맡는다) — 그동안 막힌 시간도 쌓지 않는다", () => {
    const { ev, events } = setup();
    let t = run(ev, "face", 0, 6000);
    expect(fails(events)).toHaveLength(0);
    t = run(ev, "angle", t, 2000);
    expect(fails(events)).toHaveLength(0);
  });

  it("E5 얼굴을 1초 넘게 놓쳤다 다시 찾으면 landmark_lost{ms}, 1초 미만(깜빡임)은 안 찍는다", () => {
    const { ev, events } = setup();
    ev.faceLost(1234.6);
    ev.faceLost(400);
    expect(events.filter((e) => e.name === "landmark_lost")).toEqual([expect.objectContaining({ ms: 1235 })]);
  });

  it("E6 얼굴이 사라진 순간부터 다시 잡힌 순간까지를 스스로 잰다 (frame 에 lm 유무만 넣으면 된다)", () => {
    const { ev, events } = setup();
    ev.face(true, 0);
    ev.face(false, 100);
    ev.face(false, 900);
    ev.face(true, 1600);
    ev.face(true, 1700);
    expect(events.filter((e) => e.name === "landmark_lost")).toEqual([expect.objectContaining({ ms: 1500 })]);
  });

  it("E7 한 번 찍은 뒤 다른 조건으로 또 3초 막히면 그것도 찍는다 — 화면 1 blocked() 와 같게 (#170 리뷰)", () => {
    const { ev, events } = setup();
    let t = run(ev, "angle", 0, 3100);
    t = run(ev, "size", t, 3500);
    expect(fails(events).map((e) => (e as { first_fail?: string }).first_fail)).toEqual(["angle", "size"]);
  });

  it("E8 얼굴이 한 프레임씩 끊겨도 막힌 시간은 이어진다 — 지우지 않고 그 프레임만 건너뜀 (#170 리뷰)", () => {
    const { ev, events } = setup();
    // 각도에 10초 막혀 있는데 2초마다 얼굴이 한 프레임 끊긴다
    for (let t = 0; t <= 10000; t += 33) ev.gate(t % 2000 < 33 ? "face" : "angle", t);
    expect(fails(events)).toEqual([expect.objectContaining({ first_fail: "angle" })]);
  });
});
