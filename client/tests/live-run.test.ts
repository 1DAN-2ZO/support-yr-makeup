// 화면 4 진행 (2-1 넷째 조각, #21) 검증 — 카메라 없이 프레임 측정값만 넣는다
// 프레임마다: 게이트 한 줄 · 가이드 테두리 · (확인받기 뒤) 묶음 모으기
import { describe, expect, it } from "vitest";
import { createLiveRun, type LiveFrame } from "@core/live-run";
import { GATE_TEXT, LIVE_LIMITS, RIGID_POSE, poseOf } from "@core/gate";
import { linerOutline, lookGuide } from "@core/guides";
import type { GuideSource } from "@core/score-part";
import { unitScale } from "@core/baseline";
import { LM } from "@core/landmarks";
import type { Lab } from "@core/color";
import type { Pt } from "@core/types";
import { LMS, W, H } from "./helpers/synth-face";

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

describe("live run", () => {
  it("L1 얼굴이 없으면 테두리도 문구도 없다 (정의서 3-9)", () => {
    const r = run().step(frame({ lm: null }));
    expect(r.outline).toBeNull();
    expect(r.gate.firstFail).toBe("face");
    expect(r.gate.text).toBe("");
  });

  it("L2 다 맞는 프레임 5개째에 '확인받을 준비 됨', 테두리는 첫 프레임부터", () => {
    const lr = run();
    const oks: boolean[] = [];
    for (let i = 0; i < 5; i++) {
      const r = lr.step(frame());
      expect(r.outline).not.toBeNull();
      oks.push(r.gate.ok);
    }
    expect(oks).toEqual([false, false, false, false, true]);
  });

  it("L3 라이너 테두리 = 두께 윤곽(linerOutline) 좌우 두 다각형", () => {
    const r = run("liner").step(frame());
    const want = linerOutline({ lm: FACE, unit: unitScale(FACE) }, 0.045);
    expect(r.outline!.polys).toEqual([want.R, want.L]);
  });

  it("L4 입술 테두리 = 입술 바깥 윤곽", () => {
    const r = run("lip").step(frame());
    expect(r.outline!.polys).toEqual([LM.lipsOuter.map((i) => FACE[i]!)]);
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
  it("L12 묶음을 낸 직후에는 다시 5프레임 통과해야 누를 수 있다 (연달아 두 번 찍히지 않게)", () => {
    const lr = run();
    for (let i = 0; i < 5; i++) lr.step(frame());
    lr.press();
    for (let i = 0; i < 5; i++) lr.step(frame());
    lr.step(frame());
    expect(lr.press()).toBe(false);
    for (let i = 0; i < 4; i++) lr.step(frame());
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
    expect(o.polys[0]).toContainEqual(tipR);
    expect(o.polys[1]).toContainEqual(tipL);
    const want = linerOutline({ lm: FACE, unit: unitScale(FACE) }, 0.08, { R: [FACE[LM.eyeA.outer]!, tipR], L: [FACE[LM.eyeB.outer]!, tipL] });
    expect(o.polys).toEqual([want.R, want.L]);
  });

  it("L16 테두리는 One-Euro 로 부드럽게 — 가만히 있는데 점이 떨리면 선은 덜 떨린다 (#23)", () => {
    const jittered = (i: number) => FACE.map((p) => ({ x: p.x + (i % 2 ? 3 : -3), y: p.y }));
    const spread = (smooth: boolean) => {
      const lr = createLiveRun<string>({ partId: "lip", baseline: { lm: FACE, foreheadL: SKIN.L }, guide: lookGuide({}), smooth });
      const xs: number[] = [];
      for (let i = 0; i < 60; i++) xs.push(lr.step(frame({ lm: jittered(i) })).outline!.polys[0]![0]!.x);
      const tail = xs.slice(30);
      return Math.max(...tail) - Math.min(...tail);
    };
    expect(spread(false)).toBeCloseTo(6, 6);
    expect(spread(true)).toBeLessThan(6 * 0.5);
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

  it("L21 눈 부위를 세로 화면에서 하면 '가로로 돌려' 로 막는다 — 화면이 넘긴 방향으로 (팀 협의)", () => {
    expect(run("liner").step(frame({ screen: "portrait" })).gate.text).toBe(GATE_TEXT.toLandscape);
    expect(run("lip").step(frame({ screen: "portrait" })).gate.firstFail).not.toBe("angle");
  });

  it("L23 게이트가 본 측정값을 같이 돌려준다 — 화면 4 ?gate 표시용 (안정 수 포함)", () => {
    const lr = run();
    const r = lr.step(frame({ sharpness: 123 }));
    expect(r.measure?.sharpness).toBe(123);
    expect(r.measure?.stableCount).toBe(r.gate.stableCount);
    expect(lr.step(frame({ lm: null })).measure).toBeNull();
  });
});
