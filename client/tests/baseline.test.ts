// 기준 만들기·눈꺼풀 기준점·정면 재촬영 재정렬 검증 (1-6·1-10·1-11)
import { describe, expect, it } from "vitest";
import { applyTransform, buildBaseline, eyelidRef, eyelidToPx, retakeFront, similarity, transformAll, unitScale } from "@core/baseline";
import { EYE_A, EYE_B, FACE_L, FACE_R } from "@core/color";
import type { FaceShape, Pt } from "@core/types";

const shape: FaceShape = { label: "oval", confidence: 0.6, method: "rule", version: "faceshape-rule-v1" };

/** 478점 가짜 얼굴: 눈·입술·얼굴 폭·윗눈꺼풀 점만 의미 있는 값 */
function face(scale = 1, dx = 0, dy = 0, rot = 0): Pt[] {
  const lm: Pt[] = Array.from({ length: 478 }, () => ({ x: 100, y: 120 }));
  const set = (i: number, x: number, y: number): void => {
    const c = Math.cos(rot), s = Math.sin(rot);
    lm[i] = { x: (x * c - y * s) * scale + dx, y: (x * s + y * c) * scale + dy };
  };
  set(EYE_A.outer, 40, 100); set(EYE_A.inner, 80, 100);
  set(EYE_B.outer, 160, 100); set(EYE_B.inner, 120, 100);
  set(61, 70, 170); set(291, 130, 170);            // 입술 양끝
  set(FACE_L, 20, 120); set(FACE_R, 180, 120);     // 얼굴 폭 160
  // 윗눈꺼풀 (감은 눈): 눈 축보다 살짝 위 (y 작음) 로 곡선
  const upA = [33, 246, 161, 160, 159, 158, 157, 173, 133], upB = [263, 466, 388, 387, 386, 385, 384, 398, 362];
  upA.forEach((i, k) => set(i, 40 + (40 * k) / 8, 100 - 6 * Math.sin((Math.PI * k) / 8)));
  upB.forEach((i, k) => set(i, 160 - (40 * k) / 8, 100 - 6 * Math.sin((Math.PI * k) / 8)));
  return lm;
}

describe("unitScale / buildBaseline", () => {
  it("눈 폭 40, 입술 폭 60, 얼굴 폭 160", () => {
    const u = unitScale(face());
    expect(u.eye).toBeCloseTo(40); expect(u.lip).toBeCloseTo(60); expect(u.face).toBeCloseTo(160);
  });
  it("이미지가 없으면 이마 L* 0, 흰자 null 로 만들어진다 (③ 은 이마만 쓰거나 확인만)", () => {
    const b = buildBaseline({ lm: face(), w: 200, h: 240, faceShape: shape });
    expect(b.unit.eye).toBeCloseTo(40);
    expect(b.scleraLab).toBeNull();
    expect(b.faceShape.label).toBe("oval");
    expect(b.bareImage).toBeNull();
  });
});

describe("eyelidRef (1-10 눈 감음 장)", () => {
  it("윗눈꺼풀 9점을 눈 축 기준 비율로 — u 는 0→1, v 는 위쪽이 양수", () => {
    const ref = eyelidRef(face());
    expect(ref.A).toHaveLength(9);
    expect(ref.A[0]!.u).toBeCloseTo(0); expect(ref.A[8]!.u).toBeCloseTo(1);
    expect(ref.A[4]!.v).toBeCloseTo(6 / 40, 3);           // 가운데가 눈 폭의 15% 위
    expect(ref.B[4]!.v).toBeCloseTo(6 / 40, 3);
    expect(ref.eyePx).toBeCloseTo(40);
  });
  it("사진 크기·위치가 달라도 같은 비율이 나온다 (2배 확대·이동)", () => {
    const a = eyelidRef(face()), b = eyelidRef(face(2, 300, 50));
    a.A.forEach((p, k) => { expect(b.A[k]!.u).toBeCloseTo(p.u, 5); expect(b.A[k]!.v).toBeCloseTo(p.v, 5); });
  });
  it("eyelidToPx 로 다른 프레임의 눈 축에 다시 얹으면 원래 픽셀로 돌아온다", () => {
    const lm = face(1.5, 20, 30);
    const ref = eyelidRef(lm);
    const px = eyelidToPx(ref, lm);
    expect(px.A[4]!.x).toBeCloseTo(lm[159]!.x, 5); expect(px.A[4]!.y).toBeCloseTo(lm[159]!.y, 5);
    expect(px.B[0]!.x).toBeCloseTo(lm[263]!.x, 5);
  });
});

describe("similarity / retakeFront (1-11)", () => {
  it("배율·회전·이동을 눈 바깥 끝 두 점으로 복원한다", () => {
    const from = face(), to = face(1.3, 25, -10, 0.2);
    const T = similarity(from, to);
    expect(T.s).toBeCloseTo(1.3, 5);
    const p = applyTransform(T, from[61]!);
    expect(p.x).toBeCloseTo(to[61]!.x, 4); expect(p.y).toBeCloseTo(to[61]!.y, 4);
  });
  it("정면을 다시 찍으면 새 기준 + 나머지 장이 새 좌표계로 옮겨진다", () => {
    const prev = buildBaseline({ lm: face(), w: 200, h: 240, faceShape: shape });
    const others = { left_45: face(1, 0, 0, 0.1), front_closed: face() };
    const r = retakeFront(prev, { lm: face(2, 100, 100), w: 400, h: 480, faceShape: shape }, others);
    expect(r.baseline.unit.eye).toBeCloseTo(80);
    expect(r.transform.s).toBeCloseTo(2);
    // 눈 감음 장의 눈 바깥 끝은 새 기준의 눈 바깥 끝과 겹친다
    expect(r.others.front_closed![EYE_A.outer]!.x).toBeCloseTo(r.baseline.lm[EYE_A.outer]!.x, 4);
    expect(r.others.front_closed![EYE_A.outer]!.y).toBeCloseTo(r.baseline.lm[EYE_A.outer]!.y, 4);
    expect(transformAll(r.transform, others.left_45)).toHaveLength(478);
  });
});
