// 부위 채점 검증 — 화면 5 POC 검증 27개를 vitest 로 옮김 (이슈 #32, 3-1)
// 합성 Lab 스트립으로 채점·코드·문구·상태를 본다. 원래 검증은 mm 로 적혀 있어서, 조건은 mm 그대로 두고
// 채점기에 넘기는 값만 비율로 바꾼다 (눈 폭 27mm · 입술 폭 50mm 기준).
import { describe, expect, it } from "vitest";
import type { Lab } from "@core/color";
import { applyResult, applySkip, createSession, nextPart } from "@core/flow";
import {
  CHECK_ACTION,
  CHECK_REASON_SHORT,
  CHECK_REASON_TEXT,
  DIAG_TEXT,
  PARAMS,
  STABLE_IDS,
  alignToBaseline,
  browResult,
  compareLinerEye,
  compareLip,
  compareRegion,
  decide,
  hasDigit,
  intensityIndex,
  intensityResult,
  lightCorr,
  linerResult,
  makeupBiasPx,
  noCorr,
  oneLiner,
  scoreForm,
  scoreIntensity,
  similarityFit,
  toOutcome,
  toneDelta,
  toneVerdict,
} from "@core/score";
import type { LinerStrip, LipStrip, PartScore, RegionGrid, Side } from "@core/score";
import type { Pt } from "@core/types";

const EYE_MM = 27, LIP_MM = 50;
const OFFS_MM: number[] = [];
for (let d = -3; d <= 3 + 1e-6; d += 0.25) OFFS_MM.push(+d.toFixed(3));

const lab = (L: number, a: number, b: number): Lab => ({ L, a, b });
const SKIN = lab(62, 12, 14), INK = lab(18, 4, 4);

/**
 * 라이너 스트립: 80행 (0~59 눈꺼풀, 60~79 꼬리 0~4mm). hit(i, offMm) 가 true 면 화장색.
 * 원래 POC 검증은 선 위·아래 대칭으로 그렸다 — 눈을 감은 프레임(eyeOpen false)으로 두면 그 조건이 그대로 성립한다
 */
function linerStrip(hit: (i: number, offMm: number) => boolean, eyeOpen = false): LinerStrip {
  const rows: Lab[][] = [], isWing: boolean[] = [], tFromCorner: number[] = [];
  for (let i = 0; i < 80; i++) {
    const wing = i >= 60;
    isWing.push(wing);
    tFromCorner.push(wing ? (((i - 59) / 20) * 4) / EYE_MM : -1 / EYE_MM);
    rows.push(OFFS_MM.map((o) => (hit(i, o) ? INK : SKIN)));
  }
  // 가이드 두께 1.2mm — 원래 채점기 상수였지만 이제 ② 가 룩마다 주는 값이라 샘플 meta 로 들어온다
  return { lab: rows, meta: { offs: OFFS_MM.map((o) => o / EYE_MM), isWing, tFromCorner, wingLen: 4 / EYE_MM, thick: 1.2 / EYE_MM, eyeOpen } };
}
const bareStrip = linerStrip(() => false);
const eyeRes = (hit: (i: number, offMm: number) => boolean) => compareLinerEye(bareStrip, linerStrip(hit), noCorr);
const perfect = (_i: number, o: number): boolean => Math.abs(o) <= 0.6;

describe("형태 채점식", () => {
  it("F1 완벽 100, 겹침 절반이면 75, 밖 번짐 상한 30, 꼬리·두께 상한 20·10", () => {
    expect(scoreForm({ coverage: 1, overflow: 0 })).toBe(100);
    expect(scoreForm({ coverage: 0.5, overflow: 0 })).toBe(75);
    expect(scoreForm({ coverage: 1, overflow: 1 })).toBe(70);
    expect(scoreForm({ coverage: 1, overflow: 0, wingDelta: 10, thickDelta: 10 })).toBe(70);
  });
});

