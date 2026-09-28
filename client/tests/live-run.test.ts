// 화면 4 진행 (2-1 넷째 조각, #21) 검증 — 카메라 없이 프레임 측정값만 넣는다
// 프레임마다: 게이트 한 줄 · 가이드 테두리 · (확인받기 뒤) 묶음 모으기
import { describe, expect, it } from "vitest";
import { createLiveRun, type LiveFrame } from "@core/live-run";
import { linerOutline } from "@core/guides";
import { unitScale } from "@core/baseline";
import { LM } from "@core/landmarks";
import type { Lab } from "@core/color";
import type { Pt } from "@core/types";
import { LMS, W, H } from "./helpers/synth-face";

// 합성 얼굴은 턱(152)이 가운데라 고개를 숙인 것으로 잰다 → 턱을 내려 정면으로
const FACE: Pt[] = LMS.map((p, i) => (i === LM.chin ? { x: 300, y: 464 } : p));
const SKIN: Lab = { L: 62, a: 12, b: 16 };
const HAND: Lab = { L: 30, a: 20, b: 30 };   // 이마 ΔE 약 38 — 가림으로 잡힌다

const run = (part: "liner" | "lip" = "liner") =>
  createLiveRun<string>({ partId: part, baseline: { lm: FACE, foreheadL: SKIN.L }, lookParts: {} });

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
});
