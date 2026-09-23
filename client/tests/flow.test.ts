// 촬영 게이트·세션 검증 — poc/full/tests.mjs 의 F1·S1~S5·P1~P3 를 vitest 로 옮김 (이슈 #9, 1-1)
import { describe, expect, it } from "vitest";
import {
  CAPTURE_GUIDE,
  FACE_SHAPE_BURST,
  PART_ORDER,
  SCREENS,
  SERVER_SHOTS,
  SHOTS,
  allDone,
  applyResult,
  applySkip,
  burstShot,
  burstStep,
  createSession,
  nextPart,
  nextShot,
  setCurrentPart,
  shotGate,
  startBurst,
  stripImages,
  toReviewParts,
} from "@core/flow";
import type { ScoreOutcome, Session, ShotMeasure } from "@core/flow";
import type { Baseline } from "@core/types";
import { LOOK_PART_IDS } from "@core/types";

const OK: ShotMeasure = {
  faceDetected: true,
  yaw: 0,
  pitch: 0,
  closedA: false,
  closedB: false,
  faceRatio: 0.5,
  sharpness: 400,
  foreheadL: 70,
  baselineL: 70,
  stableCount: 5,
};

const scored = (score: number, extra: Partial<ScoreOutcome> = {}): ScoreOutcome => ({
  decision: "scored",
  score,
  diagnosisCodes: [],
  diagnosis: "",
  checkReason: null,
  lrIndex: null,
  metrics: {},
  ...extra,
});

describe("F1 화면·부위 순서", () => {
  it("화면 순서 11개, 부위 순서 = 룩 5부위 + 쉐딩", () => {
    expect(SCREENS).toHaveLength(11);
    expect(PART_ORDER).toEqual([...LOOK_PART_IDS, "contour"]);
  });
});

