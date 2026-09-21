// 촬영 이벤트 찍기 검증 (1-5)
import { describe, expect, it } from "vitest";
import { createCaptureEvents } from "@core/capture-events";
import { createLogger, memorySink } from "@core/log";
import type { Versions } from "@core/types";

const ver: Versions = { app: "test", score: "score-v0.1", look: "look-v0.1", faceshape: "faceshape-rule-v1", transfer: "transfer-stub-v0" };

function setup() {
  const m = memorySink();
  const logger = createLogger({ sid: "s1", screen: "capture", part: null, ver, now: () => 1 }, m.sink);
  return { m, ev: createCaptureEvents(logger) };
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
});
