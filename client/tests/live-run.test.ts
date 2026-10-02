// 화면 4 진행 (2-1 넷째 조각, #21) 검증 — 카메라 없이 프레임 측정값만 넣는다
// 프레임마다: 게이트 한 줄 · 가이드 테두리 · (확인받기 뒤) 묶음 모으기
import { describe, expect, it } from "vitest";
import { FAR_FADE, createLiveRun, type LiveFrame } from "@core/live-run";
import { GATE_TEXT, LIVE_LIMITS, RIGID_POSE, poseOf } from "@core/gate";
import { linerOutline, lookGuide } from "@core/guides";
import type { GuideSource } from "@core/score-part";
import { unitScale } from "@core/baseline";
import { LM } from "@core/landmarks";
import type { Lab } from "@core/color";
import type { Pt } from "@core/types";
import { LMS, W, H } from "./helpers/synth-face";
import { LandmarkSmoother } from "@core/smoothing";
import { LIVE_SMOOTH } from "@core/smooth-params";

// 합성 얼굴은 턱(152)이 가운데라 고개를 숙인 것으로 잰다 → 턱을 내려 정면으로
const FACE: Pt[] = LMS.map((p, i) => (i === LM.chin ? { x: 300, y: 464 } : p));
const SKIN: Lab = { L: 62, a: 12, b: 16 };
const HAND: Lab = { L: 30, a: 20, b: 30 };   // 이마 ΔE 약 38 — 가림으로 잡힌다

const run = (part: "liner" | "lip" = "liner", guide: GuideSource = lookGuide({})) =>
  createLiveRun<string>({ partId: part, baseline: { lm: FACE, foreheadL: SKIN.L }, guide });

let clock = 0;
const frame = (over: Partial<LiveFrame<string>> = {}): LiveFrame<string> => {
  clock += 33;
  const t = clock;
  return { t, lm: FACE, w: W, h: H, sharpness: 400, lab: SKIN, image: () => `img${t}`, ...over };
};

/** 테두리는 그물에 붙였다 옮긴 점이라 소수점 끝자리까지는 같지 않다 — 1e-6 px 안이면 같은 점 */
const near = (a: Pt, b: Pt): boolean => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;
const samePolys = (got: readonly (readonly Pt[])[], want: readonly (readonly Pt[])[]): void => {
  expect(got.map((s) => s.length)).toEqual(want.map((s) => s.length));
  got.forEach((s, i) => s.forEach((p, j) => expect(near(p, want[i]![j]!), `${i}:${j} ${JSON.stringify(p)} ≠ ${JSON.stringify(want[i]![j])}`).toBe(true)));
};

/** 코끝이 이미지 오른쪽으로 눈꼬리 거리의 f 배 — 0.11 이면 강체 yaw 약 13.6° (차 한계 12°, 정면 한계 15° 안), 0.13 이면 약 16° (정면 한계도 넘음) */
const turnedFace = (f: number): Pt[] => {
  const D = Math.hypot(FACE[LM.eyeB.outer]!.x - FACE[LM.eyeA.outer]!.x, FACE[LM.eyeB.outer]!.y - FACE[LM.eyeA.outer]!.y);
  return FACE.map((p, i) => (i === 1 || i === 4 ? { x: p.x + D * f, y: p.y } : p));
};

