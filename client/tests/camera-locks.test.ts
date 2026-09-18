// 카메라 잠금·Wake Lock·탭 전환·WebGL 복구 검증 (1-8·1-3). 브라우저 객체는 전부 가짜
import { describe, expect, it } from "vitest";
import { applyCameraLocks, bindGlContext, bindVisibility, lockReportRow, releaseCameraLocks, requestWakeLock } from "../src/screens/camera-locks";
import type { TrackLike } from "../src/screens/camera-locks";

function track(caps: ReturnType<NonNullable<TrackLike["getCapabilities"]>> | null, failOn: string[] = []): TrackLike & { applied: Record<string, unknown>[] } {
  const applied: Record<string, unknown>[] = [];
  const t: TrackLike & { applied: Record<string, unknown>[] } = {
    applied,
    label: "front camera",
    async applyConstraints(c) {
      const adv = (c.advanced as Record<string, string>[] | undefined) ?? [];
      for (const a of adv) for (const k of Object.keys(a)) if (failOn.includes(k)) throw new Error("NotSupported");
      applied.push(c);
    },
  };
  if (caps) t.getCapabilities = () => caps;
  return t;
}

describe("applyCameraLocks", () => {
  it("manual 이 되는 항목만 잠그고 보고서에 남긴다", async () => {
    const t = track({ whiteBalanceMode: ["continuous", "manual"], exposureMode: ["continuous"], width: { max: 1920 }, height: { max: 1080 } });
    const r = await applyCameraLocks(t);
    expect(r).toMatchObject({ capsSupported: true, whiteBalance: "locked", exposure: "unsupported", focus: "unsupported", maxWidth: 1920, maxHeight: 1080 });
    expect(t.applied).toHaveLength(1);
    expect(t.applied[0]).toEqual({ advanced: [{ whiteBalanceMode: "manual" }] });
  });
  it("getCapabilities 가 없으면(iOS 사파리) 전부 unsupported, throw 없음", async () => {
    const r = await applyCameraLocks(track(null));
    expect(r.capsSupported).toBe(false);
    expect(r.whiteBalance).toBe("unsupported");
  });
  it("applyConstraints 가 던지면 failed 로 기록하고 계속 간다", async () => {
    const t = track({ whiteBalanceMode: ["manual"], exposureMode: ["manual"] }, ["whiteBalanceMode"]);
    const r = await applyCameraLocks(t);
    expect(r.whiteBalance).toBe("failed");
    expect(r.exposure).toBe("locked");
  });
  it("1-3 표 한 줄 형식", async () => {
    const r = await applyCameraLocks(track({ whiteBalanceMode: ["manual"], width: { max: 1280 }, height: { max: 720 } }));
    const row = lockReportRow("Android 14", r);
    expect(row).toBe("| Android 14 | front camera | O | O | X | X | 1280×720 |");
  });
  it("releaseCameraLocks 는 continuous 로 되돌린다", async () => {
    const t = track({ whiteBalanceMode: ["continuous", "manual"], exposureMode: ["manual"] });
    await releaseCameraLocks(t);
    expect(t.applied[0]).toEqual({ advanced: [{ whiteBalanceMode: "continuous" }] });
  });
});

describe("requestWakeLock", () => {
  it("지원하면 sentinel, 없거나 거부되면 null", async () => {
    const sentinel = { release: async () => {} };
    expect(await requestWakeLock({ request: async () => sentinel })).toBe(sentinel);
    expect(await requestWakeLock(undefined)).toBeNull();
    expect(await requestWakeLock({ request: async () => { throw new Error("denied"); } })).toBeNull();
  });
});

describe("bindVisibility / bindGlContext", () => {
  it("숨김·복귀 콜백이 갈리고 해제하면 더 안 부른다", () => {
    let fn: (() => void) | null = null;
    const doc = { visibilityState: "visible" as "visible" | "hidden", addEventListener: (_t: string, f: () => void) => { fn = f; }, removeEventListener: () => { fn = null; } };
    const calls: string[] = [];
    const off = bindVisibility(doc, { onHidden: () => calls.push("hidden"), onVisible: () => calls.push("visible") });
    doc.visibilityState = "hidden"; fn!();
    doc.visibilityState = "visible"; fn!();
    off();
    expect(calls).toEqual(["hidden", "visible"]);
    expect(fn).toBeNull();
  });
  it("webglcontextlost 는 preventDefault 후 onLost, restored 는 onRestored", () => {
    const handlers: Record<string, (e: { preventDefault(): void }) => void> = {};
    const canvas = { addEventListener: (t: string, f: (e: { preventDefault(): void }) => void) => { handlers[t] = f; }, removeEventListener: (t: string) => { delete handlers[t]; } };
    const calls: string[] = [];
    const off = bindGlContext(canvas, { onLost: () => calls.push("lost"), onRestored: () => calls.push("restored") });
    let prevented = false;
    handlers.webglcontextlost!({ preventDefault: () => { prevented = true; } });
    handlers.webglcontextrestored!({ preventDefault: () => {} });
    expect(prevented).toBe(true);
    expect(calls).toEqual(["lost", "restored"]);
    off();
    expect(Object.keys(handlers)).toHaveLength(0);
  });
});
