// 화면 4 확대 창 떨림 1차 (#23) — 데드존 · 미끄러짐 · 크기 잠금 · 영상 밖 자르기 · 떨림 재기
// 정의서 3-5 "확대 화면이 흔들림": 얼굴 폭 3% 이상 움직일 때만 이동, 0.2~0.3초 미끄러짐, 확대율도 거리 변화 임계 이상일 때만
import { describe, expect, it } from "vitest";
import { CROP_FOLLOW, clampRect, createCropFollow, jitterMeter } from "@core/crop-follow";
import { cropSpec } from "@core/crop";
import { LM } from "@core/landmarks";
import type { Pt } from "@core/types";
import { LMS } from "./helpers/synth-face";

const FACE_W = LMS[LM.faceR]!.x - LMS[LM.faceL]!.x;   // 400
const shift = (dx: number, dy = 0): Pt[] => LMS.map((p) => ({ x: p.x + dx, y: p.y + dy }));
/** 가운데(300,300) 기준으로 k 배 */
const scale = (k: number): Pt[] => LMS.map((p) => ({ x: 300 + (p.x - 300) * k, y: 300 + (p.y - 300) * k }));
const cx = (r: { x: number; w: number }) => r.x + r.w / 2;

describe("createCropFollow", () => {
  it("F1 첫 프레임은 cropSpec 박스 그대로", () => {
    const f = createCropFollow("lip", 3 / 4);
    expect(f.step(LMS, 0)).toEqual(cropSpec("lip", LMS, 3 / 4));
  });

  it("F2 얼굴 폭 3% 안쪽으로 흔들리면 창이 한 픽셀도 안 움직인다 (데드존)", () => {
    const f = createCropFollow("lip", 3 / 4);
    const first = f.step(LMS, 0);
    const d = FACE_W * CROP_FOLLOW.deadzone * 0.6;   // x·y 둘 다 d 여도 거리 0.85 × 데드존
    for (let i = 1; i <= 30; i++) expect(f.step(shift(i % 2 ? d : -d, i % 3 ? d : 0), i * 33)).toEqual(first);
  });

  it("F3 크게 움직이면 바로 점프하지 않고 0.3초 안에 미끄러져 따라간다", () => {
    const f = createCropFollow("lip", 3 / 4);
    const x0 = cx(f.step(LMS, 0));
    const moved = shift(FACE_W * 0.1);
    const want = cx(cropSpec("lip", moved, 3 / 4));
    const firstStep = cx(f.step(moved, 33));
    expect(firstStep).toBeGreaterThan(x0);
    expect(firstStep).toBeLessThan(want - 1);                    // 한 번에 안 간다
    let r = 0;
    for (let t = 66; t <= 33 + 300; t += 33) r = cx(f.step(moved, t));
    expect(Math.abs(r - want)).toBeLessThan(Math.abs(want - x0) * 0.05);   // 0.3초면 95% 넘게
  });

  it("F4 따라간 뒤 그 자리에서 다시 작게 흔들리면 또 멈춘다 (데드존이 새 자리로 옮겨 간다)", () => {
    const f = createCropFollow("lip", 3 / 4);
    f.step(LMS, 0);
    const moved = shift(FACE_W * 0.1);
    let t = 0;
    for (let i = 0; i < 30; i++) f.step(moved, (t += 33));
    const settled = f.step(moved, (t += 33));
    const d = FACE_W * CROP_FOLLOW.deadzone * 0.9;
    for (let i = 0; i < 10; i++) expect(cx(f.step(shift(FACE_W * 0.1 + (i % 2 ? d : -d)), (t += 33)))).toBeCloseTo(cx(settled), 1);
  });

  it("F5 크기는 잠근다 — 눈 사이 거리가 20% 안쪽으로 변하면 확대율 그대로", () => {
    const f = createCropFollow("liner", 16 / 9);
    const w0 = f.step(LMS, 0).w;
    for (let i = 1; i <= 10; i++) expect(f.step(scale(1.15), i * 33).w).toBeCloseTo(w0, 6);
  });

  it("F6 실제로 다가가면(20% 넘게) 새 크기로 미끄러져 간다", () => {
    const f = createCropFollow("liner", 16 / 9);
    const w0 = f.step(LMS, 0).w;
    let w = w0;
    for (let i = 1; i <= 60; i++) w = f.step(scale(1.4), i * 33).w;
    expect(w / w0).toBeCloseTo(1.4, 2);
  });

  it("F7 reset 뒤에는 미끄러지지 않고 새 자리에서 시작 (얼굴을 잃었다 다시 잡힘)", () => {
    const f = createCropFollow("lip", 3 / 4);
    f.step(LMS, 0);
    f.reset();
    const far = shift(FACE_W * 0.3);
    expect(f.step(far, 1000)).toEqual(cropSpec("lip", far, 3 / 4));
  });
});

describe("clampRect", () => {
  it("C1 영상 밖으로 나간 쪽만 밀어 넣는다 (크기는 그대로)", () => {
    expect(clampRect({ x: -50, y: 10, w: 200, h: 100 }, 1000, 500)).toEqual({ x: 0, y: 10, w: 200, h: 100 });
    expect(clampRect({ x: 900, y: 450, w: 200, h: 100 }, 1000, 500)).toEqual({ x: 800, y: 400, w: 200, h: 100 });
  });
  it("C2 영상보다 크면 가운데 기준으로 영상 크기까지 줄인다", () => {
    expect(clampRect({ x: -100, y: 0, w: 1200, h: 300 }, 1000, 500)).toEqual({ x: 0, y: 0, w: 1000, h: 300 });
  });
});

describe("jitterMeter", () => {
  it("J1 안 움직이면 0", () => {
    const m = jitterMeter();
    for (let i = 0; i < 10; i++) m.push([{ x: 5, y: 5 }]);
    expect(m.perFrame()).toBe(0);
  });
  it("J2 프레임마다 튄 거리의 평균(px) — ±2 로 오가면 한 프레임에 4씩", () => {
    const m = jitterMeter();
    for (let i = 0; i < 100; i++) m.push([{ x: i % 2 ? 2 : -2, y: 0 }, { x: 10, y: i % 2 ? 12 : 8 }]);
    expect(m.perFrame()).toBeCloseTo(4, 6);
    expect(m.count()).toBe(100);
  });
  it("J3 천천히 움직인 것(자연스러운 몸 흔들림)은 떨림으로 거의 안 센다 — 10초에 30px 이면 프레임당 0.1", () => {
    const m = jitterMeter();
    for (let i = 0; i < 300; i++) m.push([{ x: i * 0.1, y: 0 }]);
    expect(m.perFrame()).toBeCloseTo(0.1, 6);
  });
  it("J4 점 개수가 바뀌면(부위 바뀜) 처음부터", () => {
    const m = jitterMeter();
    m.push([{ x: 0, y: 0 }]);
    m.push([{ x: 9, y: 0 }]);
    m.push([{ x: 0, y: 0 }, { x: 0, y: 0 }]);
    expect(m.count()).toBe(1);
    expect(m.perFrame()).toBe(0);
  });
});
