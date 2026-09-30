// 세션 복원 규칙 (1-11, F-07): draft → 어느 화면으로, 무엇을 되살리나
import { describe, expect, it } from "vitest";
import { applyResult, createSession, setCurrentPart, setPlan, setScreen, stripImages, withBaseline, type Session } from "@core/flow";
import type { PersonalPlan } from "@core/personalize";
import { planRestore, rebuildBaseline, toCapture } from "@core/restore";
import type { Baseline } from "@core/types";

const faceShape: Baseline["faceShape"] = { label: "oval", confidence: 0, method: "rule", version: "none" };
const baseline: Baseline = {
  lm: [{ x: 1, y: 2 }], unit: { eye: 130, lip: 220, face: 620 }, foreheadL: 66,
  scleraLab: { a: 1, b: 2 }, faceShape, bareImage: null, w: 1080, h: 1920, expression: { jawOpen: 0.1 },
};
const roundTrip = (s: Session) => JSON.parse(JSON.stringify(stripImages(s))) as ReturnType<typeof stripImages>;

function afterCapture(): Session {
  let s: Session = { ...createSession(() => 1000), consent: true, baseline, lookId: "daily" };
  s.shots = { front_open: {}, front_closed: {}, left_45: {}, right_45: {} };
  s = setCurrentPart(setScreen(s, "live"), "liner");
  s = applyResult(s, "brow", { decision: "scored", score: 80, diagnosisCodes: [], diagnosis: "", checkReason: null, lrIndex: null, metrics: {} });
  s.parts[1]!.captured = { canvas: {} };
  return s;
}

describe("planRestore", () => {
  it("R1 draft 가 없거나(만료 포함) 동의 전·거부·끝이면 새로 시작", () => {
    expect(planRestore(null).kind).toBe("fresh");
    expect(planRestore(roundTrip(createSession())).kind).toBe("fresh");
    expect(planRestore(roundTrip({ ...createSession(), consent: false, screen: "denied" })).kind).toBe("fresh");
    expect(planRestore(roundTrip({ ...afterCapture(), screen: "done" })).kind).toBe("fresh");
  });

  it("R2 촬영 도중이면 촬영 화면으로, 동의는 유지하고 장은 처음부터 (사진은 draft 에 없다)", () => {
    const s = { ...createSession(() => 500), consent: true, screen: "capture" as const, shots: { front_open: {} } };
    const p = planRestore(roundTrip(s), () => 9000);
    expect(p.kind).toBe("capture");
    if (p.kind !== "capture") return;
    expect(p.session).toMatchObject({ screen: "capture", consent: true, shots: {}, baseline: null, startedAt: 500 });
    expect(p.lostShots).toBe(1);   // 찍어 둔 1장을 잃었다 → restore ok=false
  });

  it("R3 촬영 뒤면 같은 화면·같은 부위, 점수는 남고 확인받기 사진만 빠진다", () => {
    const p = planRestore(roundTrip(afterCapture()));
    expect(p.kind).toBe("resume");
    if (p.kind !== "resume") return;
    expect(p.session).toMatchObject({ screen: "live", currentPart: "liner", lookId: "daily", consent: true, startedAt: 1000 });
    expect(p.session.parts[0]).toMatchObject({ partId: "brow", status: "passed", score: 80 });
    expect(p.session.parts.every((x) => x.captured === null)).toBe(true);
    expect(Object.keys(p.session.shots)).toHaveLength(4);
    expect(p.session.baseline).toBeNull();   // 랜드마크는 쌩얼 사진에서 다시 찾는다
    expect(p.baseline).toMatchObject({ foreheadL: 66, unit: { eye: 130 } });
  });

  it("R4 촬영 뒤 화면인데 기준이 없으면 촬영부터", () => {
    const p = planRestore(roundTrip({ ...afterCapture(), baseline: null }));
    expect(p.kind).toBe("capture");
  });

  it("R4b 예전 draft(baseline.w·h 없음)면 랜드마크를 되돌릴 수 없어 촬영부터", () => {
    const d = roundTrip(afterCapture());
    const old = { ...d, baseline: { ...d.baseline!, w: undefined as unknown as number, h: undefined as unknown as number } };
    const p = planRestore(JSON.parse(JSON.stringify(old)) as typeof d);
    expect(p.kind).toBe("capture");
    if (p.kind === "capture") expect(p.lostShots).toBe(4);
  });

  it("R5 rebuildBaseline 은 저장된 척도를 그대로 쓰고 랜드마크만 새로 (촬영 크기로 되돌려)", () => {
    // 촬영 1080×1920 → 저장 사진 576×1024: 찾은 점을 촬영 크기로 되돌린다
    const b = rebuildBaseline(roundTrip(afterCapture()).baseline!, { lm: [{ x: 288, y: 512 }], w: 576, h: 1024 }, null);
    expect(b).toMatchObject({ lm: [{ x: 540, y: 960 }], unit: { eye: 130, lip: 220, face: 620 }, foreheadL: 66, scleraLab: { a: 1, b: 2 }, w: 1080, h: 1920 });
  });

  it("R5b 표정(expression)은 draft 에 없고, 복원 때 쌩얼 사진에서 다시 잰 값으로 채운다 (#177)", () => {
    const d = roundTrip(afterCapture());
    expect(d.baseline).not.toHaveProperty("expression");
    const withExpr = rebuildBaseline(d.baseline!, { lm: [{ x: 1, y: 1 }], w: 1080, h: 1920, expression: { jawOpen: 0.3 } }, null);
    expect(withExpr.expression).toEqual({ jawOpen: 0.3 });
    const none = rebuildBaseline(d.baseline!, { lm: [{ x: 1, y: 1 }], w: 1080, h: 1920 }, null);
    expect(none.expression).toBeNull();   // 못 쟀으면 null → 화면 4 표정 조건 생략
  });

  it("R7 화장별 개인화 계획(#181)은 draft 에 남고 복원 때 그대로 돌아온다 · 예전 draft 면 빈 값", () => {
    const plan = { liner: { style: "winged" } } as unknown as PersonalPlan;
    const s = setPlan(afterCapture(), "daily", plan);
    const d = roundTrip(s);
    expect(d.plans).toEqual({ daily: plan });
    const p = planRestore(d);
    expect(p.kind).toBe("resume");
    if (p.kind === "resume") expect(p.session.plans).toEqual({ daily: plan });
    const { plans: _drop, ...old } = d;
    const q = planRestore(old as typeof d);
    if (q.kind === "resume") expect(q.session.plans).toEqual({});
  });

  it("R8 얼굴이 바뀌면(정면 다시 찍기) 계획을 비우고, 쌩얼 사진만 붙는 갱신은 그대로 둔다 (#181)", () => {
    const plan = { liner: { style: "extend" } } as unknown as PersonalPlan;
    const s = setPlan(afterCapture(), "daily", plan);
    expect(withBaseline(s, { ...s.baseline!, bareImage: null }).plans).toEqual({ daily: plan });   // 같은 lm
    expect(withBaseline(s, { ...s.baseline!, lm: [{ x: 9, y: 9 }] }).plans).toEqual({});           // 새 얼굴
    expect(createSession().plans).toEqual({});
  });

  it("R6 toCapture 는 동의를 두고 촬영 화면 새 세션", () => {
    const s = toCapture(afterCapture());
    expect(s).toMatchObject({ screen: "capture", consent: true, baseline: null, lookId: null, shots: {}, startedAt: 1000 });
  });
});
