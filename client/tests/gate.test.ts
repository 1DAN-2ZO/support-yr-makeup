// 화면 4 품질 게이트 (2-1 셋째 조각, #21) 검증
// 정의서 3-3·3-7: 안 맞는 조건 하나만 한 줄, 숫자 없음. 순서 = 얼굴 → 정면 → 기준 각도 차 → 부위 보임 → 가림 → 선명 → 밝기 → 색 → 안정
import { describe, expect, it } from "vitest";
import { GATE_TEXT, LIVE_LIMITS, evaluateGate, gateStep, poseOf, type LiveMeasure } from "@core/gate";
import { yawFromLandmarks } from "@core/capture-measure";
import { CAPTURE_LIMITS } from "@core/flow";
import { LM, partVisible } from "@core/landmarks";
import { LMS, W, H } from "./helpers/synth-face";

/** 다 맞는 프레임. 필요한 것만 덮어쓴다 — undefined 로 주면 그 항목을 뺀다 (안 잰 값) */
const good = (over: { [K in keyof LiveMeasure]?: LiveMeasure[K] | undefined } = {}): LiveMeasure => {
  const m: Record<string, unknown> = {
    faceDetected: true, yaw: 0, pitch: 0, baseYaw: 0, basePitch: 0, partVisible: true, occluded: false,
    sharpness: 400, foreheadL: 62, baselineL: 62, foreheadAb: { a: 12, b: 16 }, baselineAb: { a: 12, b: 16 }, stableCount: 5,
    ...over,
  };
  for (const k of Object.keys(m)) if (m[k] === undefined) delete m[k];
  return m as unknown as LiveMeasure;
};

describe("evaluateGate", () => {
  it("V1 다 맞고 5프레임 안정이면 통과 — '확인받을 준비 됨'", () => {
    const r = evaluateGate("liner", good());
    expect(r).toEqual({ ok: true, firstFail: null, text: GATE_TEXT.ready, stableCount: 5 });
    expect(r.text).toBe("확인받을 준비 됨");
  });

  it("V2 얼굴이 없으면 face, 문구 없음 (테두리만 사라진다, 3-9)", () => {
    const r = evaluateGate("liner", good({ faceDetected: false }));
    expect(r.firstFail).toBe("face");
    expect(r.text).toBe("");
  });

  it("V3 깨진 측정값(NaN·Infinity)은 얼굴을 못 잰 것으로 본다 (정의서 3-5)", () => {
    expect(evaluateGate("liner", good({ yaw: NaN })).firstFail).toBe("face");
    expect(evaluateGate("liner", good({ sharpness: Infinity })).firstFail).toBe("face");
  });

  it("V4 정면이 아니면 angle — 어두운 것보다 먼저 말한다", () => {
    const r = evaluateGate("liner", good({ yaw: 30, foreheadL: 20 }));
    expect(r.firstFail).toBe("angle");
    expect(r.text).toBe("조금만 정면으로");
  });

  it("V5 정면 한계: yaw ±15°, pitch ±10°", () => {
    expect(evaluateGate("lip", good({ yaw: 14, baseYaw: 14 })).ok).toBe(true);
    expect(evaluateGate("lip", good({ yaw: -16, baseYaw: -16 })).firstFail).toBe("angle");
    expect(evaluateGate("lip", good({ pitch: 9, basePitch: 9 })).ok).toBe(true);
    expect(evaluateGate("lip", good({ pitch: 11, basePitch: 11 })).firstFail).toBe("angle");
  });

  it("V6 기준 사진과 각도가 yaw 8° · pitch 6° 넘게 다르면 pose_diff. 기준이 없으면 건너뛴다", () => {
    expect(evaluateGate("liner", good({ yaw: 9 })).firstFail).toBe("pose_diff");
    expect(evaluateGate("liner", good({ pitch: -7 })).firstFail).toBe("pose_diff");
    expect(evaluateGate("liner", good({ yaw: 7, pitch: 5 })).ok).toBe(true);
    expect(evaluateGate("liner", good({ yaw: 9, baseYaw: undefined, basePitch: undefined })).ok).toBe(true);
    expect(evaluateGate("liner", good({ yaw: 9 })).text).toBe("처음 찍을 때와 같은 각도로 봐 주세요");
  });

  it("V6b 표정이 맨얼굴 때와 많이 다르면 expr_diff — 각도 차 다음, 부위 보임보다 먼저 (#27)", () => {
    const r = evaluateGate("lip", good({ exprDiff: LIVE_LIMITS.exprTol + 0.01, partVisible: false }));
    expect(r.firstFail).toBe("expr_diff");
    expect(r.text).toBe("처음 찍을 때처럼 편한 표정으로 있어 주세요");
    expect(evaluateGate("lip", good({ exprDiff: LIVE_LIMITS.exprTol + 0.01, yaw: 9 })).firstFail).toBe("pose_diff");
    expect(evaluateGate("lip", good({ exprDiff: LIVE_LIMITS.exprTol })).ok).toBe(true);
    expect(evaluateGate("lip", good({ exprDiff: undefined })).ok).toBe(true);
  });

  it("V7 부위가 잘리면 visible — 눈 부위는 '양쪽 눈', 나머지는 '부위'", () => {
    for (const p of ["brow", "liner", "shadow"] as const) {
      expect(evaluateGate(p, good({ partVisible: false })).text).toBe("양쪽 눈이 보이게 해 주세요");
    }
    for (const p of ["lip", "cheek", "contour"] as const) {
      expect(evaluateGate(p, good({ partVisible: false })).text).toBe("부위가 다 보이게 해 주세요");
    }
    expect(evaluateGate("lip", good({ partVisible: false })).firstFail).toBe("visible");
  });

  it("V8 가림(이마 급변) — 선명보다 먼저, 문구는 정의서 97행 그대로", () => {
    const r = evaluateGate("liner", good({ occluded: true, sharpness: 10 }));
    expect(r.firstFail).toBe("hand");
    expect(r.text).toBe("얼굴을 가리지 말아 주세요");
  });

  it("V9 흔들림: 선명도 하한은 화면 1 과 같은 값", () => {
    expect(LIVE_LIMITS.sharpMin).toBe(CAPTURE_LIMITS.sharpMin);
    expect(evaluateGate("liner", good({ sharpness: LIVE_LIMITS.sharpMin - 1 })).firstFail).toBe("sharp");
    expect(evaluateGate("liner", good({ sharpness: LIVE_LIMITS.sharpMin })).ok).toBe(true);
  });

  it("V10 밝기: 기준 이마 L* ±12 밖이면 어둡다/밝다", () => {
    expect(evaluateGate("liner", good({ foreheadL: 49 })).text).toBe("조금 더 밝은 곳으로");
    expect(evaluateGate("liner", good({ foreheadL: 75 })).text).toBe("너무 밝아요. 조금 어두운 곳으로");
    expect(evaluateGate("liner", good({ foreheadL: 73 })).ok).toBe(true);
    expect(evaluateGate("liner", good({ foreheadL: 49 })).firstFail).toBe("bright");
  });

  it("V11 밝기: 기준이 없어도 절대 범위(L* 40~85) 밖이면 막는다", () => {
    expect(evaluateGate("liner", good({ baselineL: undefined, foreheadL: 30 })).firstFail).toBe("bright");
    expect(evaluateGate("liner", good({ baselineL: undefined, foreheadL: 62 })).ok).toBe(true);
  });

  it("V12 조명 색이 기준에서 돌면 color", () => {
    expect(evaluateGate("liner", good({ foreheadAb: { a: 12, b: 16 + LIVE_LIMITS.colorTol + 1 } })).firstFail).toBe("color");
  });

  it("V13 안정 5프레임 전에는 '잠시만 그대로'", () => {
    const r = evaluateGate("liner", good({ stableCount: 4 }));
    expect(r.firstFail).toBe("stable");
    expect(r.text).toBe("잠시만 그대로");
    expect(r.stableCount).toBe(4);
  });

  it("V14 없는 측정값은 그 조건을 건너뛴다", () => {
    const r = evaluateGate("liner", { faceDetected: true, yaw: 0, pitch: 0, stableCount: 5 });
    expect(r.ok).toBe(true);
  });
});

