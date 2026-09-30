// #28 강체 점 통일 — 정합(채점)·게이트가 같은 13점, 기준 각도 차는 턱·입을 안 쓰고 잰다
// 정의서 3-5: 얼굴 옆(234·454)과 턱(152)은 입을 벌리면 메시가 같이 벌어진다 → 뺀다
import { describe, expect, it } from "vitest";
import { RIGID_IDS, LM } from "@core/landmarks";
import { STABLE_IDS } from "@core/score";
import { RIGID_POSE, livePose, poseOf, rigidPoseDiff, slopeFit } from "@core/gate";
import type { Pt } from "@core/types";
import { LMS } from "./helpers/synth-face";

const FACE: Pt[] = LMS.map((p, i) => (i === LM.chin ? { x: 300, y: 464 } : p));
/** 크기·회전·이동 */
const similar = (lm: readonly Pt[], s: number, deg: number, dx: number, dy: number): Pt[] => {
  const t = (deg * Math.PI) / 180, c = Math.cos(t), sn = Math.sin(t);
  return lm.map((p) => ({ x: s * (c * p.x - sn * p.y) + dx, y: s * (sn * p.x + c * p.y) + dy }));
};
const move = (lm: readonly Pt[], ids: readonly number[], dx: number, dy: number): Pt[] =>
  lm.map((p, i) => (ids.includes(i) ? { x: p.x + dx, y: p.y + dy } : p));

describe("RIGID_IDS", () => {
  it("R1 채점 정합(STABLE_IDS)과 같은 목록 하나 — 정의서 3-5 의 13점", () => {
    expect([...STABLE_IDS]).toEqual([...RIGID_IDS]);
    expect(RIGID_IDS).toHaveLength(13);
    for (const bad of [LM.chin, LM.faceL, LM.faceR, 127, 356]) expect(RIGID_IDS).not.toContain(bad);
  });
});

describe("rigidPoseDiff", () => {
  it("P1 같은 얼굴이면 0", () => {
    expect(rigidPoseDiff(FACE, FACE)).toEqual({ yaw: 0, pitch: 0 });
  });

  it("P2 크기·기울기·위치만 달라지면 각도 차 없음 (다가가거나 고개를 갸웃해도)", () => {
    const d = rigidPoseDiff(FACE, similar(FACE, 1.3, 12, 40, -25));
    expect(Math.abs(d.yaw)).toBeLessThan(1e-9);
    expect(Math.abs(d.pitch)).toBeLessThan(1e-9);
  });

  it("P3 입을 크게 벌려도(턱·입술이 내려가도) 각도 차 없음 — 옛 방식은 턱을 써서 숙인 것으로 잡았다", () => {
    const mouthOpen = move(FACE, [LM.chin, ...LM.lipsOuter.slice(11, 20)], 0, 80);
    expect(rigidPoseDiff(FACE, mouthOpen)).toEqual({ yaw: 0, pitch: 0 });
  });

  it("P4 코끝이 눈꼬리 선에서 옆·아래로 움직이면 그만큼 각도 차 (도, 작은 각 근사)", () => {
    const D = Math.hypot(FACE[LM.eyeB.outer]!.x - FACE[LM.eyeA.outer]!.x, FACE[LM.eyeB.outer]!.y - FACE[LM.eyeA.outer]!.y);
    const turned = move(FACE, [4], D * 0.05, D * 0.03);
    const d = rigidPoseDiff(FACE, turned);
    expect(Math.abs(d.yaw)).toBeCloseTo((0.05 / RIGID_POSE.kYaw) * (180 / Math.PI), 6);
    expect(Math.abs(d.pitch)).toBeCloseTo((0.03 / RIGID_POSE.kPitch) * (180 / Math.PI), 6);
  });
});

describe("slopeFit", () => {
  it("S1 원점을 지나는 기울기 (환산 계수 보정용)", () => {
    expect(slopeFit([[1, 2], [2, 4], [-3, -6]])).toBeCloseTo(2, 9);
    expect(slopeFit([])).toBeNull();
  });
});

describe("livePose (#193)", () => {
  it("A1 맨얼굴 그대로면 맨얼굴의 각도 (촬영 관문을 통과한 입 다문 정면 — 옛 식이 믿을 만한 사진)", () => {
    expect(livePose(FACE, FACE)).toEqual(poseOf(FACE));
  });
  it("A2 입을 크게 벌려도(턱·입술만 내려감) 각도가 안 바뀐다 — 지금 얼굴의 턱·얼굴 옆을 안 쓴다", () => {
    const open = move(FACE, [LM.chin, LM.faceL, LM.faceR, ...LM.lipsOuter.slice(11, 20)], 0, 80);
    expect(Math.abs(poseOf(open).pitch - poseOf(FACE).pitch)).toBeGreaterThan(5);   // 옛 식은 크게 흔들림
    const p = livePose(FACE, open), b = poseOf(FACE);
    expect(p.yaw).toBeCloseTo(b.yaw, 9);
    expect(p.pitch).toBeCloseTo(b.pitch, 9);
  });
  it("A3 부호가 옛 식과 같다 — 코끝이 아래로 가면 pitch 가 커지고, 화면 오른쪽으로 가면 yaw 가 작아진다(거울)", () => {
    const b = poseOf(FACE);
    expect(livePose(FACE, move(FACE, [4], 0, 10)).pitch).toBeGreaterThan(b.pitch);
    expect(livePose(FACE, move(FACE, [4], 10, 0)).yaw).toBeLessThan(b.yaw);
    expect(Math.sign(poseOf(move(FACE, [1], 10, 0)).yaw - b.yaw)).toBe(-1);   // 옛 식도 같은 방향
  });
});
