// 얼굴 측정 (논문 기술 A) 검증
// 개인화의 입력이 되는 연속값들. 분류하지 않고 잰다 (Alashkar 2017: 눈 모양 6분류 자동 정확도 61%).
import { describe, expect, it } from "vitest";
import { measureFace, IRIS_MM } from "@core/face-measure";
import { LM } from "@core/landmarks";
import { face, tiltHead } from "./helpers/measure-face";

describe("얼굴 측정 — 눈꼬리 기울기 (Jung 2020)", () => {
  it("수평인 눈은 0°", () => {
    const m = measureFace(face());
    expect(m.eye.R.tiltDeg).toBeCloseTo(0, 6);
    expect(m.eye.L.tiltDeg).toBeCloseTo(0, 6);
  });

  it("바깥 눈꼬리가 올라가면 양수 — 양쪽 눈이 같은 부호", () => {
    const m = measureFace(face({ eye: { tilt: 9 } }));
    expect(m.eye.R.tiltDeg).toBeCloseTo(9, 6);
    expect(m.eye.L.tiltDeg).toBeCloseTo(9, 6);
  });

  it("바깥 눈꼬리가 내려가면 음수", () => {
    const m = measureFace(face({ eye: { tilt: -6 } }));
    expect(m.eye.R.tiltDeg).toBeCloseTo(-6, 6);
    expect(m.eye.L.tiltDeg).toBeCloseTo(-6, 6);
  });
});

describe("얼굴 측정 — 눈꼬리 각 α·β (ILoveEye)", () => {
  it("눈꼬리 쪽에서 윗눈꺼풀이 아랫눈꺼풀보다 가파르면 α > β — ILoveEye 기준 처진 눈", () => {
    const m = measureFace(face({ eye: { apex: 0.3, up: 18, down: 12 } }));
    expect(m.eye.R.alphaDeg).toBeGreaterThan(m.eye.R.betaDeg);
    expect(m.eye.R.outerCornerDown).toBe(true);
    expect(m.eye.L.outerCornerDown).toBe(true);
  });

  it("아랫눈꺼풀이 더 가파르면 α < β — 처진 눈이 아니다", () => {
    const m = measureFace(face({ eye: { up: 10, down: 16 } }));
    expect(m.eye.R.alphaDeg).toBeLessThan(m.eye.R.betaDeg);
    expect(m.eye.R.outerCornerDown).toBe(false);
  });

  it("위아래가 같으면 α = β", () => {
    const m = measureFace(face({ eye: { up: 12, down: 12 } }));
    expect(m.eye.R.alphaDeg).toBeCloseTo(m.eye.R.betaDeg, 6);
  });
});

describe("얼굴 측정 — 눈 가로세로 비 (ILoveEye)", () => {
  it("눈 폭 ÷ (위 + 아래 최대 거리)", () => {
    const m = measureFace(face({ eye: { w: 90, up: 18, down: 12 } }));
    expect(m.eye.R.aspect).toBeCloseTo(90 / 30, 6);
  });

  it("눈 높이는 눈 폭 대비 비율로도 준다", () => {
    const m = measureFace(face({ eye: { w: 90, up: 18, down: 12 } }));
    expect(m.eye.R.heightRatio).toBeCloseTo(30 / 90, 6);
  });
});

describe("얼굴 측정 — mm 환산 (Jung 2020 각막 지름 11.3 mm)", () => {
  it("홍채 지름이 20px 이면 1px = 11.3/20 mm", () => {
    const m = measureFace(face({ iris: 20 }));
    expect(IRIS_MM).toBe(11.3);
    expect(m.mmPerPx).toBeCloseTo(11.3 / 20, 6);
  });

  it("홍채 점이 뭉개져 있으면 환산하지 않는다", () => {
    const lm = face();
    for (const i of [...LM.eyeA.iris, ...LM.eyeB.iris]) lm[i] = { x: 300, y: 300 };
    expect(measureFace(lm).mmPerPx).toBeNull();
  });
});

describe("얼굴 측정 — 얼굴 가로/세로 비 (Zhao 2019)", () => {
  it("얼굴 폭 ÷ 이마 윗점~턱 끝", () => {
    expect(measureFace(face({ faceW: 400, faceH: 500 })).faceAspect).toBeCloseTo(0.8, 6);
  });

  it("둥근 얼굴일수록 1 에 가깝다", () => {
    const round = measureFace(face({ faceW: 450, faceH: 500 })).faceAspect;
    const long = measureFace(face({ faceW: 360, faceH: 500 })).faceAspect;
    expect(round).toBeGreaterThan(long);
  });
});

describe("얼굴 측정 — 눈썹 굽은 정도 (Zhao 2019)", () => {
  it("일자 눈썹은 0", () => {
    const m = measureFace(face({ browRise: 0 }));
    expect(m.brow.R.curvature).toBeCloseTo(0, 6);
    expect(m.brow.L.curvature).toBeCloseTo(0, 6);
  });

  it("가운데가 올라간 거리 ÷ 눈썹 길이", () => {
    const m = measureFace(face({ browRise: 11 }));
    expect(m.brow.R.curvature).toBeCloseTo(11 / 110, 6);
  });
});

describe("얼굴 측정 — 고개 기울기와 무관", () => {
  it("고개를 10° 기울여도 눈꼬리 기울기는 그대로다 — 눈동자를 잇는 선이 수평 기준", () => {
    const m = measureFace(tiltHead(face({ eye: { tilt: 7 } }), 10));
    expect(m.eye.R.tiltDeg).toBeCloseTo(7, 6);
    expect(m.eye.L.tiltDeg).toBeCloseTo(7, 6);
  });

  it("고개 기울기는 따로 알려 준다", () => {
    expect(measureFace(tiltHead(face(), 10)).rollDeg).toBeCloseTo(10, 6);
    expect(measureFace(face()).rollDeg).toBeCloseTo(0, 6);
  });
});

describe("얼굴 측정 — 크기와 무관", () => {
  it("사진을 두 배로 키워도 비율값은 같고 mm 환산만 바뀐다", () => {
    const base = face({ eye: { tilt: 7 }, browRise: 9 });
    const big = base.map((p) => ({ x: p.x * 2, y: p.y * 2 }));
    const a = measureFace(base), b = measureFace(big);
    expect(b.eye.R.tiltDeg).toBeCloseTo(a.eye.R.tiltDeg, 6);
    expect(b.eye.R.aspect).toBeCloseTo(a.eye.R.aspect, 6);
    expect(b.faceAspect).toBeCloseTo(a.faceAspect, 6);
    expect(b.brow.R.curvature).toBeCloseTo(a.brow.R.curvature, 6);
    expect(b.mmPerPx!).toBeCloseTo(a.mmPerPx! / 2, 6);
  });
});
