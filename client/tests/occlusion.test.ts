// 가림 판정 검증 (2026-09-23 #144: 손 검출 모델 빼고 이마 급변으로 "얼굴을 가리지 말아 주세요")
import { describe, expect, it } from "vitest";
import { FOREHEAD_JUMP, foreheadStep, startForeheadTrack } from "@core/occlusion";
import type { ForeheadTrack } from "@core/occlusion";
import type { Lab } from "@core/color";
import { shotGate } from "@core/flow";

/** 33ms 간격(30fps)으로 값들을 흘려 보내고 프레임별 가림 여부를 돌려준다 */
function run(labs: readonly Lab[], dt = 33): { occ: boolean[]; jumps: number[]; tr: ForeheadTrack } {
  let tr = startForeheadTrack();
  const occ: boolean[] = [], jumps: number[] = [];
  labs.forEach((lab, i) => {
    const r = foreheadStep(tr, i * dt, lab, pose);
    tr = r.track; occ.push(r.occluded); jumps.push(r.jump);
  });
  return { occ, jumps, tr };
}
const pose = { yaw: 0, pitch: 0 };
const skin: Lab = { L: 65, a: 12, b: 16 };
const hand: Lab = { L: 40, a: 18, b: 20 };   // 손·그림자: 어둡고 붉다
const rep = (lab: Lab, n: number): Lab[] => Array.from({ length: n }, () => lab);

describe("foreheadStep", () => {
  it("가만히 있으면 가림 아님", () => {
    expect(run(rep(skin, 60)).occ.some(Boolean)).toBe(false);
  });

  it("조명이 서서히 바뀌면(3초에 L* 20) 가림 아님 — 밝기 조건이 맡는다", () => {
    const labs = Array.from({ length: 90 }, (_, i) => ({ ...skin, L: 65 - (20 * i) / 90 }));
    expect(run(labs).occ.some(Boolean)).toBe(false);
  });

  it("손이 갑자기 올라오면 가림, 내리면 풀림", () => {
    const { occ } = run([...rep(skin, 20), ...rep(hand, 30), ...rep(skin, 20)]);
    expect(occ.slice(0, 20).some(Boolean)).toBe(false);
    expect(occ.slice(22, 50).every(Boolean)).toBe(true);
    expect(occ.slice(52).some(Boolean)).toBe(false);
  });

  it("가린 채로 가만히 있어도 settleMs 전에는 계속 가림", () => {
    const n = Math.floor((FOREHEAD_JUMP.settleMs - 200) / 33);
    const { occ } = run([...rep(skin, 10), ...rep(hand, n)]);
    expect(occ.at(-1)).toBe(true);
  });

  it("불이 확 켜진 뒤 새 값에서 settleMs 넘게 가만하면 풀림 (조명 변화로 봄)", () => {
    const bright: Lab = { ...skin, L: 90 };
    const n = Math.ceil((FOREHEAD_JUMP.settleMs + 500) / 33);
    const { occ } = run([...rep(skin, 10), ...rep(bright, n)]);
    expect(occ[15]).toBe(true);
    expect(occ.at(-1)).toBe(false);
  });

  it("고개를 돌리면서 이마 빛이 확 바뀌면 가림 아님 (2026-09-23 iPad 45° 오탐)", () => {
    let tr = startForeheadTrack();
    const occ: boolean[] = [];
    for (let i = 0; i < 40; i++) {
      const yaw = Math.min(40, i * 4);           // 0 → 40° 로 돌린다
      const lab = yaw > 20 ? hand : skin;        // 돌다가 이마 빛이 확 바뀜
      const r = foreheadStep(tr, i * 33, lab, { yaw, pitch: 0 });
      tr = r.track; occ.push(r.occluded);
    }
    expect(occ.some(Boolean)).toBe(false);
  });

  it("가린 채 손이 계속 움직이면 풀리지 않는다", () => {
    const moving = Array.from({ length: 150 }, (_, i) => (i % 20 < 10 ? hand : { L: 30, a: 20, b: 22 }));
    const { occ } = run([...rep(skin, 10), ...moving]);
    expect(occ.at(-1)).toBe(true);
  });
});

describe("shotGate 이마 급변", () => {
  const ok = { faceDetected: true, yaw: 0, pitch: 0, closedA: false, closedB: false, stableCount: 99 };
  it("foreheadOccluded 면 visible · 가리지 말아 주세요", () => {
    const g = shotGate("front_open", { ...ok, foreheadOccluded: true });
    expect(g.ok).toBe(false);
    expect(g.firstFail).toBe("visible");
    expect(g.text).toBe("얼굴을 가리지 말아 주세요");
  });
  it("가림이 각도보다 먼저", () => {
    expect(shotGate("front_open", { ...ok, yaw: 40, foreheadOccluded: true }).text).toBe("얼굴을 가리지 말아 주세요");
  });
  it("없거나 false 면 통과", () => {
    expect(shotGate("front_open", ok).ok).toBe(true);
    expect(shotGate("front_open", { ...ok, foreheadOccluded: false }).ok).toBe(true);
  });
});
