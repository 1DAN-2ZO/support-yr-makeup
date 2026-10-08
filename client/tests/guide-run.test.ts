// 화면 4 부위 가이드 재료 (모듈 ⑥ 잇기) — 맨얼굴 + 정답사진 → 부위별로 자를 자리 · 가이드 테두리.
// 떼기(core/makeup-extract) · 모양(core/part-guide) · 자르기(core/crop)는 ② 것 그대로. 여기서는 잇는 것만 본다
import { describe, expect, it } from "vitest";
import { cropSpec } from "@core/crop";
import { FEEDBACK_ORDER } from "@core/guide-feedback";
import { GUIDE_ASPECT, runGuide } from "@core/guide-run";
import { FACE_OVAL } from "@core/makeup-extract";
import type { Pt } from "@core/types";
import { BARE, LMS as SYNTH, browPaint, image, linerPaint, lipPaint, over } from "./helpers/synth-face";

// 합성 얼굴은 턱 쪽 윤곽 점이 없다 (얼굴 가운데에 모여 있다) — 윤곽 36점을 타원에 놓아 준다. 맨 위(10)부터 시계 방향
const LMS: Pt[] = SYNTH.map((q) => ({ ...q }));
FACE_OVAL.forEach((id, k) => {
  const t = -Math.PI / 2 + (k * 2 * Math.PI) / FACE_OVAL.length;
  LMS[id] = { x: 300 + 200 * Math.cos(t), y: 300 + 220 * Math.sin(t) };
});
const bare = { image: BARE.im, lm: LMS };

describe("부위 가이드 재료", () => {
  it("GR1 없는 것이 있으면 만들지 않고 무엇이 없는지 알린다", () => {
    expect(runGuide({ bare: null, answer: image(lipPaint) })).toEqual({ ok: false, missing: "bare" });
    expect(runGuide({ bare, answer: null })).toEqual({ ok: false, missing: "answer" });
  });

  it("GR2 정답사진이 맨얼굴과 크기가 다르면 만들지 않는다 — 겹치지 않는 그림에서 뗀 화장은 엉뚱한 자리다", () => {
    const small = { data: new Uint8ClampedArray(300 * 300 * 4), w: 300, h: 300 };
    expect(runGuide({ bare, answer: small })).toEqual({ ok: false, missing: "answer_size" });
  });

  it("GR3 입술 · 눈썹을 칠한 정답사진 → 그 두 부위에 테두리가 있고, 안 칠한 부위는 테두리 없이 자를 자리만", () => {
    const r = runGuide({ bare, answer: image(over(lipPaint, browPaint)) });
    if (!r.ok) throw new Error(r.missing);
    expect(r.found).toEqual(["brow", "lip"]);
    expect(r.pages.lip.polys.length).toBeGreaterThan(0);
    expect(r.pages.brow.polys.length).toBeGreaterThan(0);
    expect(r.pages.cheek.polys).toEqual([]);
    // 다섯 부위 모두 자를 자리는 있다 — 화장을 못 찾은 부위도 정답사진의 그 자리는 보여 준다
    for (const p of FEEDBACK_ORDER) {
      const c = r.pages[p].crop;
      expect(c.w, p).toBeGreaterThan(0);
      expect(c.w / c.h, p).toBeCloseTo(GUIDE_ASPECT[p], 5);
    }
  });

  it("GR4 테두리는 자른 자리 안에 다 들어온다 — 라이너 꼬리처럼 얼굴 점 밖으로 나가는 선이 잘리지 않게", () => {
    const r = runGuide({ bare, answer: image(over(lipPaint, over(browPaint, linerPaint()))) });
    if (!r.ok) throw new Error(r.missing);
    expect(r.found).toContain("liner");
    // 자를 자리는 테두리 점까지 넣어서 정한 것이다 (② 시험 페이지 flow-poc 의 cropOf 와 같게) — 얼굴 점만으로 정한 자리와 다르다
    const pts = r.pages.liner.polys.flatMap((q) => q.poly);
    expect(r.pages.liner.crop).toEqual(cropSpec("liner", LMS, GUIDE_ASPECT.liner, pts));
    expect(r.pages.liner.crop).not.toEqual(cropSpec("liner", LMS, GUIDE_ASPECT.liner));
    for (const p of r.found) {
      const c = r.pages[p].crop;
      for (const { poly } of r.pages[p].polys) for (const q of poly) {
        expect(q.x >= c.x - 0.5 && q.x <= c.x + c.w + 0.5 && q.y >= c.y - 0.5 && q.y <= c.y + c.h + 0.5, `${p} (${q.x.toFixed(1)}, ${q.y.toFixed(1)})`).toBe(true);
      }
    }
  });

  it("GR5 화장이 없는 정답사진(맨얼굴 그대로) → 테두리는 하나도 없다. 실패는 아니다", () => {
    const r = runGuide({ bare, answer: BARE.im });
    if (!r.ok) throw new Error(r.missing);
    expect(r.found).toEqual([]);
    for (const p of FEEDBACK_ORDER) expect(r.pages[p].polys, p).toEqual([]);
  });

  it("GR6 얼굴 윤곽을 0.9 로 줄인 밖의 차이는 화장으로 보지 않는다 — FLUX 가 칠하지 않는 곳(원본에 되붙인 경계)이다", () => {
    // 윤곽 아래쪽 점이 얼굴 가운데(300,300)에 모인 얼굴 — 입술(y 395~445)이 윤곽 밖이 된다
    const r = runGuide({ bare: { image: BARE.im, lm: SYNTH }, answer: image(lipPaint) });
    if (!r.ok) throw new Error(r.missing);
    expect(r.found).not.toContain("lip");
  });
});
