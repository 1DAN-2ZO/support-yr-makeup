// 사진 가이드 POC (2026-10-06) — 실시간 선 대신 가만히 있는 순간을 찍어 그 사진 위에 가이드.
// 한 장의 랜드마크는 흔들리니 가만히 있는 몇 장을 모아 점마다 중앙값, 사진은 그 중앙값에 가장 가까운 장
import { describe, expect, it } from "vitest";
import { LM } from "@core/landmarks";
import { SNAP, closestFrame, createSnapshotCollector, isStill, medianLandmarks } from "@core/snapshot";
import type { Pt } from "@core/types";
import { LMS } from "./helpers/synth-face";

const faceW = Math.hypot(LMS[LM.faceR]!.x - LMS[LM.faceL]!.x, LMS[LM.faceR]!.y - LMS[LM.faceL]!.y);
const shift = (lm: readonly Pt[], dx: number, dy = 0): Pt[] => lm.map((p) => ({ x: p.x + dx, y: p.y + dy }));

describe("사진 가이드 — 찍기", () => {
  it("S1 점마다 중앙값 — 한 장만 튄 점은 무시된다", () => {
    const frames = [shift(LMS, 0), shift(LMS, 1), shift(LMS, -1), shift(LMS, 0.5), shift(LMS, 40)];
    const m = medianLandmarks(frames);
    expect(m).toHaveLength(LMS.length);
    for (let i = 0; i < LMS.length; i += 37) expect(Math.abs(m[i]!.x - (LMS[i]!.x + 0.5))).toBeLessThan(1e-9);
  });

  it("S2 사진은 중앙값에 가장 가까운 장", () => {
    const frames = [shift(LMS, 3), shift(LMS, 0.4), shift(LMS, -2)];
    expect(closestFrame(frames, LMS)).toBe(1);
  });

  it("S3 가만히 있나 — 머리 점이 얼굴 폭의 stillTol 안에서만 움직였으면 가만히", () => {
    expect(isStill(LMS, shift(LMS, faceW * SNAP.stillTol * 0.5))).toBe(true);
    expect(isStill(LMS, shift(LMS, faceW * SNAP.stillTol * 2))).toBe(false);
  });

  const still = (k: number) => shift(LMS, 0.1 * k);   // 장마다 0.1px — 가만히

  it("S4 가만히 있는 장이 frames 개 이어지면 한 장 완성 — 사진은 중앙값에 가장 가까운 장 · 다 찍으면 다시 처음부터", () => {
    const c = createSnapshotCollector<string>();
    let done = null;
    const dx = [0.1, 0.2, 0.3, 0.4, 0.9];   // 중앙값 0.3 → 그 장(f2)이 가장 가깝다
    for (let k = 0; k < SNAP.frames; k++) {
      done = c.push(shift(LMS, dx[k]!), `f${k}`);
      if (k < SNAP.frames - 1) expect(done).toBeNull();
    }
    expect(done!.image).toBe("f2");
    expect(Math.abs(done!.lm[10]!.x - (LMS[10]!.x + 0.3))).toBeLessThan(1e-9);
    expect(c.push(LMS, "g")).toBeNull();
  });

  it("S5 크게 움직이면 거기서부터 다시 센다", () => {
    const c = createSnapshotCollector<string>();
    c.push(still(0), "a");
    c.push(shift(LMS, faceW * 0.05), "moved");   // 여기서부터 다시 — 이 장이 1장째
    for (let k = 0; k < SNAP.frames - 2; k++) expect(c.push(shift(LMS, faceW * 0.05 + 0.1 * k), `s${k}`)).toBeNull();
    expect(c.push(shift(LMS, faceW * 0.05 + 0.3), "last")).not.toBeNull();
  });

  it("S6 얼굴을 놓치면 처음부터 다시 센다", () => {
    const c = createSnapshotCollector<string>();
    for (let k = 0; k < SNAP.frames - 2; k++) c.push(still(k), `a${k}`);
    expect(c.push(null, "lost")).toBeNull();
    for (let k = 0; k < SNAP.frames - 1; k++) expect(c.push(still(k), `b${k}`)).toBeNull();
    expect(c.push(still(SNAP.frames), "b-last")).not.toBeNull();
  });
});