describe("아이라이너", () => {
  it("L1 완벽한 라이너: 겹침 ≈1, 번짐 0, 두께·꼬리가 가이드대로, 코드 없음, 점수 95 이상", () => {
    const R = eyeRes(perfect), L = eyeRes(perfect);
    expect(R.coverage).toBeGreaterThan(0.95);
    expect(R.overflow).toBe(0);
    expect(R.thickness).toBeCloseTo(1.25 / EYE_MM, 4);
    expect(R.wingDrawn).toBeGreaterThanOrEqual(3.9 / EYE_MM);
    const r = linerResult({ R, L });
    expect(r.codes).toEqual([]);
    expect(r.score).toBeGreaterThanOrEqual(95);
    expect(r.present).toBe(true);
  });

  it("L2 오른쪽 꼬리가 위로 → LINER_WING_HIGH_R 와 좌우 차", () => {
    const R = eyeRes((i, o) => (i < 60 ? perfect(i, o) : Math.abs(o - 1.5) <= 0.6)), L = eyeRes(perfect);
    const r = linerResult({ R, L });
    expect(r.codes).toContain("LINER_WING_HIGH_R");
    expect(r.codes).not.toContain("LINER_WING_HIGH_L");
    expect(r.codes).toContain("LINER_LR_DIFF");
  });

  it("L3 왼쪽 꼬리가 아래로 → LINER_WING_LOW_L", () => {
    const r = linerResult({ R: eyeRes(perfect), L: eyeRes((i, o) => (i < 60 ? perfect(i, o) : Math.abs(o + 1.5) <= 0.6)) });
    expect(r.codes).toContain("LINER_WING_LOW_L");
  });

  it("L4 두 배로 두껍게 → LINER_THICK, 점수 하락", () => {
    const thick = (_i: number, o: number): boolean => Math.abs(o) <= 1.25;
    const r = linerResult({ R: eyeRes(thick), L: eyeRes(thick) });
    expect(r.codes).toContain("LINER_THICK");
    expect(r.score).toBeLessThan(95);
  });

  it("L5 오른쪽 꼬리를 짧게 → LINER_WING_SHORT_R", () => {
    const r = linerResult({ R: eyeRes((i, o) => perfect(i, o) && (i < 60 || ((i - 59) / 20) * 4 <= 1.5)), L: eyeRes(perfect) });
    expect(r.codes).toContain("LINER_WING_SHORT_R");
  });

  it("L6 왼쪽 중간을 비움 → LINER_GAP_L", () => {
    const r = linerResult({ R: eyeRes(perfect), L: eyeRes((i, o) => perfect(i, o) && !(i >= 15 && i < 39)) });
    expect(r.codes).toContain("LINER_GAP_L");
  });

  it("L7 화장 없음 → present false → 확인만 + 이유(색이 옅어서)", () => {
    const r = linerResult({ R: eyeRes(() => false), L: eyeRes(() => false) });
    expect(r.present).toBe(false);
    expect(r.score).toBeNull();
    expect(decide("liner", r)).toMatchObject({ status: "check_only", reason: "faint" });
  });

  it("L9 눈을 뜨고 있으면 속눈썹 선 아래(눈알)는 안 본다 — 홍채가 움직여도 두께·번짐이 안 흔들린다", () => {
    // 선 위쪽 0~1.2mm 에 그린 라이너 + 눈알(선 아래 0.5mm 부터)이 프레임마다 다른 색
    const skinLiner = (_i: number, o: number): boolean => o >= 0 && o <= 1.2;
    const eyeball = (row: Lab[], i: number): Lab[] => row.map((c, j) => (i < 60 && OFFS_MM[j]! < -0.5 ? lab(30 + (i % 7) * 5, 5, -20) : c));
    const clean = compareLinerEye(linerStrip(() => false, true), linerStrip(skinLiner, true), noCorr);
    const moved = linerStrip(skinLiner, true);
    moved.lab = moved.lab.map(eyeball);
    const noisy = compareLinerEye(linerStrip(() => false, true), moved, noCorr);
    expect(noisy.thickness).toBe(clean.thickness);
    expect(noisy.overflow).toBe(clean.overflow);
    expect(noisy.coverage).toBe(clean.coverage);
    expect(linerResult({ R: noisy, L: noisy }).codes).toEqual([]);
    // 눈을 감은 프레임이면 아래는 피부라 그대로 본다 → 같은 변화가 번짐으로 잡힌다
    const closed = linerStrip(skinLiner);
    closed.lab = closed.lab.map(eyeball);
    expect(compareLinerEye(linerStrip(() => false), closed, noCorr).overflow).toBeGreaterThan(0.3);
    // 한 프레임만 감았으면(맨얼굴은 뜸) 아래를 비교할 수 없으니 역시 안 본다
    expect(compareLinerEye(linerStrip(() => false, true), closed, noCorr).overflow).toBe(0);
  });

  it("L8 조명 보정: 이마 L 이 20% 어두워져도 같은 판정", () => {
    const cur = linerStrip(perfect);
    cur.lab = cur.lab.map((row) => row.map((c) => lab(c.L * 0.8, c.a, c.b)));
    const e = compareLinerEye(bareStrip, cur, lightCorr(60, 48));
    expect(e.coverage).toBeGreaterThan(0.95);
    expect(e.overflow).toBe(0);
  });
});

