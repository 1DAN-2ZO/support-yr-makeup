import { describe, expect, it } from "vitest";
import { createLogger, memorySink } from "@core/log";
import type { Versions } from "@core/types";

const ver: Versions = { app: "test", score: "score-v0.1", look: "look-v0.1", faceshape: "faceshape-rule-v1", transfer: "transfer-stub-v0" };

describe("log()", () => {
  it("세션 ID·시각·화면·부위·버전이 자동으로 붙고 한 줄 JSON이다", () => {
    const m = memorySink();
    const logger = createLogger({ sid: "s1", screen: "capture", part: null, ver, now: () => 1000 }, m.sink);
    logger.log({ name: "capture", shot: "front_open", ok: false, retry: 1, reason: "bright" });
    expect(m.lines).toHaveLength(1);
    const parsed = JSON.parse(m.lines[0]!);
    expect(parsed).toMatchObject({ sid: "s1", t: 1000, screen: "capture", part: null, name: "capture", reason: "bright" });
    expect(parsed.ver.score).toBe("score-v0.1");
    expect(m.lines[0]!.includes("\n")).toBe(false);
  });

  it("화면·부위 컨텍스트가 바뀌면 다음 이벤트에 반영된다", () => {
    const m = memorySink();
    const logger = createLogger({ sid: "s1", screen: "guide", part: "brow", ver }, m.sink);
    logger.setContext({ screen: "live", part: "liner" });
    logger.log({ name: "gate_fail", first_fail: "occluded" });
    expect(m.events[0]).toMatchObject({ screen: "live", part: "liner", first_fail: "occluded" });
  });

  it("얼굴 데이터 필드는 거부한다", () => {
    const m = memorySink();
    const logger = createLogger({ sid: "s1", screen: "x", part: null, ver }, m.sink);
    const bad = { name: "error", where: "x", msg: "y", lm: [] } as unknown as Parameters<typeof logger.log>[0];
    expect(() => logger.log(bad)).toThrow(/forbidden/);
  });
});