describe("gateStep", () => {
  it("S1 안정 빼고 다 맞는 프레임이 이어질 때만 센다. 하나라도 걸리면 0부터", () => {
    let stable = 0;
    const seq = [good(), good(), good({ sharpness: 10 }), good(), good(), good(), good(), good()];
    const oks: boolean[] = [];
    for (const m of seq) {
      const r = gateStep(stable, "liner", m);
      stable = r.stable;
      oks.push(r.gate.ok);
    }
    expect(stable).toBe(5);
    expect(oks).toEqual([false, false, false, false, false, false, false, true]);
  });

  it("S2 넘긴 stableCount 는 무시하고 스스로 센다", () => {
    const r = gateStep(0, "liner", good({ stableCount: 99 }));
    expect(r.stable).toBe(1);
    expect(r.gate.firstFail).toBe("stable");
  });
});

describe("poseOf · partVisible", () => {
  it("P1 poseOf 는 화면 1 과 같은 부호(거울 기준) — 기준 사진과 라이브를 같은 식으로 잰다", () => {
    const raw = yawFromLandmarks(LMS);
    expect(poseOf(LMS)).toEqual({ yaw: -raw.yaw, pitch: raw.pitch });
  });

  it("P2 부위 점이 프레임 안(여백 2%)에 다 있으면 보인다", () => {
    for (const p of ["brow", "liner", "shadow", "lip", "cheek", "contour"] as const) {
      expect(partVisible(p, LMS, W, H)).toBe(true);
    }
  });

  it("P3 입술 한 점이 가장자리에 걸리면 입술만 안 보인다", () => {
    const lm = LMS.map((p, i) => (i === LM.lipsOuter[0] ? { ...p, x: W * 0.01 } : p));
    expect(partVisible("lip", lm, W, H)).toBe(false);
    expect(partVisible("liner", lm, W, H)).toBe(true);
  });
});