describe("S 촬영 4장 게이트", () => {
  it("S1 촬영 4장 정의, 서버 전송 3장(눈 감음 제외)", () => {
    expect(SHOTS.map((s) => s.id)).toEqual(["front_open", "front_closed", "left_45", "right_45"]);
    expect(SERVER_SHOTS).toEqual(["front_open", "left_45", "right_45"]);
  });

  it("S2 정면 눈 뜸: 전부 맞으면 '찍을게요'", () => {
    const g = shotGate("front_open", OK);
    expect(g.ok).toBe(true);
    expect(g.firstFail).toBeNull();
    expect(g.text).toBe("찍을게요");
  });

  it("S3 촬영 조건 순서: 얼굴(문구 없음) → 각도 → 눈 → 크기 → 선명 → 밝기 → 안정, 하나만", () => {
    expect(shotGate("front_open", { ...OK, faceDetected: false })).toMatchObject({ ok: false, firstFail: "face", text: "" });
    expect(shotGate("front_open", { ...OK, faceInset: -0.02, yaw: 20 })).toMatchObject({ firstFail: "visible", text: "얼굴이 잘려요. 얼굴 전체가 보이게 해 주세요" });
    expect(shotGate("front_open", { ...OK, faceInset: 0.01 })).toMatchObject({ firstFail: "visible" });
    expect(shotGate("front_open", { ...OK, faceInset: 0.05 }).ok).toBe(true);
    expect(shotGate("front_open", { ...OK, yaw: 20, closedA: true, closedB: true, faceRatio: 0.1 })).toMatchObject({ firstFail: "angle", text: "조금만 정면으로" });
    expect(shotGate("front_open", { ...OK, closedA: true, closedB: true, faceRatio: 0.1 })).toMatchObject({ firstFail: "eyes", text: "눈을 떠 주세요" });
    expect(shotGate("front_closed", { ...OK, faceRatio: 0.1 })).toMatchObject({ firstFail: "eyes", text: "눈을 감아 주세요" });
    expect(shotGate("front_open", { ...OK, faceRatio: 0.1, sharpness: 1 })).toMatchObject({ firstFail: "size", text: "조금 더 가까이" });
    expect(shotGate("front_open", { ...OK, faceRatio: 0.9 })).toMatchObject({ firstFail: "size", text: "조금 멀리" });
    expect(shotGate("front_open", { ...OK, sharpness: 1, foreheadL: 20 })).toMatchObject({ firstFail: "sharp", text: "흔들려요. 잠시 멈춰 주세요" });
    expect(shotGate("front_open", { ...OK, foreheadL: 40 })).toMatchObject({ firstFail: "bright", text: "조금 더 밝은 곳으로" });
    expect(shotGate("front_open", { ...OK, foreheadL: 100 })).toMatchObject({ firstFail: "bright", text: "너무 밝아요. 조금 어두운 곳으로" });
    expect(shotGate("front_open", { ...OK, stableCount: 1 })).toMatchObject({ firstFail: "stable", text: "잠시만 그대로", stableCount: 1 });
  });

  it("S3b 고개를 위아래로 너무 들면 각도 조건", () => {
    expect(shotGate("front_open", { ...OK, pitch: 20 })).toMatchObject({ firstFail: "angle", text: "조금만 정면으로" });
  });

  it("S4 45° 장: 덜 돌리면 '더', 너무 돌리면 '돌아오세요'", () => {
    expect(shotGate("left_45", { ...OK, yaw: -5 }).text).toBe("고개를 왼쪽으로 조금 더");
    expect(shotGate("left_45", { ...OK, yaw: -70 }).text).toBe("너무 돌렸어요. 조금만 돌아오세요");
    expect(shotGate("left_45", { ...OK, yaw: -40 }).ok).toBe(true);
    expect(shotGate("right_45", { ...OK, yaw: 5 }).text).toBe("고개를 오른쪽으로 조금 더");
    expect(shotGate("right_45", { ...OK, yaw: 70 }).text).toBe("너무 돌렸어요. 조금만 돌아오세요");
    expect(shotGate("right_45", { ...OK, yaw: 40 }).ok).toBe(true);
  });

  it("S5 문구에 숫자 없음, 다음 장 계산·틀린 장만 다시", () => {
    for (const m of [{ ...OK, yaw: 30 }, { ...OK, closedA: true, closedB: true }, { ...OK, faceRatio: 0.1 }]) {
      expect(/\d/.test(shotGate("front_open", m).text)).toBe(false);
    }
    const shots: Session["shots"] = { front_open: 1, front_closed: 1 };
    expect(nextShot(shots)).toBe("left_45");
    delete shots.front_open;
    expect(nextShot(shots)).toBe("front_open");
    expect(nextShot({ front_open: 1, front_closed: 1, left_45: 1, right_45: 1 })).toBeNull();
  });

  it("S7 색 조건(1-9): 첫 장 대비 이마 a*b* 가 임계보다 돌면 '조명 색이 바뀌었어요', 기준이 없으면 생략", () => {
    const warm = { ...OK, foreheadAb: { a: 12, b: 20 }, baselineAb: { a: 10, b: 12 } };   // 거리 ≈ 8.2 > 6
    expect(shotGate("front_open", warm)).toMatchObject({ firstFail: "color", text: "조명 색이 바뀌었어요. 처음 자리에서 찍어 주세요" });
    expect(shotGate("front_open", { ...OK, foreheadAb: { a: 11, b: 13 }, baselineAb: { a: 10, b: 12 } }).ok).toBe(true);
    expect(shotGate("front_open", { ...OK, foreheadAb: { a: 30, b: 30 } }).ok).toBe(true);
    // 밝기가 먼저 걸리면 색은 안 본다 (순서)
    expect(shotGate("front_open", { ...warm, foreheadL: 40 }).firstFail).toBe("bright");
    expect(/\d/.test(shotGate("front_open", warm).text)).toBe(false);
  });

  it("S9 촬영 안내: 동의 뒤 이마·양쪽 귀가 다 보이게, 숫자 없음", () => {
    const all = [CAPTURE_GUIDE.title, ...CAPTURE_GUIDE.lines, CAPTURE_GUIDE.button];
    expect(CAPTURE_GUIDE.lines.some((t) => t.includes("이마"))).toBe(true);
    expect(CAPTURE_GUIDE.lines.some((t) => t.includes("귀"))).toBe(true);
    expect(CAPTURE_GUIDE.lines.some((t) => t.includes("안경"))).toBe(true);
    for (const t of all) expect(/\d/.test(t), t).toBe(false);
  });

  it("S8 깨진 측정값(NaN·Infinity)은 어느 칸이든 찍지 않는다 — 얼굴을 못 잰 것으로", () => {
    const broken: Partial<ShotMeasure>[] = [
      { yaw: NaN }, { pitch: NaN }, { yaw: Infinity }, { faceRatio: NaN }, { faceInset: NaN }, { sharpness: NaN },
      { foreheadL: NaN }, { baselineL: -Infinity }, { stableCount: NaN },
      { foreheadAb: { a: NaN, b: 0 }, baselineAb: { a: 0, b: 0 } }, { foreheadAb: { a: 0, b: 0 }, baselineAb: { a: 0, b: Infinity } },
    ];
    for (const b of broken) {
      expect(shotGate("front_open", { ...OK, ...b } as ShotMeasure), JSON.stringify(b)).toMatchObject({ ok: false, firstFail: "face", text: "" });
    }
    // 없는 항목(undefined)은 그대로 건너뛴다
    const { sharpness: _s, faceRatio: _r, ...partial } = OK;
    expect(shotGate("front_open", partial).ok).toBe(true);
  });

  it("S10 정의서 기준(impl-screen1-5 1-2): 눈 폭 80px 미만은 '조금 더 가까이', 이마 L* 40~85 밖은 첫 장부터 막음, 선명 150 미만은 흔들림", () => {
    expect(shotGate("front_open", { ...OK, eyeWidthPx: 79.9 })).toMatchObject({ firstFail: "size", text: "조금 더 가까이" });
    expect(shotGate("front_open", { ...OK, eyeWidthPx: 80 }).ok).toBe(true);
    // 얼굴 비율은 맞아도 눈 폭이 작으면 막는다 (저해상도 프레임)
    expect(shotGate("front_open", { ...OK, faceRatio: 0.39, eyeWidthPx: 55 }).firstFail).toBe("size");
    const { baselineL: _b, ...first } = OK;
    expect(shotGate("front_open", { ...first, foreheadL: 12.3 })).toMatchObject({ firstFail: "bright", text: "조금 더 밝은 곳으로" });
    expect(shotGate("front_open", { ...first, foreheadL: 39.9 }).firstFail).toBe("bright");
    expect(shotGate("front_open", { ...first, foreheadL: 40 }).ok).toBe(true);
    expect(shotGate("front_open", { ...first, foreheadL: 85.1 })).toMatchObject({ firstFail: "bright", text: "너무 밝아요. 조금 어두운 곳으로" });
    expect(shotGate("front_open", { ...OK, sharpness: 101 }).firstFail).toBe("sharp");   // Android 흔들기 하위 10%
    expect(shotGate("front_open", { ...OK, sharpness: 241 }).ok).toBe(true);              // Android 가만히 최소
    expect(shotGate("front_open", { ...OK, eyeWidthPx: NaN }).firstFail).toBe("face");
  });

  it("S11 얼굴형 프레임: 첫 장 셔터 전 정면 통과 프레임을 0.15초 간격으로 최근 5장만, 다 차 있으면 셔터 순간 끝", () => {
    expect(FACE_SHAPE_BURST).toEqual({ count: 5, minGapMs: 150, afterShotMs: 1500 });
    let b = startBurst();
    const kept: number[] = [];
    // 30fps 로 2초 동안 정면 유지 (1.1~1.3초는 고개 돌림 → 안 모음)
    for (let t = 0; t < 2000; t += 33) {
      const r = burstStep(b, t, !(t > 1100 && t < 1300));
      b = r.state;
      if (r.dropOldest) kept.shift();
      if (r.take) kept.push(t);
    }
    expect(kept).toHaveLength(5);                     // 최근 5장만
    expect(kept[0]!).toBeGreaterThan(1000);           // 오래된 건 버려졌다
    expect(kept.every((t) => !(t > 1100 && t < 1300))).toBe(true);
    for (let i = 1; i < kept.length; i++) expect(kept[i]! - kept[i - 1]!).toBeGreaterThanOrEqual(150);
    expect(b.done).toBe(false);                       // 셔터 전에는 안 끝난다
    b = burstShot(b, 2000);
    expect(b.done).toBe(true);                        // 이미 5장 → 기다림 없음
    expect(burstStep(b, 2100, true).take).toBe(false);
  });

  it("S11b 셔터 순간 모자라면 셔터 뒤 1.5초만 더 모으고, 그래도 모자라면 모은 만큼", () => {
    let b = startBurst();
    b = burstStep(b, 0, true).state;
    b = burstStep(b, 200, true).state;
    b = burstShot(b, 300);
    expect(b.done).toBe(false);
    b = burstStep(b, 400, true).state;
    b = burstStep(b, 600, true).state;
    let r = burstStep(b, 800, true);
    expect(r.dropOldest).toBe(false);                 // 셔터 뒤에는 버리지 않는다
    expect(r.state).toMatchObject({ done: true });    // 5장 참
    expect(r.state.taken).toHaveLength(5);
    // 셔터 뒤 계속 실패 → 1.5초에 2장으로 끝
    let c = burstStep(startBurst(), 0, true).state;
    c = burstStep(c, 200, true).state;
    c = burstShot(c, 300);
    for (let t = 333; t < 1800; t += 33) c = burstStep(c, t, false).state;
    expect(c.done).toBe(false);
    r = burstStep(c, 1800, true);
    expect(r.state).toMatchObject({ done: true });
    expect(r.take).toBe(false);
    expect(r.state.taken).toHaveLength(2);
  });

  it("S12 얼굴형 사진은 draft 에 장수만 남는다 (사진 없음)", () => {
    const s = createSession();
    s.faceShapeFrames.push({ canvas: {} }, { canvas: {} });
    const d = JSON.parse(JSON.stringify(stripImages(s))) as ReturnType<typeof stripImages>;
    expect(d.faceShapeFrames).toBe(2);
  });

  it("S6 밝기 기준(baselineL)이 없으면 밝기 조건을 건너뛴다 (첫 장)", () => {
    const noBase: ShotMeasure = { faceDetected: true, yaw: 0, pitch: 0, closedA: false, closedB: false, faceRatio: 0.5, sharpness: 400, foreheadL: 50, stableCount: 5 };
    expect(shotGate("front_open", noBase).ok).toBe(true);
  });
});

