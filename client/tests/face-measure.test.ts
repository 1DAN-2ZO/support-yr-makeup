// 얼굴 측정 (논문 기술 A) 검증
// 개인화의 입력이 되는 연속값들. 분류하지 않고 잰다 (Alashkar 2017: 눈 모양 6분류 자동 정확도 61%).
import { describe, expect, it } from "vitest";
import { measureFace, IRIS_MM } from "@core/face-measure";
import { LM } from "@core/landmarks";
import type { Pt } from "@core/types";
import { LMS } from "./helpers/synth-face";

interface EyeSpec {
  /** 눈 폭 px */
  w: number;
  /** 눈 축에서 윗눈꺼풀까지 가장 먼 거리 px */
  up: number;
  /** 눈 축에서 아랫눈꺼풀까지 가장 먼 거리 px */
  down: number;
  /** 바깥 눈꼬리가 올라간 각도(°). 음수면 처진 눈 */
  tilt: number;
  /** 윗눈꺼풀 꼭대기의 위치 (0 = 바깥 눈꼬리, 1 = 안쪽 눈꼬리). 바깥 쪽에 있을수록 눈꼬리가 덮여 보인다 */
  apex?: number;
}

/** 눈 하나를 배치한다. 점 순서는 LM 과 같다: 바깥 → 안쪽 */
function placeEye(lm: Pt[], eye: typeof LM.eyeA | typeof LM.eyeB, cx: number, cy: number, s: EyeSpec, outerOnLeft: boolean): void {
  const dir = outerOnLeft ? -1 : 1;            // 바깥 눈꼬리 쪽
  const th = ((outerOnLeft ? 1 : -1) * s.tilt * Math.PI) / 180;
  const rot = (x: number, y: number): Pt => ({ x: cx + x * Math.cos(th) - y * Math.sin(th), y: cy + x * Math.sin(th) + y * Math.cos(th) });
  const apex = s.apex ?? 0.5;
  // 한쪽으로 치우친 봉우리: t 를 apex 기준으로 다시 펴서 sin 을 씌운다
  const bump = (t: number) => Math.sin(Math.PI * (t < apex ? (0.5 * t) / apex : 0.5 + (0.5 * (t - apex)) / (1 - apex)));
  const n = eye.upper.length;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);                     // 0 = 바깥, 1 = 안쪽
    const x = dir * (s.w / 2) * (1 - 2 * t);
    lm[eye.upper[i]!] = rot(x, -s.up * bump(t));
    lm[eye.lower[i]!] = rot(x, s.down * bump(t));
  }
}

/** 홍채: 가운데 + 둘레 네 점 (MediaPipe 순서: 469 오른쪽, 470 위, 471 왼쪽, 472 아래) */
function placeIris(lm: Pt[], iris: readonly number[], cx: number, cy: number, d: number): void {
  const r = d / 2;
  lm[iris[0]!] = { x: cx, y: cy };
  lm[iris[1]!] = { x: cx + r, y: cy };
  lm[iris[2]!] = { x: cx, y: cy - r };
  lm[iris[3]!] = { x: cx - r, y: cy };
  lm[iris[4]!] = { x: cx, y: cy + r };
}

/** 눈썹: 중심선이 호 모양. rise = 가운데가 양 끝 직선보다 올라간 px */
function placeBrow(lm: Pt[], brow: { readonly upper: readonly number[]; readonly lower: readonly number[] }, x0: number, x1: number, y: number, rise: number, thick: number): void {
  const n = brow.upper.length;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const cy = y - rise * Math.sin(Math.PI * t);
    lm[brow.upper[i]!] = { x: x0 + (x1 - x0) * t, y: cy - thick / 2 };
    lm[brow.lower[i]!] = { x: x0 + (x1 - x0) * t, y: cy + thick / 2 };
  }
}

interface FaceSpec { eye?: Partial<EyeSpec>; iris?: number; faceW?: number; faceH?: number; browRise?: number }

function face(spec: FaceSpec = {}): Pt[] {
  const lm = LMS.map((p) => ({ ...p }));
  const eye: EyeSpec = { w: 90, up: 18, down: 12, tilt: 0, ...spec.eye };
  placeEye(lm, LM.eyeA, 215, 250, eye, true);   // 이미지 왼쪽 = 피험자 오른쪽(R)
  placeEye(lm, LM.eyeB, 385, 250, eye, false);
  placeIris(lm, LM.eyeA.iris, 215, 250, spec.iris ?? 20);
  placeIris(lm, LM.eyeB.iris, 385, 250, spec.iris ?? 20);
  const rise = spec.browRise ?? 0;
  placeBrow(lm, LM.browA, 160, 270, 205, rise, 12);
  placeBrow(lm, LM.browB, 440, 330, 205, rise, 12);
  const fw = spec.faceW ?? 400, fh = spec.faceH ?? 500;
  lm[LM.faceL] = { x: 300 - fw / 2, y: 300 };
  lm[LM.faceR] = { x: 300 + fw / 2, y: 300 };
  lm[LM.forehead] = { x: 300, y: 50 };
  lm[LM.chin] = { x: 300, y: 50 + fh };
  return lm;
}

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
  /** 얼굴 전체를 (300, 300) 을 중심으로 deg 만큼 돌린다. 화면에서 시계 방향이 + */
  const tiltHead = (lm: Pt[], deg: number): Pt[] => {
    const t = (deg * Math.PI) / 180;
    return lm.map((p) => ({ x: 300 + (p.x - 300) * Math.cos(t) - (p.y - 300) * Math.sin(t), y: 300 + (p.x - 300) * Math.sin(t) + (p.y - 300) * Math.cos(t) }));
  };

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
