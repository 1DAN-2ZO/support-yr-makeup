// 카메라 잠금·Wake Lock·탭 전환·WebGL 복구 검증 (1-8·1-3). 브라우저 객체는 전부 가짜
import { describe, expect, it } from "vitest";
import { ULTRA_WIDE_ZOOM, applyCameraLocks, applyUltraWideZoom, bindGlContext, bindVisibility, lockReportRow, releaseCameraLocks, requestWakeLock, ultraWideZoom } from "../src/screens/camera-locks";
import type { TrackLike } from "../src/screens/camera-locks";

/** 지금 설정값 (getSettings) — 잠글 때 이 값을 그대로 고정해야 한다 */
const NOW = { exposureTime: 166.6, iso: 400, colorTemperature: 4800, focusDistance: 0.3 };

function track(caps: ReturnType<NonNullable<TrackLike["getCapabilities"]>> | null, failOn: string[] = [], settings: Record<string, unknown> | null = NOW): TrackLike & { applied: Record<string, unknown>[] } {
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
  if (settings) t.getSettings = () => settings;
  return t;
}

describe("applyCameraLocks", () => {
  it("manual 이 되는 항목만 잠그고 보고서에 남긴다", async () => {
    const t = track({ whiteBalanceMode: ["continuous", "manual"], exposureMode: ["continuous"], width: { max: 1920 }, height: { max: 1080 } });
    const r = await applyCameraLocks(t);
    expect(r).toMatchObject({ capsSupported: true, whiteBalance: "locked", exposure: "unsupported", focus: "unsupported", maxWidth: 1920, maxHeight: 1080 });
    expect(t.applied).toHaveLength(1);
    expect(t.applied[0]).toEqual({ advanced: [{ whiteBalanceMode: "manual", colorTemperature: 4800 }] });
  });
  it("잠글 때 지금 노출 시간·ISO·색온도를 같이 넘긴다 — 'manual' 만 보내면 Android 에서 하얗게 날아간다 (2026-09-30)", async () => {
    const t = track({ whiteBalanceMode: ["manual"], exposureMode: ["manual"] });
    const r = await applyCameraLocks(t);
    expect(r).toMatchObject({ whiteBalance: "locked", exposure: "locked" });
    expect(t.applied).toContainEqual({ advanced: [{ exposureMode: "manual", exposureTime: 166.6, iso: 400 }] });
    expect(t.applied).toContainEqual({ advanced: [{ whiteBalanceMode: "manual", colorTemperature: 4800 }] });
  });
  it("지금 노출 시간·색온도를 못 읽으면 잠그지 않는다 (unsupported)", async () => {
    const t = track({ whiteBalanceMode: ["manual"], exposureMode: ["manual"] }, [], { iso: 400 });
    const r = await applyCameraLocks(t);
    expect(r).toMatchObject({ whiteBalance: "unsupported", exposure: "unsupported" });
    expect(t.applied).toHaveLength(0);
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

describe("초광각 확대 (2026-09-23 iPad)", () => {
  const t = (label: string, zoom?: { min?: number; max?: number }): TrackLike & { applied: Record<string, unknown>[] } => {
    const applied: Record<string, unknown>[] = [];
    return { label, applied, getCapabilities: () => (zoom ? { zoom } : {}), async applyConstraints(c) { applied.push(c); } };
  };
  it("초광각 + zoom 지원이면 1.5배", async () => {
    expect(ultraWideZoom(t("전면 울트라 와이드 카메라", { min: 1, max: 10 }))).toBe(ULTRA_WIDE_ZOOM);
    const tr = t("Front Ultra Wide Camera", { min: 1, max: 10 });
    expect(await applyUltraWideZoom(tr)).toBe(1.5);
    expect(tr.applied).toEqual([{ advanced: [{ zoom: 1.5 }] }]);
  });
  it("초광각이 아니거나 zoom 이 없으면 안 건다 (Android 등)", async () => {
    expect(ultraWideZoom(t("camera 1, facing front", { min: 1, max: 8 }))).toBeNull();
    expect(ultraWideZoom(t("Front Ultra Wide Camera"))).toBeNull();
    expect(ultraWideZoom(t("Front Ultra Wide Camera", { min: 1, max: 1.2 }))).toBeNull();
    expect(await applyUltraWideZoom(t("front camera", { max: 10 }))).toBeNull();
  });
  it("applyConstraints 가 실패하면 null", async () => {
    const tr: TrackLike = { label: "초광각", getCapabilities: () => ({ zoom: { max: 10 } }), applyConstraints: () => Promise.reject(new Error("x")) };
    expect(await applyUltraWideZoom(tr)).toBeNull();
  });
});