describe("눈썹", () => {
  function browGrid(hit: (side: Side, u: number, v: number, inside: boolean, tail: boolean) => boolean): RegionGrid {
    const labs: Lab[] = [], inside: boolean[] = [], tail: boolean[] = [], side: Side[] = [];
    for (const key of ["R", "L"] as const) {
      for (let ui = 0; ui < 24; ui++) {
        for (const v of [-0.6, -0.3, 0.1, 0.3, 0.5, 0.7, 0.9, 1.3, 1.6]) {
          const inn = v >= 0 && v <= 1, tl = ui / 23 < 0.4;
          inside.push(inn); tail.push(tl); side.push(key);
          labs.push(hit(key, ui / 23, v, inn, tl) ? INK : SKIN);
        }
      }
    }
    return { lab: labs, meta: { inside, tail, side } };
  }
  const bareGrid = browGrid(() => false);
  const brow = (hit: Parameters<typeof browGrid>[0]) => browResult(compareRegion(bareGrid, browGrid(hit), noCorr, PARAMS.dEThresh.brow));

  it("B1 안쪽을 전부 채움 → 코드 없음, 점수 95 이상", () => {
    const r = brow((_k, _u, _v, inn) => inn);
    expect(r.codes).toEqual([]);
    expect(r.score).toBeGreaterThanOrEqual(95);
  });

  it("B2 오른쪽 꼬리를 비움 → BROW_TAIL_SHORT_R 만", () => {
    const r = brow((k, _u, _v, inn, tl) => inn && !(k === "R" && tl));
    expect(r.codes).toContain("BROW_TAIL_SHORT_R");
    expect(r.codes).not.toContain("BROW_TAIL_SHORT_L");
  });

  it("B3 테두리 밖 번짐 → BROW_OUT_R·L, 점수 하락", () => {
    const r = brow(() => true);
    expect(r.codes).toEqual(expect.arrayContaining(["BROW_OUT_R", "BROW_OUT_L"]));
    expect(r.score).toBeLessThanOrEqual(75);
  });
});

describe("입술", () => {
  function lipStrip(hit: (half: "upper" | "lower", offMm: number) => boolean): LipStrip {
    const rows: Lab[][] = [], half: ("upper" | "lower")[] = [], side: Side[] = [];
    for (let i = 0; i < 60; i++) {
      const h = i < 30 ? "upper" : "lower";
      half.push(h);
      side.push(i % 2 ? "R" : "L");
      rows.push(OFFS_MM.map((o) => (hit(h, o) ? INK : SKIN)));
    }
    return { lab: rows, meta: { offs: OFFS_MM.map((o) => o / LIP_MM), half, side, offset: 0.5 / LIP_MM } };
  }
  const bareLip = lipStrip(() => false);
  const lip = (hit: Parameters<typeof lipStrip>[0]) => compareLip(bareLip, lipStrip(hit), noCorr);

  it("P1 경계 바로 밖까지만 → 코드 없음, 점수 95 이상", () => {
    const r = lip((_h, o) => o <= 0.5);
    expect(r.codes).toEqual([]);
    expect(r.score).toBeGreaterThanOrEqual(95);
  });

  it("P2 아래 경계 밖으로 나감 → LIP_OUT_LOWER 만", () => {
    expect(lip((h, o) => o <= (h === "lower" ? 2.5 : 0.5)).codes).toEqual(["LIP_OUT_LOWER"]);
  });

  it("P3 안쪽을 덜 채움 → LIP_UNDER, 화장 없음 → 확인만", () => {
    expect(lip((_h, o) => o >= -0.25 && o <= 0.5).codes).toContain("LIP_UNDER");
    const none = lip(() => false);
    expect(none.present).toBe(false);
    expect(decide("lip", none).status).toBe("check_only");
  });
});