describe("P 세션", () => {
  it("P1 부위 진행, 결과 반영(점수 낮아도 passed), 쉐딩은 확인만, 건너뛰기, 전부 끝", () => {
    let s = createSession(() => 100);
    expect(s.screen).toBe("consent");
    expect(s.parts).toHaveLength(6);
    expect(s.startedAt).toBe(100);

    s = setCurrentPart(s, "brow");
    expect(s.parts[0]!.status).toBe("in_progress");

    s = applyResult(s, "brow", scored(31, { diagnosisCodes: ["BROW_SPARSE"], diagnosis: "x" }), () => 200);
    expect(s.parts[0]).toMatchObject({ status: "passed", score: 31, attempts: 1, updatedAt: 200 });
    expect(nextPart(s, "brow")).toBe("liner");

    s = applyResult(setCurrentPart(s, "liner"), "liner", {
      ...scored(0),
      decision: "check_only",
      score: null,
      checkReason: "faint",
      diagnosis: "색이 옅어서 재지 못했어요",
    });
    expect(s.parts[1]).toMatchObject({ status: "check_only", score: null, checkReason: "faint" });

    s = applySkip(s, "shadow");
    expect(s.parts[2]!.status).toBe("skipped");
    expect(nextPart(s, "shadow")).toBe("lip");

    s = applyResult(s, "lip", scored(80, { diagnosis: "잘 됐어요" }));
    s = applyResult(s, "cheek", scored(70, { diagnosisCodes: ["CHEEK_LR_DIFF_R"], diagnosis: "오른쪽이 조금 진해요", lrIndex: { left: 30, right: 55 } }));
    expect(allDone(s)).toBe(false);

    s = applyResult(s, "contour", scored(99, { diagnosisCodes: ["CONTOUR_LR_R"], diagnosis: "확인하고 넘어가세요. 오른쪽이 조금 진해요", lrIndex: { left: 20, right: 40 } }));
    expect(s.parts[5]).toMatchObject({ status: "check_only", score: null });
    expect(allDone(s)).toBe(true);
    expect(nextPart(s, "contour")).toBeNull();

    // 화면 6 입력: 계약 PartResult[] (사진 없음). 합산 자체는 ③ 이 review.ts 를 옮길 때 검증
    const review = toReviewParts(s);
    expect(review).toHaveLength(6);
    expect(review.filter((p) => p.status === "passed" && p.score !== null)).toHaveLength(3);
    expect(review[5]!.diagnosis).toBe("확인하고 넘어가세요. 오른쪽이 조금 진해요");
    expect(review[1]!.diagnosis).toBe("색이 옅어서 재지 못했어요");
    expect(Object.keys(review[0]!)).not.toContain("captured");
  });

  it("P1b 진행 칩 이동: 결과 난 부위로 돌아가도 in_progress 로 되돌리지 않고, 보던 부위를 떠나면 미시작으로", () => {
    let s = applyResult(setCurrentPart(createSession(), "brow"), "brow", scored(50));
    s = setCurrentPart(s, "liner");
    expect(s.parts[1]!.status).toBe("in_progress");
    s = setCurrentPart(s, "brow");
    expect(s.parts[0]!.status).toBe("passed");
    expect(s.parts[1]!.status).toBe("not_started");
  });

  it("P2 재확인: 덮어쓰기 + attempts 증가", () => {
    let s = applyResult(createSession(), "brow", scored(50));
    s = applyResult(s, "brow", scored(90));
    expect(s.parts[0]).toMatchObject({ attempts: 2, score: 90 });
  });

  it("P3 draft 저장 형식: 이미지·랜드마크 제외, JSON 왕복", () => {
    const s = createSession();
    s.shots.front_open = { canvas: {} };
    const baseline: Baseline = {
      lm: [{ x: 1, y: 2 }],
      unit: { eye: 130, lip: 220, face: 620 },
      foreheadL: 66,
      scleraLab: null,
      faceShape: { label: "oval", confidence: 0.5, method: "rule", version: "faceshape-rule-v1" },
      bareImage: null,
      w: 1080,
      h: 1920,
    };
    s.baseline = baseline;
    s.parts[0]!.captured = { canvas: {} };

    const d = JSON.parse(JSON.stringify(stripImages(s))) as ReturnType<typeof stripImages>;
    expect(d.shots.front_open).toBe(true);
    expect(d.baseline?.foreheadL).toBe(66);
    expect(d.baseline?.unit.eye).toBe(130);
    expect(d.baseline).not.toHaveProperty("lm");
    expect(d.baseline).not.toHaveProperty("bareImage");
    expect(d.parts[0]!.captured).toBe(true);
  });

  it("P4 상태 전이는 원본 세션을 바꾸지 않는다 (불변)", () => {
    const s0 = createSession();
    const s1 = setCurrentPart(s0, "brow");
    const s2 = applyResult(s1, "brow", scored(10));
    expect(s0.parts[0]!.status).toBe("not_started");
    expect(s1.parts[0]!.status).toBe("in_progress");
    expect(s2.parts[0]!.status).toBe("passed");
  });
});