describe("live run", () => {
  it("L1 얼굴이 없으면 테두리도 문구도 없다 (정의서 3-9)", () => {
    const r = run().step(frame({ lm: null }));
    expect(r.outline).toBeNull();
    expect(r.gate.firstFail).toBe("face");
    expect(r.gate.text).toBe("");
  });

  it("L2 다 맞는 프레임 2개째에 '확인받을 준비 됨' (#235, 5 에서 완화), 테두리는 첫 프레임부터", () => {
    const lr = run();
    const oks: boolean[] = [];
    for (let i = 0; i < 5; i++) {
      const r = lr.step(frame());
      expect(r.outline).not.toBeNull();
      oks.push(r.gate.ok);
    }
    expect(oks).toEqual([false, true, true, true, true]);
  });

  it("L3 라이너 테두리 = 두께 윤곽(linerOutline) 좌우 두 다각형", () => {
    const r = run("liner").step(frame());
    const want = linerOutline({ lm: FACE, unit: unitScale(FACE) }, 0.045);
    samePolys(r.outline!.polys, [want.R, want.L]);
  });

  it("L4 입술 테두리 = 입술 바깥 윤곽", () => {
    const r = run("lip").step(frame());
    samePolys(r.outline!.polys, [LM.lipsOuter.map((i) => FACE[i]!)]);
  });

  it("L5 게이트를 통과하기 전에는 확인받기가 안 눌린다", () => {
    const lr = run();
    lr.step(frame());
    expect(lr.press()).toBe(false);
  });

  it("L6 통과 뒤 누르면 다음 프레임부터 5장을 모아 묶음을 낸다", () => {
    const lr = run();
    for (let i = 0; i < 5; i++) lr.step(frame());
    expect(lr.press()).toBe(true);
    const states = [];
    for (let i = 0; i < 5; i++) states.push(lr.step(frame()).bundle);
    expect(states.slice(0, 4).map((s) => s?.status)).toEqual(["collecting", "collecting", "collecting", "collecting"]);
    const last = states[4]!;
    expect(last.status).toBe("done");
    if (last.status !== "done") return;
    expect(last.bundle.frames).toHaveLength(5);
    expect(last.bundle.foreheadL).toEqual([62, 62, 62, 62, 62]);
    expect(last.bundle.handOverlap).toEqual([false, false, false, false, false]);
  });

  it("L7 모으는 중 가려진 장은 빼지 않고 handOverlap=true 로 표시한다 (채점 #165 가 뺀다)", () => {
    const lr = run();
    for (let i = 0; i < 5; i++) lr.step(frame());
    lr.press();
    const labs = [SKIN, SKIN, HAND, HAND, HAND];
    let last = null;
    for (const lab of labs) last = lr.step(frame({ lab })).bundle;
    expect(last?.status).toBe("done");
    if (last?.status !== "done") return;
    expect(last.bundle.handOverlap).toEqual([false, false, true, true, true]);
  });

  it("L8 가림은 게이트에서도 막는다", () => {
    const lr = run();
    lr.step(frame());
    const r = lr.step(frame({ lab: HAND }));
    expect(r.gate.text).toBe("얼굴을 가리지 말아 주세요");
  });

  it("L9 모으다 얼굴을 잃으면 실패 — 다시 통과해야 누를 수 있다", () => {
    const lr = run();
    for (let i = 0; i < 5; i++) lr.step(frame());
    lr.press();
    let last = null;
    for (let i = 0; i < 20 && last?.status !== "failed"; i++) last = lr.step(frame({ lm: null })).bundle;
    expect(last?.status).toBe("failed");
    expect(lr.press()).toBe(false);
    for (let i = 0; i < 5; i++) lr.step(frame());
    expect(lr.press()).toBe(true);
  });

  it("L10 묶음을 낸 뒤에는 더 모으지 않는다 (한 번 누르면 한 묶음)", () => {
    const lr = run();
    for (let i = 0; i < 5; i++) lr.step(frame());
    lr.press();
    for (let i = 0; i < 5; i++) lr.step(frame());
    expect(lr.step(frame()).bundle).toBeNull();
  });

  it("L11 이미지는 모을 때만 꺼낸다 (프레임마다 복사하지 않는다)", () => {
    let grabs = 0;
    const lr = run();
    for (let i = 0; i < 5; i++) lr.step(frame({ image: () => `g${++grabs}` }));
    expect(grabs).toBe(0);
    lr.press();
    lr.step(frame({ image: () => `g${++grabs}` }));
    expect(grabs).toBe(1);
  });
  it("L12 묶음을 낸 직후에는 다시 안정 프레임 수만큼 통과해야 누를 수 있다 (연달아 두 번 찍히지 않게)", () => {
    const lr = run();
    for (let i = 0; i < 5; i++) lr.step(frame());
    lr.press();
    for (let i = 0; i < 5; i++) lr.step(frame());
    lr.step(frame());
    expect(lr.press()).toBe(false);
    lr.step(frame());
    expect(lr.press()).toBe(true);
  });

  it("L13 부위 점이 화면 밖으로 잘리면 게이트가 막는다", () => {
    const cut = FACE.map((p, i) => (i === LM.lipsOuter[0] ? { ...p, x: 2 } : p));
    const r = run("lip").step(frame({ lm: cut }));
    expect(r.gate.firstFail).toBe("visible");
  });

  it("L14 화면에 실제로 보이는 영역(view) 밖이면 안 보인다 — object-fit cover 로 양옆이 잘릴 때", () => {
    // 입술 가장 왼쪽 점이 x=240. 보이는 영역을 x 250~ 로 자르면 입술이 잘린다
    const r = run("lip").step(frame({ view: { x: 250, y: 0, w: 350, h: H } }));
    expect(r.gate.firstFail).toBe("visible");
    expect(run("lip").step(frame({ view: { x: 0, y: 0, w: W, h: H } })).gate.firstFail).not.toBe("visible");
  });

  it("L15 테두리는 넘겨받은 가이드를 따른다 — 라이너 두께·꼬리 끝 (⑥ 개인화 계획이 꽂히는 자리)", () => {
    const tipR = { x: 150, y: 200 }, tipL = { x: 450, y: 200 };
    const custom: GuideSource = (p, f) => (p === "liner"
      ? { liner: { wing: { R: [FACE[LM.eyeA.outer]!, tipR], L: [FACE[LM.eyeB.outer]!, tipL] }, thick: 0.08 } }
      : lookGuide({})(p, f));
    const o = run("liner", custom).step(frame()).outline!;
    expect(o.polys[0]!.some((p) => near(p, tipR))).toBe(true);
    expect(o.polys[1]!.some((p) => near(p, tipL))).toBe(true);
    const want = linerOutline({ lm: FACE, unit: unitScale(FACE) }, 0.08, { R: [FACE[LM.eyeA.outer]!, tipR], L: [FACE[LM.eyeB.outer]!, tipL] });
    samePolys(o.polys, [want.R, want.L]);
  });

  // LIVE_SMOOTH(10 · 1 · 5)는 따라오기 우선이라 거의 끈 것에 가깝다 — 번갈아 ±3px 떨림 폭: 끔 6 · LIVE 5.3 · 2-b 값 2.9 · ④ 기본 1.7.
  // PC 웹캠은 점 떨림이 작아 이 값에서도 선이 안 떨렸다(2026-10-01). 폰에서 떨리면 값을 내린다 (#235 · #244)
  it("L16 테두리는 One-Euro 를 거친다 — 가만히 있는데 점이 떨리면 선은 끈 것보다 덜 떨린다 (#23)", () => {
    const jittered = (i: number) => FACE.map((p) => ({ x: p.x + (i % 2 ? 3 : -3), y: p.y }));
    const spread = (smooth: boolean) => {
      const lr = createLiveRun<string>({ partId: "lip", baseline: { lm: FACE, foreheadL: SKIN.L }, guide: lookGuide({}), smooth });
      const xs: number[] = [];
      for (let i = 0; i < 60; i++) xs.push(lr.step(frame({ lm: jittered(i) })).outline!.polys[0]![0]!.x);
      const tail = xs.slice(30);
      return Math.max(...tail) - Math.min(...tail);
    };
    expect(spread(false)).toBeCloseTo(6, 6);
    expect(spread(true)).toBeLessThan(6 * 0.95);
  });

  it("L30 테두리 떨림 필터는 화면 4 값(LIVE_SMOOTH 10 · 1 · 5, PC ?tune) — 옛 기본값(2.5 · 0.08)은 움직일 때 늦게 따라왔다 (#235 · #244)", () => {
    expect(LIVE_SMOOTH).toEqual({ minCutoff: 10, beta: 1, dCutoff: 5 });
    const lr = createLiveRun<string>({ partId: "lip", baseline: { lm: FACE, foreheadL: SKIN.L }, guide: lookGuide({}) });
    const ref = new LandmarkSmoother(Array.from({ length: 478 }, (_, i) => i), LIVE_SMOOTH);
    const old = new LandmarkSmoother(Array.from({ length: 478 }, (_, i) => i));
    const i0 = LM.lipsOuter[0]!;
    let got = 0, want = 0, slow = 0;
    // 가만히 있다가 30px 움직인다
    for (let k = 0; k < 12; k++) {
      const lm = k < 8 ? FACE : FACE.map((p) => ({ x: p.x + 30, y: p.y }));
      const f = frame({ lm });
      got = lr.step(f).outline!.polys[0]![0]!.x;
      want = ref.smooth(lm, f.t)![i0]!.x;
      slow = old.smooth(lm, f.t)![i0]!.x;
    }
    expect(got).toBeCloseTo(want, 6);
    expect(got).toBeGreaterThan(slow);
    expect(lr.smoother).not.toBeNull();
  });

  it("L17 채점으로 넘기는 묶음에는 필터 안 건 원래 점 (필터가 채점을 흔들지 않게)", () => {
    const lr = run();
    for (let i = 0; i < 5; i++) lr.step(frame());
    lr.press();
    const moved = FACE.map((p) => ({ x: p.x + 4, y: p.y }));
    let last = null;
    for (let i = 0; i < 5; i++) last = lr.step(frame({ lm: moved })).bundle;
    expect(last?.status).toBe("done");
    if (last?.status !== "done") return;
    expect(last.bundle.pts[0]![0]).toEqual({ x: moved[0]!.x, y: moved[0]!.y });
  });

  it("L18 맨얼굴 표정을 받으면 지금 표정과 비교해 막는다 — 입술 단계에서 입을 내밀면 expr_diff (#27)", () => {
    const calm = { mouthPucker: 0.05, jawOpen: 0.04, mouthSmileLeft: 0.02, mouthSmileRight: 0.02 };
    const lr = createLiveRun<string>({ partId: "lip", baseline: { lm: FACE, foreheadL: SKIN.L }, guide: lookGuide({}), baseExpr: calm });
    expect(lr.step(frame({ expr: { ...calm, mouthPucker: 0.7 } })).gate.firstFail).toBe("expr_diff");
    const plain = run("lip");
    expect(plain.step(frame({ expr: { ...calm, mouthPucker: 0.7 } })).gate.firstFail).not.toBe("expr_diff");
  });

  // 입을 크게 벌림: 턱 끝(152)과 아랫입술이 80px 내려감 (합성 얼굴에선 옛 식으로 약 -9°)
  const mouthOpen = (lm: readonly Pt[]) => lm.map((p, i) => (i === LM.chin || (LM.lipsOuter.slice(11, 20) as readonly number[]).includes(i) ? { x: p.x, y: p.y + 80 } : p));
  const settle = (lr: ReturnType<typeof run>, lm: Pt[]) => { let r = lr.step(frame({ lm })); for (let i = 0; i < 5; i++) r = lr.step(frame({ lm })); return r; };

  it("L19 입술 단계에서 입을 크게 벌려도 막히지 않는다 — 각도 차(pose_diff)도, 정면(angle)도 (#28 · #193)", () => {
    const r = settle(run("lip"), mouthOpen(FACE));
    expect(r.gate.ok).toBe(true);
  });

  it("L22 조금 숙인 채(-3°) 입을 크게 벌려도 '조금만 정면으로' 가 안 뜬다 — 옛 식은 턱 때문에 -12° 로 잡았다 (#193)", () => {
    // 코끝(1·4)을 3° 숙인 만큼 올린다: 강체 식 기준 Δ = 3° × kPitch × 눈꼬리 거리
    const D = Math.hypot(FACE[LM.eyeB.outer]!.x - FACE[LM.eyeA.outer]!.x, FACE[LM.eyeB.outer]!.y - FACE[LM.eyeA.outer]!.y);
    const dy = -(3 / (180 / Math.PI)) * RIGID_POSE.kPitch * D;
    const tilted = mouthOpen(FACE).map((p, i) => (i === 1 || i === 4 ? { x: p.x, y: p.y + dy } : p));
    expect(Math.abs(poseOf(tilted).pitch)).toBeGreaterThan(LIVE_LIMITS.pitch);   // 옛 식이면 막혔다
    const r = settle(run("lip"), tilted);
    expect(r.gate.firstFail).not.toBe("angle");
    expect(r.gate.ok).toBe(true);
  });

  it("L20 누운 얼굴이면 '자동 회전' 안내 — 게이트가 기울기를 스스로 잰다 (#204)", () => {
    const lying = FACE.map((p) => ({ x: 300 - (p.y - 300), y: 300 + (p.x - 300) }));
    expect(run("liner").step(frame({ lm: lying, screen: "portrait" })).gate.text).toBe(GATE_TEXT.autoRotate);
  });

  it("L21 눈 부위를 세로 화면에서 하면 '가로로 돌려', 입술을 가로에서 하면 '세로로 돌려' 로 막는다 — 화면이 넘긴 방향으로 (팀 협의)", () => {
    expect(run("liner").step(frame({ screen: "portrait" })).gate.text).toBe(GATE_TEXT.toLandscape);
    expect(run("lip").step(frame({ screen: "landscape" })).gate.text).toBe(GATE_TEXT.toPortrait);
    expect(run("lip").step(frame({ screen: "portrait" })).gate.firstFail).not.toBe("angle");
  });

  it("L23 게이트가 본 측정값을 같이 돌려준다 — 화면 4 ?gate 표시용 (안정 수 포함)", () => {
    const lr = run();
    const r = lr.step(frame({ sharpness: 123 }));
    expect(r.measure?.sharpness).toBe(123);
    expect(r.measure?.stableCount).toBe(r.gate.stableCount);
    expect(lr.step(frame({ lm: null })).measure).toBeNull();
  });

  /** over 를 ms 동안 넣는다 — 프레임마다 결과 */
  const hold = (lr: ReturnType<typeof run>, ms: number, over: Partial<LiveFrame<string>>) => {
    const end = clock + ms;
    const out = [];
    while (clock < end) out.push(lr.step(frame(over)));
    return out;
  };

  it("L25 각도 차로 3초 넘게 막히면 확인받기가 켜진다 — 문구는 안내 그대로, 판단은 채점에 맡긴다 (#235)", () => {
    expect(LIVE_LIMITS.softMs).toBe(3000);
    const lr = run("liner");
    const turned = { lm: turnedFace(0.11) };
    const early = hold(lr, 2900, turned);
    expect(early.every((r) => !r.pressable && r.gate.firstFail === "pose_diff")).toBe(true);
    expect(lr.press()).toBe(false);
    const late = hold(lr, 200, turned).at(-1)!;
    expect(late.pressable).toBe(true);
    expect(late.gate.ok).toBe(false);
    expect(late.gate.text).toBe(GATE_TEXT.turnRight);
    expect(lr.press()).toBe(true);
    // 누르면 각도 차가 있어도 묶음을 모은다 — 채점이 정렬하거나 확인만으로
    const states = hold(lr, 33 * 5, turned).map((r) => r.bundle?.status);
    expect(states.at(-1)).toBe("done");
  });

  it("L26 찍어도 채점 못 하는 사진(얼굴 없음·가로 돌리기·부위 밖·가림·밝기)은 3초가 지나도 안 켜진다", () => {
    const cases: Partial<LiveFrame<string>>[] = [
      { lm: null },
      { screen: "portrait" },
      { view: { x: 0, y: 0, w: 10, h: 10 } },
      { lab: HAND },
      { lab: { L: 95, a: 12, b: 16 } },
    ];
    for (const over of cases) {
      const lr = run("liner");
      lr.step(frame());
      const rs = hold(lr, 4000, over);
      expect(rs.some((r) => r.pressable), JSON.stringify(over)).toBe(false);
      expect(lr.press()).toBe(false);
    }
  });

  it("L27 그 사이 못 찍는 조건이 끼면 3초를 처음부터 센다", () => {
    const lr = run("liner");
    const turned = { lm: turnedFace(0.11) };
    hold(lr, 2000, turned);
    lr.step(frame({ lm: null }));
    expect(hold(lr, 2000, turned).some((r) => r.pressable)).toBe(false);
    expect(hold(lr, 1100, turned).at(-1)!.pressable).toBe(true);
  });

  it("L28 기다려도 되는 조건끼리 바뀌면(각도 차 → 정면 각도) 이어서 센다", () => {
    const lr = run("liner");
    hold(lr, 2000, { lm: turnedFace(0.11) });
    const rs = hold(lr, 1100, { lm: turnedFace(0.13) });
    expect(rs[0]!.gate.firstFail).toBe("angle");
    expect(rs.at(-1)!.pressable).toBe(true);
  });

  it("L29 통과하면 바로 누를 수 있다 (pressable = 통과 또는 3초 기다림)", () => {
    const lr = run("liner");
    const rs = [lr.step(frame()), lr.step(frame())];
    expect(rs.map((r) => r.pressable)).toEqual([false, true]);
    expect(rs.map((r) => r.gate.ok)).toEqual([false, true]);
  });

  it("L31 화면 4 테두리는 맨얼굴 정면에서 그린 모양을 얼굴 그물에 붙여 옮긴다 — 고개를 돌려 한쪽이 좁아지면 그쪽 테두리도 좁아진다 (2026-10-02 PC)", () => {
    // 화면 왼쪽 절반만 가로로 0.7 배 (먼 쪽 얼굴이 좁아 보이는 것). 볼 타원은 얼굴 폭 비율로 그려서, 매번 새로 그리면 양쪽 크기가 같다
    const cx = 300;
    const turned = FACE.map((p) => (p.x < cx ? { x: cx + (p.x - cx) * 0.7, y: p.y } : p));
    const o = createLiveRun<string>({ partId: "cheek", baseline: { lm: FACE, foreheadL: SKIN.L }, guide: lookGuide({}), smooth: false }).step(frame({ lm: turned })).outline!;
    const width = (poly: readonly Pt[]) => Math.max(...poly.map((p) => p.x)) - Math.min(...poly.map((p) => p.x));
    const [a, b] = o.polys;
    const [narrow, wide] = Math.min(...a!.map((p) => p.x)) < cx ? [a!, b!] : [b!, a!];
    expect(width(narrow) / width(wide)).toBeCloseTo(0.7, 1);
  });

  // 라이너 아래 선은 MediaPipe 눈꺼풀 점을 따라간다 — 눈을 감거나 내리깔 때도 붙어 있게.
  // 고개를 많이 돌리면 먼 쪽 눈꺼풀 점 몇 개가 빗나간다(먼 쪽 눈머리가 코 쪽으로) → C안: 정면 눈 모양 틀을 지금 눈꺼풀 점에 맞추고 튀는 점은 무시
  // (A안 눈 주변 점 평면 변환 · B안 머리 입체 회전은 더 나빠져 되돌림, 2026-10-02 PC)
  const dragged = (f: number): Pt[] => {
    const lm = turnedFace(f);   // 코끝이 이미지 오른쪽으로 → 먼 쪽 눈 = 이미지 오른쪽 눈(eyeB)
    lm[LM.eyeB.inner] = { x: lm[LM.eyeB.inner]!.x - 20, y: lm[LM.eyeB.inner]!.y };
    return lm;
  };
  const linerAt = (lm: Pt[]) => createLiveRun<string>({ partId: "liner", baseline: { lm: FACE, foreheadL: SKIN.L }, guide: lookGuide({}), smooth: false }).step(frame({ lm })).outline!;
  const farPoly = (o: { polys: Pt[][] }) => o.polys.reduce((a, b) => (Math.max(...b.map((p) => p.x)) > Math.max(...a.map((p) => p.x)) ? b : a));
  const dragTip = () => ({ x: FACE[LM.eyeB.inner]!.x - 20, y: FACE[LM.eyeB.inner]!.y });

  it("L33 조금 돌렸을 때(각도 차 12 안)는 라이너가 눈꺼풀 점을 그대로 따라간다", () => {
    const got = farPoly(linerAt(dragged(0.05)));
    expect(got.some((p) => Math.hypot(p.x - dragTip().x, p.y - dragTip().y) < 1e-6)).toBe(true);
  });

  it("L37 많이 돌리면(각도 차 25 넘게) 먼 쪽 눈은 눈 모양 틀로 — 튀는 눈꺼풀 점 하나는 무시, 가까운 쪽은 그대로 점을 따라간다 (C안)", () => {
    const lm = dragged(0.25), nearTip = { x: lm[LM.eyeA.inner]!.x + 6, y: lm[LM.eyeA.inner]!.y + 3 };
    lm[LM.eyeA.inner] = nearTip;
    const o = linerAt(lm), far = farPoly(o), nearP = o.polys.find((q) => q !== far)!;
    expect(far.some((p) => Math.hypot(p.x - dragTip().x, p.y - dragTip().y) < 5)).toBe(false);
    expect(far.some((p) => Math.hypot(p.x - FACE[LM.eyeB.inner]!.x, p.y - FACE[LM.eyeB.inner]!.y) < 0.5)).toBe(true);
    expect(nearP.some((p) => Math.hypot(p.x - nearTip.x, p.y - nearTip.y) < 1e-6)).toBe(true);
  });

  it("L39 많이 돌렸을 때 먼 쪽 눈꺼풀 점이 통째로 눈동자 쪽으로 쪼그라들어도(가로 0.6 배) 테두리 폭은 먼 쪽 눈썹이 줄어든 비율대로 (F안)", () => {
    const lm = turnedFace(0.25);
    const eye = LM.eyeB, cx = (FACE[eye.outer]!.x + FACE[eye.inner]!.x) / 2;
    for (const i of [...eye.upper, ...eye.lower]) lm[i] = { x: cx + (FACE[i]!.x - cx) * 0.6, y: FACE[i]!.y };
    const lashX = (poly: readonly Pt[]) => eye.upper.map((i) => poly.find((p) => Math.abs(p.y - FACE[i]!.y) < 3 && Math.abs(p.x - FACE[i]!.x) < 30)).filter(Boolean);
    const far = farPoly(linerAt(lm)), base = farPoly(linerAt(FACE));
    const span = (ps: readonly Pt[]) => Math.max(...ps.map((p) => p.x)) - Math.min(...ps.map((p) => p.x));
    // 눈썹은 그대로(비율 1) → 테두리 폭도 정면 그대로. 쪼그라든 점(0.6 배)을 따라가지 않는다
    expect(span(far) / span(base)).toBeGreaterThan(0.95);
    expect(lashX(far).length).toBeGreaterThan(0);
  });

  // G안 (F안 다듬기, 2026-10-02 PC): 1 눈머리 고정 · 2 눈썹 앞쪽 절반 비율 · 3 높이는 정면보다 커지지 않게 — 화면 4 ?g=0·1·12·123 로 하나씩 비교
  const G_ALL = { anchorInner: true, browHalf: true, capHeight: true };
  const linerG = (lm: Pt[], farEye: typeof G_ALL) => createLiveRun<string>({ partId: "liner", baseline: { lm: FACE, foreheadL: SKIN.L }, guide: lookGuide({}), smooth: false, farEye }).step(frame({ lm })).outline!;
  const nearPt = (poly: readonly Pt[], q: Pt, eps: number) => poly.some((p) => Math.hypot(p.x - q.x, p.y - q.y) < eps);
  const B = LM.eyeB;

  it("L40 G1 눈머리 고정 — 먼 쪽 눈꺼풀 점이 눈머리 쪽으로 쪼그라들면(눈머리는 맞고 눈꼬리만 짧음) 눈머리는 그대로 두고 눈꼬리 쪽으로만 늘인다", () => {
    const lm = turnedFace(0.25), ix = FACE[B.inner]!.x;
    for (const i of [...B.upper, ...B.lower]) lm[i] = { x: ix + (FACE[i]!.x - ix) * 0.6, y: FACE[i]!.y };
    const g1 = farPoly(linerG(lm, G_ALL)), mid = farPoly(linerG(lm, { ...G_ALL, anchorInner: false }));
    expect(nearPt(g1, FACE[B.inner]!, 0.5)).toBe(true);
    expect(nearPt(g1, FACE[B.outer]!, 1)).toBe(true);
    expect(nearPt(mid, FACE[B.inner]!, 0.5)).toBe(false);   // 가운데 기준(F안)은 눈머리까지 밀린다
  });

  it("L41 G2 눈썹 앞쪽 절반 — 먼 쪽 눈썹 꼬리가 관자놀이로 돌아 들어가 짧아져도 눈 폭은 안 줄인다", () => {
    const lm = turnedFace(0.25), br = LM.browB;
    for (const line of [br.upper, br.lower]) for (const k of [0, 1]) {
      const p = FACE[line[k]!]!, m = FACE[line[2]!]!;
      lm[line[k]!] = { x: p.x + (m.x - p.x) * 0.4, y: p.y + (m.y - p.y) * 0.4 };
    }
    const span = (ps: readonly Pt[]) => Math.max(...ps.map((p) => p.x)) - Math.min(...ps.map((p) => p.x));
    const base = span(farPoly(linerAt(FACE)));
    expect(span(farPoly(linerG(lm, G_ALL))) / base).toBeGreaterThan(0.98);
    expect(span(farPoly(linerG(lm, { ...G_ALL, browHalf: false }))) / base).toBeLessThan(0.95);   // 눈썹 전체 길이면 줄어든다
  });

  it("L42 G3 높이 — 먼 쪽 눈꺼풀 점이 눈동자 둘레로 모여 세로로 커지면(1.5 배) 정면 높이까지만, 눈을 감아 작아지는 건 따라간다", () => {
    const top = B.upper[4]!;
    const tall = turnedFace(0.25);
    for (const i of [...B.upper, ...B.lower]) tall[i] = { x: FACE[i]!.x, y: 250 + (FACE[i]!.y - 250) * 1.5 };
    expect(nearPt(farPoly(linerG(tall, G_ALL)), FACE[top]!, 1)).toBe(true);
    expect(nearPt(farPoly(linerG(tall, { ...G_ALL, capHeight: false })), FACE[top]!, 1)).toBe(false);
    const shut = turnedFace(0.25);
    for (const i of [...B.upper, ...B.lower]) shut[i] = { x: FACE[i]!.x, y: 250 + (FACE[i]!.y - 250) * 0.4 };
    expect(nearPt(farPoly(linerG(shut, G_ALL)), shut[top]!, 1)).toBe(true);
  });

  it("L38 많이 돌린 채 먼 쪽 눈이 통째로 움직이면 틀도 같이 움직인다 — A·B안처럼 얼어붙지 않는다", () => {
    const lm = turnedFace(0.25);
    for (const i of [...LM.eyeB.upper, ...LM.eyeB.lower]) lm[i] = { x: FACE[i]!.x + 7, y: FACE[i]!.y - 4 };
    const far = farPoly(linerAt(lm));
    for (const i of LM.eyeB.upper) expect(far.some((p) => Math.hypot(p.x - lm[i]!.x, p.y - lm[i]!.y) < 0.5), String(i)).toBe(true);
  });

  it("L36 고개를 많이 돌리면 먼 쪽 눈 테두리는 흐리게 — 붙게 만들 수 없는 각도라 믿고 따라 그리지 않게 (2026-10-02 PC). 가까운 쪽 · 조금 돌렸을 때 · 눈 아닌 부위는 그대로", () => {
    expect(FAR_FADE.min).toBeLessThan(1);
    const alphaOf = (part: "liner" | "lip", f: number) => createLiveRun<string>({ partId: part, baseline: { lm: FACE, foreheadL: SKIN.L }, guide: lookGuide({}), smooth: false }).step(frame({ lm: turnedFace(f) }));
    // 코끝이 이미지 오른쪽으로(각도 차 약 31) → 먼 쪽 = 이미지 오른쪽 눈
    const big = alphaOf("liner", 0.25);
    const rightIdx = big.outline!.polys.findIndex((q) => Math.min(...q.map((p) => p.x)) > 300);
    expect(big.alpha).toHaveLength(2);
    expect(big.alpha![rightIdx]).toBeCloseTo(FAR_FADE.min, 6);
    expect(big.alpha![1 - rightIdx]).toBe(1);
    // 반대로 돌리면 반대쪽이 흐려진다
    const other = alphaOf("liner", -0.25);
    expect(other.alpha![rightIdx]).toBe(1);
    expect(other.alpha![1 - rightIdx]).toBeCloseTo(FAR_FADE.min, 6);
    // 조금 돌렸을 때(각도 차 약 6) · 눈 아닌 부위는 흐리게 하지 않는다
    expect(alphaOf("liner", 0.05).alpha).toEqual([1, 1]);
    expect(alphaOf("lip", 0.25).alpha).toBeNull();
  });

  it("L24 폰을 가로로 들면 카메라가 옆이라 얼굴이 돌아간 것으로 찍힌다 — 기준 각도 차를 '오른쪽/왼쪽으로 돌려' 로 알려 준다 (폰 시험 2026-09-30)", () => {
    const turned = turnedFace(0.11);
    const r = run("liner").step(frame({ lm: turned }));
    expect(r.gate.firstFail).toBe("pose_diff");
    expect(r.gate.text).toBe(GATE_TEXT.turnRight);   // poseOf 로도 이 얼굴은 음수(= 화면 1 기준 "왼쪽으로 돌린" 얼굴) → 오른쪽으로
    expect(poseOf(turned).yaw).toBeLessThan(poseOf(FACE).yaw);
  });
});