describe("강도 부위", () => {
  const mk = (l: number, r: number, present = true) => ({ L: { index: l }, R: { index: r }, present });

  it("I1 지수: 부위만 변하면 그만큼, 참조도 같이 변하면 0", () => {
    expect(intensityIndex(SKIN, lab(SKIN.L - 12.5, SKIN.a, SKIN.b), SKIN, SKIN, noCorr).index).toBe(50);
    expect(intensityIndex(SKIN, INK, SKIN, INK, noCorr).index).toBe(0);
  });

  it("I2 톤 차이, 밴드 판정, 점수: 밴드 안 100 / 초과·좌우 차 감점 / 밴드 없음 null", () => {
    expect(toneDelta(lab(50, 0, 0), lab(42, 0, 0), lab(60, 0, 0), lab(60, 0, 0), noCorr)).toBe(-2);
    expect(toneVerdict(70, [25, 60])).toBe("TONE_OVER");
    expect(toneVerdict(10, [25, 60])).toBe("TONE_UNDER");
    expect(toneVerdict(40, [25, 60])).toBe("TONE_OK");
    expect(toneVerdict(40, null)).toBeNull();
    expect(scoreIntensity(40, 40, [25, 60])).toBe(100);
    expect(scoreIntensity(80, 80, [25, 60])).toBeLessThan(80);
    expect(scoreIntensity(30, 60, [25, 60])).toBeLessThan(100);
    expect(scoreIntensity(40, 40, null)).toBeNull();
  });

  it("I3 볼터치: 오른쪽 진함 → CHEEK_LR_DIFF_R, 너무 진함 → TONE_OVER, 없음 → 확인만", () => {
    expect(intensityResult("cheek", mk(30, 55)).codes).toContain("CHEEK_LR_DIFF_R");
    expect(intensityResult("cheek", mk(80, 80)).codes).toContain("TONE_OVER");
    expect(intensityResult("cheek", mk(40, 42)).codes).toEqual([]);
    expect(decide("cheek", intensityResult("cheek", mk(2, 1, false))).status).toBe("check_only");
  });

  it("I4 섀도우 방향 불일치 → SHADOW_DIR", () => {
    expect(intensityResult("shadow", { ...mk(40, 40), directionOk: false }).codes).toContain("SHADOW_DIR");
  });

  it("I5 쉐딩·하이라이트: 항상 확인만, 점수 null, 좌우 차가 크면 방향 코드", () => {
    const r = intensityResult("contour", mk(30, 45));
    expect(r.score).toBeNull();
    expect(r.codes).toEqual(["CONTOUR_LR_R"]);
    expect(decide("contour", r)).toMatchObject({ status: "check_only", reason: "contour" });
    expect(oneLiner("contour", decide("contour", r), r.codes)).toBe("확인하고 넘어가세요. 오른쪽이 조금 진해요");
    expect(oneLiner("contour", decide("contour", r), [])).toBe("확인하고 넘어가세요.");
    // 하이라이트도 같은 규칙으로 좌우만 본다. 점수는 여전히 없고, 쉐딩·하이라이트 한 줄씩
    const h = intensityResult("contour", { ...mk(30, 45), hi: { L: { index: 40 }, R: { index: 20 } } });
    expect(h.score).toBeNull();
    expect(h.codes).toEqual(["CONTOUR_LR_R", "CONTOUR_HI_L"]);
    expect(h.metrics.hiIndex).toEqual({ left: 40, right: 20 });
    expect(oneLiner("contour", decide("contour", h), h.codes)).toBe("확인하고 넘어가세요. 오른쪽이 조금 진해요 왼쪽 하이라이트가 조금 밝아요");
    expect(intensityResult("contour", { ...mk(30, 30), hi: { L: { index: 40 }, R: { index: 35 } } }).codes).toEqual([]);
  });

  it("I6 밴드 없는 룩 → 점수 null → 확인만(기준 없음)", () => {
    const r = intensityResult("cheek", { ...mk(40, 40), band: null });
    expect(r.score).toBeNull();
    expect(decide("cheek", r).reason).toBe("no_band");
  });
});

describe("상태·한 줄 평", () => {
  const scored = (score: number, codes: PartScore["codes"] = []): PartScore => ({ present: true, score, codes, lrIndex: null, metrics: {} });
  const unseen: PartScore = { present: false, score: null, codes: [], lrIndex: null, metrics: {} };

  it("D0 판정 근거(밝기 차·머리카락 가림·정렬 어긋남)를 결과 측정값에 같이 담는다 — 화면 5 ?tune·로그용 (2026-09-30)", () => {
    const o = toOutcome("liner", scored(80), { lightShift: 21.5, hairFrac: 0.1, alignResidual: 0.03 });
    expect(o.metrics).toMatchObject({ lightShift: 21.5, hairFrac: 0.1, alignResidual: 0.03 });
    expect(o.checkReason).toBe("lighting");
  });

  it("D1 조명 급변(이마 L* 차가 lightTol 넘음) → 확인만(조명), 그 아래면 채점, 얼굴 없음 → 확인만", () => {
    expect(decide("liner", scored(80), { lightShift: PARAMS.lightTol + 1 }).reason).toBe("lighting");
    expect(decide("liner", scored(80), { lightShift: -(PARAMS.lightTol + 1) }).reason).toBe("lighting");
    expect(decide("liner", scored(80), { lightShift: PARAMS.lightTol - 1 }).status).toBe("scored");
    expect(decide("liner", scored(80), { noFace: true }).reason).toBe("align");
  });

  it("D1b 기준 얼굴과 정렬이 크게 어긋나면(잔차 > 눈 폭의 alignMax) 확인만(align) — 그 아래면 채점 (#43)", () => {
    expect(decide("liner", scored(80), { alignResidual: PARAMS.alignMax + 0.01 })).toMatchObject({ status: "check_only", reason: "align" });
    expect(decide("liner", scored(80), { alignResidual: PARAMS.alignMax - 0.01 }).status).toBe("scored");
  });

  it("D2b 확인만 문구: '재지 못했어요' 같은 기계 말투 없이 이유 + 할 일, 리뷰용은 이유만 (폰 시험 2026-09-30)", () => {
    for (const [k, t] of Object.entries(CHECK_REASON_TEXT)) {
      expect(t, k).not.toContain("재지 못했어요");
      expect(t, k).toBe(k === "contour" ? CHECK_REASON_SHORT.contour : `${CHECK_REASON_SHORT[k as keyof typeof CHECK_REASON_SHORT]} ${CHECK_ACTION[k as keyof typeof CHECK_ACTION]}`);
    }
    // 다시 하면 되는 이유는 "다시 확인받아" 를 권한다
    for (const k of ["lighting", "occluded", "align"] as const) expect(CHECK_ACTION[k]).toContain("다시 확인받아");
    for (const t of Object.values(CHECK_REASON_SHORT)) { expect(hasDigit(t)).toBe(false); expect(t).not.toContain("다시 확인받아"); }
  });

  it("D2 한 줄 평: 모든 문구에 숫자 없음, 최대 두 문장, 코드가 없으면 '잘 됐어요'", () => {
    for (const t of Object.values(DIAG_TEXT)) expect(hasDigit(t), t).toBe(false);
    for (const t of Object.values(CHECK_REASON_TEXT)) expect(hasDigit(t), t).toBe(false);
    const d = decide("liner", scored(80));
    expect(oneLiner("liner", d, [])).toBe("잘 됐어요");
    expect(oneLiner("liner", d, ["LINER_WING_HIGH_R"])).toBe(DIAG_TEXT.LINER_WING_HIGH_R);
    expect(oneLiner("liner", d, ["LINER_THICK", "LINER_LR_DIFF", "LINER_THIN"])).toBe(`${DIAG_TEXT.LINER_THICK}. ${DIAG_TEXT.LINER_LR_DIFF}`);
    expect(oneLiner("lip", decide("lip", unseen), [])).toBe(CHECK_REASON_TEXT.faint);
  });

  it("S1 세션 반영: 점수가 낮아도 passed, 확인만은 check_only, 건너뛰기는 skipped, 다음 부위 순서", () => {
    const at = () => 1000;
    let s = applyResult(createSession(at), "brow", toOutcome("brow", scored(31, ["BROW_SPARSE"])), at);
    expect(s.parts[0]).toMatchObject({ status: "passed", score: 31, diagnosisCodes: ["BROW_SPARSE"], diagnosis: DIAG_TEXT.BROW_SPARSE });
    expect(nextPart(s, "brow")).toBe("liner");
    s = applyResult(s, "liner", toOutcome("liner", unseen), at);
    expect(s.parts[1]).toMatchObject({ status: "check_only", score: null, checkReason: "faint", diagnosis: CHECK_REASON_TEXT.faint });
    s = applySkip(s, "shadow", at);
    expect(s.parts[2]?.status).toBe("skipped");
    expect(nextPart(s, "shadow")).toBe("lip");
    s = applyResult(s, "lip", toOutcome("lip", scored(70)), at);
    s = applyResult(s, "cheek", toOutcome("cheek", scored(70)), at);
    s = applyResult(s, "contour", toOutcome("contour", intensityResult("contour", { L: { index: 30 }, R: { index: 45 }, present: true })), at);
    expect(s.parts[5]).toMatchObject({ status: "check_only", score: null, checkReason: "contour", lrIndex: { left: 30, right: 45 } });
    expect(nextPart(s, "contour")).toBeNull();
  });

  it("S2 재확인: attempts 증가, 최신 결과로 덮어쓰기", () => {
    let s = applyResult(createSession(), "brow", toOutcome("brow", scored(50)));
    s = applyResult(s, "brow", toOutcome("brow", scored(90)));
    expect(s.parts[0]).toMatchObject({ attempts: 2, score: 90 });
  });
});

describe("랜드마크 정렬", () => {
  it("A1 유사변환 복원: 크기·회전·이동을 되찾고 잔차 0", () => {
    const src: Pt[] = Array.from({ length: 20 }, (_, i) => ({ x: 100 + 37 * Math.cos(i), y: 80 + 29 * Math.sin(i * 1.3) }));
    const t = (10 * Math.PI) / 180;
    const dst = src.map((p) => ({ x: 1.2 * (p.x * Math.cos(t) - p.y * Math.sin(t)) + 30, y: 1.2 * (p.x * Math.sin(t) + p.y * Math.cos(t)) - 20 }));
    const f = similarityFit(src, dst);
    expect(f.s).toBeCloseTo(1.2, 6);
    expect(f.deg).toBeCloseTo(10, 6);
    expect(f.residual).toBeLessThan(1e-6);
  });

  it("A2 기준 정렬: 화장으로 입술 랜드마크가 밀려도 정렬값은 기준 기하를 유지 → 밀린 만큼 편향으로 측정", () => {
    const base: Pt[] = Array.from({ length: 478 }, (_, i) => ({ x: 200 + (i % 30) * 7, y: 150 + Math.floor(i / 30) * 9, z: 0 }));
    const cur = base.map((p) => ({ ...p, x: p.x + 12, y: p.y + 3 }));   // 얼굴 전체 이동 (안정 점 포함)
    const lips = [61, 291, 0, 17];
    for (const i of lips) cur[i] = { ...cur[i]!, y: cur[i]!.y + 5 };      // 화장 편향
    const { lm, fit } = alignToBaseline(base, cur);
    expect(fit.residual).toBeLessThan(1e-6);
    expect(lm[61]!.y).toBeCloseTo(base[61]!.y + 3, 6);
    expect(makeupBiasPx(lm, cur, lips)).toBeCloseTo(5, 6);
    expect((STABLE_IDS as readonly number[]).includes(61)).toBe(false);
  });
});
