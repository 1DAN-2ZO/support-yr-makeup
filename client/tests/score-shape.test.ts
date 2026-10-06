// 결과 모양 채점 실험 (score-shape 브랜치, 2026-10-01) — 맨얼굴과 비교하지 않고 **지금 사진 한 장**에서
// "가이드 안이 얼마나 채워져 있나" 를 잰다. 원래 있던 눈썹과 새로 그린 것을 가리지 않는다 (팀 방향: 눈썹이 이미 정답 모양이면 무시하지 않는다)
import { describe, expect, it } from "vitest";
import { LM } from "@core/landmarks";
import { frameOf, type SampleFrame } from "@core/sampling";
import { EYE_SHIFT, LINER_WING, browShape, eyeShift, lidEdge, liftLid, linerBand, linerEnds, linerEndsResult, linerFan, linerStroke, routeOf, scoreHybrid, scoreLinerPair, scoreLinerWing, scoreWhole, WHOLE, type WholeRegions, shapeFill, tintFill, tintProgress, type LinerWingEye, type WingMatch } from "@core/score-shape";
import { PARAMS, decide, type PartScore, type Side } from "@core/score";
import type { GuideSource } from "@core/score-part";
import { pointInPoly, rgbToLab } from "@core/color";
import { sampleLiner } from "@core/sampling";
import type { Pt } from "@core/types";
import { BARE, BROWN, INK, LMS, NATURAL, P, RED, SKIN, W, browPaint, eyeOf, geomOf, guide, image, linerPaint, lipPaint, naturalPaint, over, regionPaint, shifted, type Paint, type Rgb } from "./helpers/synth-face";

const outline: Pt[] = [...LM.browA.upper.map(P), ...LM.browA.lower.map(P).reverse()];
const frame = (p: Paint) => frameOf(image(p), LMS);

describe("결과 모양 — 가이드 안 채움 (지금 사진만)", () => {
  it("H1 맨피부면 채움 0 · 가이드 안이 전부 눈썹이면 1 에 가깝다", () => {
    expect(shapeFill(frame(() => null), outline).coverage).toBe(0);
    expect(shapeFill(frame(browPaint), outline).coverage).toBeGreaterThan(0.9);
  });

  it("H2 꼬리 쪽 절반만 눈썹이면 채움도 절반쯤", () => {
    const half: Paint = (x, y) => (x < 215 ? browPaint(x, y) : null);   // 눈썹 x 160~270 의 바깥 절반
    const c = shapeFill(frame(half), outline).coverage;
    expect(c).toBeGreaterThan(0.35);
    expect(c).toBeLessThan(0.65);
  });

  it("H3 맨얼굴 사진이 없어도 된다 — 원래 눈썹이든 그린 것이든 같은 채움", () => {
    // 같은 그림이면 '원래 있던 것' 인지 '그린 것' 인지와 상관없이 같은 값 (맨얼굴을 안 본다)
    expect(shapeFill(frame(browPaint), outline).coverage).toBe(shapeFill(frame(browPaint), outline).coverage);
  });

  it("H4 전체가 어두워져도(조명) 주변 피부와 같이 어두워지면 채움 0 — 기준이 주변 피부라서", () => {
    const dim = frameOf(image(() => null, 0.7), LMS);
    expect(shapeFill(dim, outline).coverage).toBe(0);
  });

  it("H6 연한 눈썹(피부와 밝기 차 9쯤)도 채움으로 센다 — 기준을 그 사람 눈썹 진하기에 맞춘다", () => {
    // EasyPortrait 455개: 실제 눈썹과 피부의 밝기 차는 중앙 17, 열 중 하나는 8 이하. 고정 기준 12 는 연한 눈썹을 놓쳤다 (평균 오차 24%p)
    const light: Paint = (x, y) => (browPaint(x, y) ? [196, 150, 122] : null);
    expect(shapeFill(frame(light), outline).coverage).toBeGreaterThan(0.8);
  });

  it("H7 진한 눈썹 옆에 옅은 그림자가 있어도 그림자는 안 센다 — 기준이 눈썹 진하기의 절반", () => {
    const half: Paint = (x, y) => (browPaint(x, y) ? (x < 215 ? BROWN : [205, 157, 128]) : null);   // 꼬리 쪽은 눈썹, 안쪽은 옅은 그림자(차 6쯤)
    const c = shapeFill(frame(half), outline).coverage;
    expect(c).toBeGreaterThan(0.35);
    expect(c).toBeLessThan(0.65);
  });

  it("H5 주변 피부보다 조금만 어두운 칸은 안 센다 (그림자·잡티)", () => {
    const faint: Paint = (x, y) => (browPaint(x, y) ? [215, 164, 133] : null);   // 피부(224,172,140)보다 살짝만 (밝기 차 3쯤)
    expect(shapeFill(frame(faint), outline).coverage).toBe(0);
    expect(BROWN[0]).toBeLessThan(120);
  });
});

describe("결과 모양 — 템플릿 색 쪽으로 물든 정도 (입술·섀도우·볼)", () => {
  const skin = rgbToLab(...SKIN), red = rgbToLab(...RED);
  const lips: Pt[] = LM.lipsOuter.map(P);

  it("T1 주변 피부 = 0, 템플릿 색 = 1, 70% 덮으면 그 사이", () => {
    expect(tintProgress(skin, skin, red)).toBe(0);
    expect(tintProgress(red, skin, red)).toBeCloseTo(1, 5);
    const mixed = rgbToLab(...(SKIN.map((v, i) => v * 0.3 + RED[i]! * 0.7) as [number, number, number]));
    expect(tintProgress(mixed, skin, red)).toBeGreaterThan(0.5);
    expect(tintProgress(mixed, skin, red)).toBeLessThan(0.9);
  });

  it("T2 입술을 템플릿 색으로 칠하면 채움 ≈ 1 · 살색 그대로면 0", () => {
    expect(tintFill(frame(lipPaint), lips, RED, { skin }).coverage).toBeGreaterThan(0.9);
    expect(tintFill(frame(() => null), lips, RED, { skin }).coverage).toBe(0);
  });

  it("T3 템플릿과 다른 쪽 색(파랑)으로 칠한 입술은 빨강 템플릿의 채움으로 안 센다", () => {
    const blue: Paint = (x, y) => (lipPaint(x, y) ? [70, 90, 200] : null);
    expect(tintFill(frame(blue), lips, RED, { skin }).coverage).toBeLessThan(0.1);
  });

  it("T4 범위 — 가이드 밖(1.3배까지)으로 번진 비율도 낸다 (지금 채점은 섀도우·볼의 범위를 안 잰다 #260)", () => {
    const cheek = geomOf("cheek").regions!.R;
    const inGuide = tintFill(frame(regionPaint("cheek", RED)), cheek, RED, { skin });
    expect(inGuide.coverage).toBeGreaterThan(0.9);
    expect(inGuide.spill).toBeLessThan(0.1);
    const c = { x: cheek.reduce((a, q) => a + q.x, 0) / cheek.length, y: cheek.reduce((a, q) => a + q.y, 0) / cheek.length };
    const wide = cheek.map((q) => ({ x: c.x + (q.x - c.x) * 1.3, y: c.y + (q.y - c.y) * 1.3 }));
    const big: Paint = (x, y) => (wide.some(() => true) && x >= Math.min(...wide.map((q) => q.x)) && x <= Math.max(...wide.map((q) => q.x)) && y >= Math.min(...wide.map((q) => q.y)) && y <= Math.max(...wide.map((q) => q.y)) ? RED : null);
    expect(tintFill(frame(big), cheek, RED, { skin }).spill).toBeGreaterThan(0.7);
  });
});

describe("결과 모양 — 라이너 띠 (어두운 띠의 두께 · 꼬리)", () => {
  const g = geomOf("liner").liner!;
  const band = (f: ReturnType<typeof frame>) => linerBand(sampleLiner(f, "R", g.wing.R, g.thick));

  it("B1 맨피부면 두께 0 · 꼬리 0", () => {
    const b = band(frame(() => null));
    expect(b.thickness).toBe(0);
    expect(b.wingCoverage).toBe(0);
  });

  it("B2 가이드대로 그린 라이너 — 꼬리가 잡히고 두께가 나온다", () => {
    const b = band(frame(linerPaint()));
    expect(b.wingCoverage).toBeGreaterThan(0.7);
    expect(b.thickness).toBeGreaterThan(0.02);
  });

  it("B3 원래 속눈썹 선만 있으면 꼬리는 0 — 눈꼬리 밖 피부엔 원래 어두운 게 없다", () => {
    const b = linerBand(sampleLiner(NATURAL, "R", g.wing.R, g.thick));
    expect(b.wingCoverage).toBeLessThan(0.15);
    expect(b.lidCoverage).toBeGreaterThan(0.5);   // 속눈썹 선은 '있는 것' 으로 잡힌다 (결과 모양은 타고난 것을 포함)
  });

  it("B4 눈꼬리 바깥이 눈꺼풀보다 어두워도(얼굴 굴곡 그늘) 꼬리로 읽지 않는다 — 줄마다 그 줄의 바깥 칸과 비교", () => {
    // FFHQ 맨얼굴 20명 중 19명이 꼬리 100% 로 나왔다 (2026-10-01): 기준 피부를 띠 전체에서 하나로 잡아서
    const outerX = Math.min(...LM.eyeA.upper.map((i) => P(i).x));
    const shade: Paint = (x) => (x < outerX - 2 ? [170, 125, 100] : null);   // 눈꼬리 밖 전체가 고르게 어두움 (선이 아니다)
    const b = band(frame(shade));
    expect(b.wingCoverage).toBeLessThan(0.15);
  });

  it("B5 그늘 위에 그린 꼬리는 잡는다", () => {
    const outerX = Math.min(...LM.eyeA.upper.map((i) => P(i).x));
    const liner = linerPaint();
    const shaded: Paint = (x, y) => liner(x, y) ?? (x < outerX - 2 ? [170, 125, 100] : null);
    expect(band(frame(shaded)).wingCoverage).toBeGreaterThan(0.7);
  });
});

describe("결과 모양 — 눈썹 점수 (채움 + 넘침, 원래 눈썹과 그린 것을 가리지 않는다)", () => {
  // 이 브랜치는 '결과 모양으로만 본다'(채점 목적 2안)를 끝까지 만들어 보는 실험 — 원래 눈썹이 가이드 밖에 있어도 감점하고 알린다.
  // '원래 것은 봐준다'(번짐은 그린 것만)는 나중에 팀 방향(섞기)으로 합칠 때의 규칙
  const R: Pt[] = [...LM.browA.upper.map(P), ...LM.browA.lower.map(P).reverse()];
  const L: Pt[] = [...LM.browB.upper.map(P), ...LM.browB.lower.map(P).reverse()];
  const regions = { R, L };
  const grow = (poly: Pt[], k: number): Pt[] => { const c = { x: poly.reduce((a, q) => a + q.x, 0) / poly.length, y: poly.reduce((a, q) => a + q.y, 0) / poly.length }; return poly.map((q) => ({ x: c.x + (q.x - c.x) * k, y: c.y + (q.y - c.y) * k })); };
  const inAny = (polys: Pt[][]): Paint => (x, y) => (polys.some((poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i]!, b = poly[j]!; if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c; } return c; }) ? BROWN : null);

  it("S1 가이드 안에만 눈썹이 있으면 넘침 0 · 높은 점수 · 진단 없음", () => {
    const r = browShape(frame(browPaint), regions);
    expect(r.present).toBe(true);
    expect(r.codes).toEqual([]);
    expect(r.score).toBeGreaterThanOrEqual(90);
  });

  it("S2 눈썹이 가이드보다 크면(원래 눈썹이든 그린 것이든) 넘침으로 감점하고 '테두리 밖으로 나갔어요'", () => {
    const big = browShape(frame(inAny([grow(R, 1.6), grow(L, 1.6)])), regions);
    expect(big.codes).toContain("BROW_OUT_R");
    expect(big.codes).toContain("BROW_OUT_L");
    expect(big.score!).toBeLessThan(browShape(frame(browPaint), regions).score!);
  });

  it("S3 한쪽만 넘치면 그쪽만 알린다", () => {
    const r = browShape(frame(inAny([grow(R, 1.6), L])), regions);
    expect(r.codes).toContain("BROW_OUT_R");
    expect(r.codes).not.toContain("BROW_OUT_L");
  });

  it("S4 꼬리 쪽이 비면 '꼬리가 덜 그려졌어요'", () => {
    const noTail: Paint = (x, y) => (x > 215 && x < 385 ? browPaint(x, y) : null);   // 양쪽 눈썹의 바깥(꼬리) 절반을 비움
    const r = browShape(frame(noTail), regions);
    expect(r.codes).toContain("BROW_TAIL_SHORT_R");
    expect(r.codes).toContain("BROW_TAIL_SHORT_L");
  });

  it("S5 눈썹이 아예 안 보이면 점수 없음 (없음)", () => {
    const r = browShape(frame(() => null), regions);
    expect(r.present).toBe(false);
    expect(r.score).toBeNull();
  });
});

describe("갈림 규칙 — 쌩얼을 보고 결과 모양 / 원본 대조 / 확인만", () => {
  // 쌩얼 사진에 결과 모양 계산을 돌려 봤는데 이미 '발랐다' 로 나오면, 그 사람·그 화장·그 부위는 결과 모양으로 못 가른다 → 원본 대조.
  // EasyPortrait 실제 셀피 300장: 브라운 섀도우는 43%, 브릭 로즈 립은 67% 가 맨얼굴에서 절반 넘게 '발랐다' 로 읽혔다 (핑크·누드는 0~6%)
  const lips: Pt[] = LM.lipsOuter.map(P);
  const skinRgb = SKIN as unknown as [number, number, number];

  it("G1 쌩얼의 그 자리가 템플릿 색과 다르면 결과 모양으로 본다", () => {
    expect(routeOf(frame(() => null), lips, RED)).toBe("shape");
  });

  it("G2 쌩얼의 그 자리가 이미 템플릿 색이면(타고난 입술색 = 립 색) 원본과 대조한다", () => {
    expect(routeOf(frame(lipPaint), lips, RED)).toBe("compare");
  });

  it("G3 템플릿 색이 주변 피부와 같으면 잴 방향이 없다 — 확인만", () => {
    expect(routeOf(frame(() => null), lips, skinRgb)).toBe("check_only");
  });
});

describe("조합 — 부위마다 결과 모양과 원본 대조를 섞는다 (팀 방향: 채움은 원래 것 + 그린 것, 번짐은 그린 것만)", () => {
  const R: Pt[] = [...LM.browA.upper.map(P), ...LM.browA.lower.map(P).reverse()];
  const L: Pt[] = [...LM.browB.upper.map(P), ...LM.browB.lower.map(P).reverse()];
  // 눈썹 가이드가 테두리(regions)를 주는 가이드 — 앱의 개인화 가이드(planGuide)와 같은 모양
  const withBrow: GuideSource = (partId, f) => (partId === "brow" ? { regions: { R, L } } : guide(partId, f));
  const grow = (poly: Pt[], k: number): Pt[] => { const c = { x: poly.reduce((a, q) => a + q.x, 0) / poly.length, y: poly.reduce((a, q) => a + q.y, 0) / poly.length }; return poly.map((q) => ({ x: c.x + (q.x - c.x) * k, y: c.y + (q.y - c.y) * k })); };
  const inPolys = (polys: Pt[][]): Paint => (x, y) => (polys.some((poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i]!, b = poly[j]!; if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c; } return c; }) ? BROWN : null);
  const verdict = (part: "brow" | "lip" | "liner", base: ReturnType<typeof frame>, cur: ReturnType<typeof frame>, color: readonly [number, number, number]) => {
    const h = scoreHybrid(part, base, cur, withBrow, { templateColor: color });
    return { ...decide(part, h.result, h.ctx), route: h.route, codes: h.result.codes };
  };

  it("C1 원래 눈썹이 이미 가이드 모양이면 안 그려도 점수가 난다 — 지금 채점은 '안 보임'", () => {
    const natural = frame(browPaint);
    const v = verdict("brow", natural, natural, BROWN);
    expect(v.status).toBe("scored");
    expect(v.score).toBeGreaterThanOrEqual(90);
    expect(v.route).toBe("mixed");
  });

  it("C2 원래 눈썹이 가이드보다 커도 넘침으로 감점하지 않는다 (못 고치는 것)", () => {
    const big = frame(inPolys([grow(R, 1.6), grow(L, 1.6)]));
    const v = verdict("brow", big, big, BROWN);
    expect(v.codes).not.toContain("BROW_OUT_R");
    expect(v.codes).not.toContain("BROW_OUT_L");
  });

  it("C3 새로 그린 것이 가이드 밖으로 나가면 감점하고 알린다", () => {
    const v = verdict("brow", frame(browPaint), frame(inPolys([grow(R, 1.6), grow(L, 1.6)])), BROWN);
    expect(v.codes.some((c) => c.startsWith("BROW_OUT"))).toBe(true);
  });

  it("C4 입술: 쌩얼 입술이 템플릿 색과 다르면 결과 모양으로 — 칠하면 점수, 안 칠하면 안 보임", () => {
    const bare = frame(() => null);
    const done = verdict("lip", bare, frame(lipPaint), RED);
    expect(done.route).toBe("shape");
    expect(done.status).toBe("scored");
    expect(done.score).toBeGreaterThanOrEqual(80);
    expect(verdict("lip", bare, bare, RED)).toMatchObject({ status: "check_only", reason: "faint" });
  });

  it("C5 입술: 타고난 입술색이 이미 템플릿 색이면 원본과 대조한다 (지금 채점 그대로)", () => {
    const natural = frame(lipPaint);
    const v = verdict("lip", natural, natural, RED);
    expect(v.route).toBe("compare");
    expect(v.status).toBe("check_only");
  });

  it("C6 라이너는 원본 대조 — 채움·두께는 지금 방식, 꼬리 길이·앞쪽 자리는 획 추출로 섞는다 — 결과 모양은 눈꼬리 주름을 꼬리로 읽는다", () => {
    const bare = frame(() => null);
    const h = scoreHybrid("liner", bare, frame(linerPaint()), withBrow, { templateColor: [30, 25, 28] });
    expect(h.route).toBe("liner_mix");
    expect(h.result.score).toBeGreaterThan(70);
    expect(scoreHybrid("liner", bare, bare, withBrow, { templateColor: [30, 25, 28] }).result.present).toBe(false);
  });
});

describe("라이너 양 끝 — 눈꼬리와 앞트임 자리를 중심으로 (원본 대조)", () => {
  // 진단(2026-10-01, liner_levels): 속눈썹 선 위는 원래 어두워 그린 선이 잘 안 잡힌다. 사용자가 어려워하는 곳도 양 끝이다
  const g = geomOf("liner").liner!;
  const INK: [number, number, number] = [30, 25, 28];
  const lid = LM.eyeA.upper.map(P).reverse();   // 안쪽(눈머리) → 바깥(눈꼬리)
  const [corner, tip] = g.wing.R;
  const up = (q: Pt): Pt => ({ x: q.x, y: q.y - 2 });
  const d2seg = (x: number, y: number, a: Pt, b: Pt): number => { const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(x - a.x - t * dx, y - a.y - t * dy); };
  const stroke = (path: Pt[]): Paint => (x, y) => (path.some((_, i) => i > 0 && d2seg(x, y, path[i - 1]!, path[i]!) <= 2) ? INK : null);
  const along = (a: Pt, b: Pt, k: number): Pt => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
  const bare = frame(() => null);
  const ends = (p: Paint) => linerEnds(bare, frame(p), "R", g, g);
  const full = [...lid.map(up), up(tip)];

  it("E1 맨얼굴끼리는 그린 게 없다", () => {
    expect(ends(() => null).present).toBe(false);
  });

  it("E2 눈머리부터 꼬리 끝까지 그리면 — 꼬리 길이가 가이드와 같고 앞쪽이 눈머리에서 시작한다", () => {
    const e = ends(stroke(full));
    expect(e.present).toBe(true);
    expect(Math.abs(e.wingDrawn - e.wingGuide)).toBeLessThan(0.03);
    expect(Math.abs(e.innerStart)).toBeLessThan(0.05);
    expect(e.outerCoverage).toBeGreaterThan(0.8);
    expect(e.innerCoverage).toBeGreaterThan(0.8);
  });

  it("E3 꼬리를 가이드보다 길게 빼면 그만큼 길게 잰다 (지금 채점은 가이드 끝까지만 봐서 모른다)", () => {
    const e = ends(stroke([...lid.map(up), up(along(corner, tip, 1.6))]));
    expect(e.wingDrawn - e.wingGuide).toBeGreaterThan(0.05);
  });

  it("E4 꼬리를 안 그리면 꼬리 길이 0", () => {
    expect(ends(stroke(lid.map(up))).wingDrawn).toBeLessThan(0.03);
  });

  it("E5 앞쪽을 비우고 중간부터 그리면 시작 자리가 눈머리에서 멀다", () => {
    const e = ends(stroke([...lid.slice(3).map(up), up(tip)]));
    expect(e.innerStart).toBeGreaterThan(0.15);
    expect(e.innerCoverage).toBeLessThan(0.5);
  });

  it("E6 눈머리 너머로 빼면(앞트임을 넘김) 시작 자리가 음수", () => {
    const over = along(lid[1]!, lid[0]!, 1 + 9 / Math.hypot(lid[1]!.x - lid[0]!.x, lid[1]!.y - lid[0]!.y));   // 눈머리에서 9px 더
    expect(ends(stroke([up(over), ...full])).innerStart).toBeLessThan(-0.03);
  });

  it("E7 가운데가 끊겨도 양 끝이 맞으면 점수는 같다 — 가운데는 그렸는지만 본다", () => {
    const gap: Paint = (x, y) => { const c = stroke(full)(x, y); return c && x > lid[5]!.x && x < lid[3]!.x ? null : c; };
    const a = ends(stroke(full)), b = ends(gap);
    expect(b.midCoverage).toBeLessThan(a.midCoverage);
    expect(linerEndsResult({ R: b, L: b }).score).toBe(linerEndsResult({ R: a, L: a }).score);
  });

  it("E8 점수 — 가이드대로 > 꼬리 없음 · 꼬리 길게 · 앞쪽 비움", () => {
    const sc = (p: Paint) => { const e = ends(p); return linerEndsResult({ R: e, L: e }).score!; };
    const ok = sc(stroke(full));
    expect(ok).toBeGreaterThanOrEqual(80);
    expect(sc(stroke(lid.map(up)))).toBeLessThan(ok - 10);
    expect(sc(stroke([...lid.map(up), up(along(corner, tip, 1.8))]))).toBeLessThan(ok - 10);
    expect(sc(stroke([...lid.slice(3).map(up), up(tip)]))).toBeLessThan(ok - 10);
  });
});

describe("라이너 획 추출 — 가늘고 어두운 선만 골라 비교한다 (linerStroke)", () => {
  // liner_ends 실험(2026-10-01): 화면 가이드 모양(끝으로 가늘어지는 꼬리)은 칸 색 차이로는 꼬리 길이 0 으로 잰다. 실제 폰 사진 눈 폭 약 122px
  const g = geomOf("liner").liner!, eyeW = NATURAL.unit.eye;
  const INK: [number, number, number] = [30, 25, 28];
  const lid = LM.eyeA.upper.map(P).reverse();   // 눈머리 → 눈꼬리
  const [corner, tip] = g.wing.R;
  const inPoly = (x: number, y: number, poly: Pt[]): boolean => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i]!, b = poly[j]!; if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c; } return c; };
  /** 화면 가이드 윤곽 모양: 눈꺼풀 선에서 위로 thick, 꼬리 끝에서 만난다 */
  const outline = (thickPx: number, end: Pt = tip): Paint => { const poly = [...lid, end, ...lid.map((q) => ({ x: q.x, y: q.y - thickPx })).reverse()]; return (x, y) => (inPoly(x, y, poly) ? INK : null); };
  const stroke = (cur: Paint, base: Paint = naturalPaint) => linerStroke(frame(base), frame(over(cur, naturalPaint)), "R", g, g);
  const guideThick = g.thick * eyeW;

  it("K1 맨얼굴끼리는 그린 게 없다 (속눈썹 선이 있어도)", () => {
    expect(stroke(() => null).present).toBe(false);
  });

  it("K2 화면 가이드 모양으로 그리면 가는 꼬리까지 잡는다 — 칸 색 차이는 못 잡는다", () => {
    const e = stroke(outline(guideThick));
    expect(e.present).toBe(true);
    expect(e.wingDrawn).toBeGreaterThan(e.wingGuide * 0.6);
    expect(e.outerCoverage).toBeGreaterThan(0.7);
  });

  it("K3 눈꼬리 밖이 넓게 어두워진 것(그늘)은 선이 아니다", () => {
    const shade: Paint = (x) => (x < corner.x - 2 ? [150, 108, 86] : null);
    expect(stroke(shade).wingDrawn).toBeLessThan(0.03);
  });

  it("K4 맨얼굴이 1px 어긋나도 속눈썹 선을 새 획으로 읽지 않는다 (#261)", () => {
    const e = linerStroke(NATURAL, frame(shifted(naturalPaint, 0, 1)), "R", g, g);
    expect(e.present).toBe(false);
  });

  it("K5 두껍게 그리면 두껍다고 잰다", () => {
    const a = stroke(outline(guideThick)), b = stroke(outline(guideThick * 2.5));
    expect(b.thickness).toBeGreaterThan(a.thickness + 0.03);
  });

  it("K6 꼬리를 가이드보다 길게 빼면 길게 잰다", () => {
    const far = { x: corner.x + (tip.x - corner.x) * 1.6, y: corner.y + (tip.y - corner.y) * 1.6 };
    const e = stroke(outline(guideThick, far));
    expect(e.wingDrawn - e.wingGuide).toBeGreaterThan(0.04);
  });
});

describe("라이너 섞기 — 채움·두께는 지금 방식, 꼬리 길이·앞쪽 자리는 획 추출 (scoreHybrid)", () => {
  // 실제 사진에 덧그린 두 장(2026-10-01): 지금 방식은 채움·두께를 맞히고 긴 꼬리를 못 봤다(가이드 끝까지만 본다). 획 추출은 그 반대
  const g = geomOf("liner").liner!;
  const INK: [number, number, number] = [30, 25, 28];
  const lid = LM.eyeA.upper.map(P).reverse(), lidL = LM.eyeB.upper.map(P).reverse();
  const up = (q: Pt): Pt => ({ x: q.x, y: q.y - 2 });
  const d2seg = (x: number, y: number, a: Pt, b: Pt): number => { const dx = b.x - a.x, dy = b.y - a.y, k = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(x - a.x - k * dx, y - a.y - k * dy); };
  const strokes = (paths: Pt[][]): Paint => (x, y) => (paths.some((path) => path.some((_, i) => i > 0 && d2seg(x, y, path[i - 1]!, path[i]!) <= 2)) ? INK : null);
  const along = (a: Pt, b: Pt, k: number): Pt => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
  /** 양쪽 눈에 같은 모양 — wingK = 꼬리 길이 배수, from = 눈머리 쪽에서 건너뛸 점 수 */
  const both = (wingK: number, from = 0): Paint => strokes([[...lid.slice(from).map(up), up(along(g.wing.R[0], g.wing.R[1], wingK))], [...lidL.slice(from).map(up), up(along(g.wing.L[0], g.wing.L[1], wingK))]]);
  const bare = frame(() => null);
  const mix = (p: Paint) => scoreHybrid("liner", bare, frame(p), guide, { templateColor: INK });
  const extra = (h: ReturnType<typeof mix>): string[] => (h.result.metrics as { endCodes?: string[] }).endCodes ?? [];

  it("M1 가이드대로 그리면 높은 점수 · 꼬리·앞쪽 지적 없음", () => {
    const h = mix(both(1));
    expect(h.route).toBe("liner_mix");
    expect(h.result.score).toBeGreaterThanOrEqual(80);
    expect(extra(h)).toEqual([]);
  });

  it("M2 꼬리를 길게 빼면 '꼬리가 길다' 로 감점한다 — 지금 방식은 가이드 끝까지만 봐서 점수가 그대로다", () => {
    const ok = mix(both(1)), long = mix(both(1.7));
    expect(extra(long)).toEqual(expect.arrayContaining(["LINER_WING_LONG_R", "LINER_WING_LONG_L"]));
    expect(long.result.score!).toBeLessThan(ok.result.score! - 10);
  });

  it("M3 앞쪽을 비우면 '앞쪽이 비었다'", () => {
    const h = mix(both(1, 3));
    expect(extra(h)).toEqual(expect.arrayContaining(["LINER_INNER_SHORT_R", "LINER_INNER_SHORT_L"]));
    expect(h.result.score!).toBeLessThan(mix(both(1)).result.score!);
  });

  it("M5 가운데가 끊겨도 양 끝(눈꼬리 · 앞트임)이 맞으면 점수가 거의 같다 — 눈 뜬 사진에서도 가운데는 점수에 안 넣는다", () => {
    const full = both(1);
    const gap: Paint = (x, y) => { const c = full(x, y); return c && Math.abs(x - 300) > 68 && Math.abs(x - 300) < 102 ? null : c; };   // 양쪽 눈 가운데 구간(x 198~232 · 368~402)을 비운다
    const a = mix(full), b = mix(gap);
    expect(b.result.score!).toBeGreaterThanOrEqual(a.result.score! - 5);
    expect(b.result.codes.some((c) => c.startsWith("LINER_GAP"))).toBe(false);
  });

  it("M4 맨얼굴끼리는 그린 게 없다", () => {
    expect(mix(() => null).result.present).toBe(false);
  });
});

describe("라이너 기준선 — 얼굴 점 선이 아니라 맨얼굴의 어두운 띠(속눈썹 뿌리·접힌 선) 윗경계에서 잰다", () => {
  // 실제 사진 두 장(2026-10-02): 가이드 띠(얼굴 점 선 → 위로 두께)가 맨얼굴에서 이미 어두운 자리(밝기 13~17, 피부 47)였다.
  // 어두운 띠 윗경계는 얼굴 점 선보다 눈 폭의 5~8% 위. 기준선을 거기로 옮기면 검정 라이너 49 → 85~90점
  const INK: [number, number, number] = [30, 25, 28];
  const LASH: [number, number, number] = [45, 35, 35];
  const lidR = LM.eyeA.upper.map(P), lidL = LM.eyeB.upper.map(P);
  const d2seg = (x: number, y: number, a: Pt, b: Pt): number => { const dx = b.x - a.x, dy = b.y - a.y, k = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(x - a.x - k * dx, y - a.y - k * dy); };
  const near = (path: Pt[], x: number, y: number, r: number): boolean => path.some((_, i) => i > 0 && d2seg(x, y, path[i - 1]!, path[i]!) <= r);
  /** 두꺼운 속눈썹 띠: 얼굴 점 선 위아래 4px (눈 폭 90px 의 4.4%) */
  const lashes: Paint = (x, y) => (near(lidR, x, y, 4) || near(lidL, x, y, 4) ? LASH : null);
  const upBy = (path: Pt[], d: number): Pt[] => path.map((q) => ({ x: q.x, y: q.y - d }));
  /** 속눈썹 띠 바로 위 피부에 그린 라이너 (선에서 위로 4~8px) + 꼬리 */
  const g = geomOf("liner").liner!;
  const linerAbove: Paint = (x, y) => {
    const r = [...upBy(lidR, 6).reverse(), { x: g.wing.R[1].x, y: g.wing.R[1].y - 6 }], l = [...upBy(lidL, 6).reverse(), { x: g.wing.L[1].x, y: g.wing.L[1].y - 6 }];
    return near(r, x, y, 2) || near(l, x, y, 2) ? INK : null;
  };
  /** 눈 감은 얼굴 점: 아랫눈꺼풀 점을 윗눈꺼풀 자리로 */
  const closedLm = LMS.map((q) => ({ ...q }));
  for (const [u, l] of [[159, 145], [158, 153], [386, 374], [385, 380]] as const) closedLm[l] = { ...closedLm[u]! };
  const closedFrame = (p: Paint) => frameOf(image(p), closedLm);

  it("L1 맨피부면 옮길 게 없다 (0) · 속눈썹 띠가 있으면 그 윗경계만큼", () => {
    expect(lidEdge(frame(() => null), "R").every((v) => v === 0)).toBe(true);
    const e = lidEdge(frame(lashes), "R"), mid = e[4]!;
    expect(mid).toBeGreaterThan(0.025);
    expect(mid).toBeLessThan(0.075);
  });

  it("L2 옮긴 얼굴 점은 윗눈꺼풀 점만 위로 간다", () => {
    const f = frame(lashes), lifted = liftLid(f, { R: lidEdge(f, "R"), L: lidEdge(f, "L") });
    expect(lifted.lm[159]!.y).toBeLessThan(f.lm[159]!.y - 2);
    expect(lifted.lm[61]).toEqual(f.lm[61]);   // 입술 점은 그대로
  });

  it("L3 속눈썹 띠 위 피부에 그린 라이너 — 기준선을 옮겨야 가이드 자리로 읽힌다", () => {
    const bare = frame(lashes), cur = frame(over(linerAbove, lashes));
    const h = scoreHybrid("liner", bare, cur, guide, { templateColor: INK });
    expect(h.route).toBe("liner_mix");
    expect(h.result.score).toBeGreaterThanOrEqual(70);
    expect(h.result.codes.some((c) => c.startsWith("LINER_OUT"))).toBe(false);
  });

  it("L4 두 사진이 다 눈 감은 장이면 양 끝(눈꼬리 · 앞트임)만, 획 추출로 채점한다", () => {
    const bare = closedFrame(lashes), cur = closedFrame(over(linerAbove, lashes));
    const h = scoreHybrid("liner", bare, cur, guide, { templateColor: INK });
    expect(h.route).toBe("liner_closed");
    expect(h.result.score).toBeGreaterThanOrEqual(70);
    expect(scoreHybrid("liner", bare, bare, guide, { templateColor: INK }).result.present).toBe(false);
  });

  // ---- 두 장(눈 뜸 + 눈 감음)을 합쳐 채점 ----
  /** 속눈썹 띠 위 피부의 라이너 — from: 눈머리 쪽에서 건너뛸 점 수, r: 반 두께(px), wingK: 꼬리 길이 배수 */
  const liner = (o: { from?: number; r?: number; wingK?: number } = {}): Paint => {
    const k = o.wingK ?? 1, tip = (w: readonly [Pt, Pt]): Pt => ({ x: w[0].x + (w[1].x - w[0].x) * k, y: w[0].y + (w[1].y - w[0].y) * k - 6 });
    const r = [...upBy(lidR, 6).reverse().slice(o.from ?? 0), ...(k > 0 ? [tip(g.wing.R)] : [])], l = [...upBy(lidL, 6).reverse().slice(o.from ?? 0), ...(k > 0 ? [tip(g.wing.L)] : [])];
    return (x, y) => (near(r, x, y, o.r ?? 2) || near(l, x, y, o.r ?? 2) ? INK : null);
  };
  const pair = (p: Paint | null) => scoreLinerPair(
    { base: frame(lashes), cur: frame(p ? over(p, lashes) : lashes) },
    { base: closedFrame(lashes), cur: closedFrame(p ? over(p, lashes) : lashes) },
    guide, { templateColor: INK });
  const extra = (h: ReturnType<typeof pair>): string[] => (h.result.metrics as { endCodes?: string[] }).endCodes ?? [];

  it("P1 두 장 다 가이드대로면 높은 점수 · 지적 없음, 아무것도 안 그렸으면 그린 게 없다", () => {
    const h = pair(liner());
    expect(h.route).toBe("liner_pair");
    expect(h.result.score).toBeGreaterThanOrEqual(75);
    expect(extra(h)).toEqual([]);
    expect(pair(null).result.present).toBe(false);
  });

  it("P2 앞쪽을 비우면 '앞쪽이 비었다' — 감점은 한 번만 (채움으로), '많이' 까지 떨어지지 않는다", () => {
    const ok = pair(liner()), h = pair(liner({ from: 3 }));
    expect(extra(h)).toEqual(expect.arrayContaining(["LINER_INNER_SHORT_R", "LINER_INNER_SHORT_L"]));
    expect(h.result.score!).toBeLessThan(ok.result.score!);
    expect(h.result.score!).toBeGreaterThanOrEqual(50);
  });

  it("P3 꼬리를 안 그리면 '꼬리가 짧아요'", () => {
    const h = pair(liner({ wingK: 0 }));
    expect(h.result.codes).toEqual(expect.arrayContaining(["LINER_WING_SHORT_R", "LINER_WING_SHORT_L"]));
  });

  it("P4 두껍게 번지면 번짐으로 크게 깎인다", () => {
    const ok = pair(liner()), h = pair(liner({ r: 9, wingK: 1.8 }));
    expect(h.result.score!).toBeLessThan(ok.result.score! - 25);
  });

  it("P5 눈 감은 장이 없으면(둘째 쌍도 뜬 눈) 뜬 눈 채점 그대로", () => {
    const open = { base: frame(lashes), cur: frame(over(liner(), lashes)) };
    expect(scoreLinerPair(open, open, guide, { templateColor: INK }).route).toBe("liner_mix");
  });
});

describe("라이너 꼬리 — 눈꼬리 부채꼴 훑기 (linerFan · eyeShift · scoreLinerWing)", () => {
  // 조사(2026-10-05): 가이드 선 둘레 띠에서만 재면 가이드와 다른 각도로 그린 꼬리의 길이를 못 잰다 (liner_real: 가이드의 2배 꼬리 8눈 중 '길다' 한 번).
  // 눈꼬리 점을 중심으로 각도 × 거리 부채꼴을 훑어 확인 사진에만 있는 가는 어두운 선의 끝을 꼬리 끝으로 본다 — 가이드는 재고 난 뒤 견주기만 한다
  const INK: Rgb = [30, 25, 28], CREASE: Rgb = [150, 105, 90], MOLE: Rgb = [125, 90, 75];
  const eyeW = NATURAL.unit.eye;
  /**
   * 눈꼬리(end = inner 면 눈머리)에서 바깥으로 뻗는 곧은 선 — 각도 deg(눈 축 기준, 위가 +), 거리 from~len(눈 폭 비율), 반 두께 half(px).
   * 끝은 각지게 자른다 (둥글리면 반 두께만큼 길어져 길이를 그대로 못 견준다). 합성 얼굴의 눈 축은 수평이라 '위' 는 화면 위
   */
  const ray = (s: Side, deg: number, len: number, o: { end?: "outer" | "inner"; from?: number; half?: number; color?: Rgb } = {}): Paint => {
    const c = P(o.end === "inner" ? eyeOf(s).inner : eyeOf(s).outer), far = P(o.end === "inner" ? eyeOf(s).outer : eyeOf(s).inner);
    const t = (deg * Math.PI) / 180, d = { x: Math.sign(c.x - far.x) * Math.cos(t), y: -Math.sin(t) };
    return (x, y) => {
      const u = (x - c.x) * d.x + (y - c.y) * d.y, v = Math.abs((y - c.y) * d.x - (x - c.x) * d.y);
      return u >= (o.from ?? 0) * eyeW && u <= len * eyeW && v <= (o.half ?? 2) ? o.color ?? INK : null;
    };
  };
  const both = (f: (s: Side) => Paint): Paint => over(f("R"), f("L"));
  /** 눈꼬리 아래 · 눈머리 아래의 점 — 라이너가 닿지 않는 자리의 무늬 (미세 맞춤이 이걸로 맞춘다). 왼쪽 눈은 거울상 */
  const DOTS: readonly (readonly [number, number, number])[] = [[172, 268, 2], [160, 277, 2.5], [184, 281, 2], [166, 289, 2.5], [178, 262, 1.5], [258, 268, 2], [270, 277, 2.5], [246, 281, 2], [264, 289, 2.5]];
  const underEye: Paint = (x, y) => { const mx = x > W / 2 ? W - x : x; return DOTS.some(([cx, cy, r]) => Math.hypot(mx - cx, y - cy) <= r) ? MOLE : null; };
  /** 맨얼굴: 속눈썹 · 눈알 + 눈꼬리 주름(어긋나면 '새 선' 으로 읽힐 것) + 눈 밑 점. 한 번 그려 두고 화소를 꺼내 쓴다 (프레임을 수십 장 만든다) */
  const skinIm = image(over(both((s) => ray(s, -25, 0.26, { from: 0.06, half: 1, color: CREASE })), over(underEye, naturalPaint)));
  const skin: Paint = (x, y) => { if (x < 0 || y < 0 || x >= W || y >= skinIm.h) return null; const i = (y * W + x) * 4; return [skinIm.data[i]!, skinIm.data[i + 1]!, skinIm.data[i + 2]!]; };
  const NAT = frame(skin);
  const drawn = (p: Paint | null): Paint => (p ? over(p, skin) : skin);
  /** 눈 감은 얼굴 점: 아랫눈꺼풀 점을 윗눈꺼풀 자리로 */
  const closedLm = LMS.map((q) => ({ ...q }));
  for (const [u, l] of [[159, 145], [158, 153], [386, 374], [385, 380]] as const) closedLm[l] = { ...closedLm[u]! };
  const shut = (p: Paint) => frameOf(image(p), closedLm);

  it("F1 가이드(30도 · 눈 폭 15%)와 다른 각도 · 길이의 꼬리를 그대로 잰다 — 가이드 띠 밖이어도", () => {
    for (const [deg, len] of [[5, 0.3], [45, 0.2], [-15, 0.25]] as const) {
      const t = linerFan(NAT, frame(drawn(ray("R", deg, len))), "R");
      expect(t.found).toBe(true);
      expect(Math.abs(t.r - len)).toBeLessThan(0.025);
      expect(Math.abs(t.deg - deg)).toBeLessThan(4);
    }
    // 왼쪽 눈도 같은 부호 (위가 +, 바깥이 0도)
    const l = linerFan(NAT, frame(drawn(ray("L", 20, 0.28))), "L");
    expect(Math.abs(l.r - 0.28)).toBeLessThan(0.025);
    expect(Math.abs(l.deg - 20)).toBeLessThan(4);
  });

  it("F2 맨얼굴끼리는 꼬리도 눈머리 넘김도 없다 (속눈썹 · 눈꼬리 주름이 있어도)", () => {
    for (const s of ["R", "L"] as const) for (const end of ["outer", "inner"] as const) expect(linerFan(NAT, NAT, s, { end }).found).toBe(false);
    expect(linerFan(BARE, BARE, "R").found).toBe(false);
  });

  it("F3 사진이 2~3px 어긋나면 눈꼬리 주름이 가짜 꼬리가 된다 — 미세 맞춤(eyeShift)으로 되돌리면 없다", () => {
    // 얼굴 점은 그대로 두고 사진만 옮긴다 = 눈 틀이 그만큼 어긋난 것. 주름을 가로질러 2.5px 넘게 옮긴 경우들
    for (const [dx, dy] of [[2, 3], [-3, -2], [0, 3]] as const) {
      const cur = frame(shifted(skin, dx, dy));
      expect(linerFan(NAT, cur, "R").found).toBe(true);
      const sh = eyeShift(NAT, cur, "R");
      expect([sh.x, sh.y]).toEqual([dx, dy]);
      expect(linerFan(NAT, cur, "R", { shift: sh }).found).toBe(false);
      expect(linerFan(NAT, cur, "R", { shift: sh, end: "inner" }).found).toBe(false);
    }
  });

  it("F4 미세 맞춤은 그린 선에 끌려가지 않는다 — 라이너가 닿지 않는 눈꼬리 아래 자리로 맞춘다", () => {
    const liner = over(ray("R", 8, 0.3), linerPaint());   // 눈꺼풀 선 + 가이드 꼬리 + 가이드보다 낮고 긴 꼬리
    const cur = frame(shifted(drawn(liner), 2, -2));
    const sh = eyeShift(NAT, cur, "R");
    expect([sh.x, sh.y]).toEqual([2, -2]);
    expect(sh.fit).toBeGreaterThan(0.95);   // 그 자리의 무늬가 그대로 겹친다
    const t = linerFan(NAT, cur, "R", { shift: sh });
    expect(Math.abs(t.r - 0.3)).toBeLessThan(0.025);
    expect(Math.abs(t.deg - 8)).toBeLessThan(4);
    // 눈머리 쪽은 눈머리 아래 자리로 따로 맞춘다
    const inner = eyeShift(NAT, cur, "R", "inner");
    expect([inner.x, inner.y]).toEqual([2, -2]);
    // 맞출 무늬가 없으면(살색 판) 옮기지 않는다
    const flat = eyeShift(BARE, frame(shifted(liner, 2, -2)), "R");
    expect([flat.x, flat.y]).toEqual([0, 0]);
  });

  it("F7 두 사진의 밝기가 달라도(전체가 어둡고 한쪽으로 기울게) 미세 맞춤은 무늬를 따라간다", () => {
    // 견주는 것이 밝기가 아니라 무늬(둘레 평균을 뺀 밝기)의 상관이라 밝기 · 대비 · 완만한 기울기가 달라도 같은 자리를 찾는다
    const lit = image(shifted(skin, -2, 1));
    for (let y = 0; y < lit.h; y++) for (let x = 0; x < lit.w; x++) { const i = (y * lit.w + x) * 4, k = 0.6 + (0.3 * x) / lit.w; for (let c = 0; c < 3; c++) lit.data[i + c] = lit.data[i + c]! * k; }
    const sh = eyeShift(NAT, frameOf(lit, LMS), "R");
    expect([sh.x, sh.y]).toEqual([-2, 1]);
  });

  it("F5 눈머리 너머로 뺀 선은 눈머리 쪽 부채꼴이 잰다 — 눈꼬리 쪽 부채꼴에는 안 걸린다", () => {
    const cur = frame(drawn(ray("R", -10, 0.1, { end: "inner" })));
    const t = linerFan(NAT, cur, "R", { end: "inner" });
    expect(t.found).toBe(true);
    expect(Math.abs(t.r - 0.1)).toBeLessThan(0.025);
    expect(linerFan(NAT, cur, "R").found).toBe(false);
  });

  it("F6 눈꼬리 바깥의 넓은 그늘은 꼬리가 아니다 — 기본 칸 값(각도 방향 톱햇)은 가는 선만 본다. 색 차이로 보면 꼬리로 읽는다", () => {
    const corner = P(LM.eyeA.outer);
    // 눈꼬리 바깥 아래쪽, 눈 폭 15% 밖 전부. (그보다 안쪽까지 닿는 그늘은 톱햇도 가는 것으로 읽는다 — 가까운 줄은 각도 창이 넓다)
    const shade: Paint = (x, y) => (x < corner.x && y > corner.y && Math.hypot(x - corner.x, y - corner.y) >= 0.15 * eyeW ? [150, 108, 86] : null);
    const cur = frame(drawn(shade));
    expect(linerFan(NAT, cur, "R").found).toBe(false);
    expect(linerFan(NAT, cur, "R", { value: "dE" }).found).toBe(true);
    // 그늘 위에 그린 꼬리는 잡는다
    const t = linerFan(NAT, frame(over(ray("R", -10, 0.3), drawn(shade))), "R");
    expect(Math.abs(t.r - 0.3)).toBeLessThan(0.025);
  });

  // ---- 판정 (scoreLinerWing): 가이드와 비슷한가 — 그린 꼬리 끝과 가이드 꼬리 끝 사이의 거리 하나로 (결정 2026-10-06) ----
  /** open · closed = 눈 뜬 장 · 눈 감은 장에 그린 것 (null = 안 그림 · 안 보임). closed 를 안 주면 눈 감은 쌍이 없다 */
  const wing = (open: Paint | null, closed?: Paint | null, gs: GuideSource = guide): PartScore => scoreLinerWing(
    { base: NAT, cur: frame(drawn(open)) },
    closed === undefined ? null : { base: shut(skin), cur: shut(drawn(closed)) },
    gs);
  const extra = (r: PartScore): string[] => (r.metrics as { endCodes?: string[] }).endCodes ?? [];
  const eyes = (r: PartScore): Record<Side, LinerWingEye> => (r.metrics as { wing: Record<Side, LinerWingEye> }).wing;
  const match = (r: PartScore): WingMatch | null => (r.metrics as { match: WingMatch | null }).match;
  /** 화면에 접는 세 단계 (맞음 80 이상 · 조금 50 이상 · 많이) — 판정 단계와 같아야 한다 */
  const fold = (r: PartScore): string => { const s = decide("liner", r).score; return s === null ? "없음" : s >= 80 ? "similar" : s >= 50 ? "slight" : "far"; };
  /** 같은 꼬리가 눈 감은 장에서는 더 가파르고 짧게 재진다 (조사: 뜬 눈 -11~8도 · 23~34%, 감은 눈 36~51도 · 19~25%) — 눈 뜬 눈 기준 길이 len 의 꼬리를 눈 감은 장에 그린 것 */
  const shutTail = (len: number, sides: readonly Side[] = ["R", "L"]): Paint => (x, y) => sides.map((s) => ray(s, 40, len * LINER_WING.closedRatio)(x, y)).find((c) => c) ?? null;
  const innerOver = both((s) => ray(s, -10, 0.1, { end: "inner" }));
  const GUIDE_LEN = 0.15, GUIDE_DEG = 30;   // 시험용 가이드의 꼬리 (synth-face guide)

  it("W1 가이드보다 길게 뺀 꼬리는 눈 뜬 장으로 '달라요 · 길어요' — 점수가 80 아래다 (전에는 아무리 길어도 80점 '맞음')", () => {
    const r = wing(both((s) => ray(s, GUIDE_DEG, 0.32)), shutTail(0.32));
    expect(r.present).toBe(true);
    expect(extra(r)).toEqual(expect.arrayContaining(["LINER_WING_LONG_R", "LINER_WING_LONG_L"]));
    expect(r.codes).toEqual([]);
    expect(eyes(r).R.length).toBe("long");
    expect(Math.abs(eyes(r).R.drawn! - 0.32)).toBeLessThan(0.025);
    expect(Math.abs(eyes(r).R.guide - GUIDE_LEN)).toBeLessThan(0.005);
    expect(Math.abs(eyes(r).R.guideDeg - GUIDE_DEG)).toBeLessThan(1);
    // 끝 사이 거리 = 길이 차 17%p (각도는 가이드와 같다)
    expect(Math.abs(eyes(r).R.off! - 0.17)).toBeLessThan(0.03);
    expect(match(r)).toBe("far");
    expect(r.score!).toBeLessThan(80);
    expect(fold(r)).toBe("far");
    // 조금만 길면 '조금 달라요'
    const some = wing(both((s) => ray(s, GUIDE_DEG, 0.23)), shutTail(0.23));
    expect(match(some)).toBe("slight");
    expect(fold(some)).toBe("slight");
    expect(extra(some)).toEqual(expect.arrayContaining(["LINER_WING_LONG_R", "LINER_WING_LONG_L"]));
  });

  it("W2 가이드대로 그린 꼬리는 '비슷해요' — 눈 뜬 장에서 놓쳐도 눈 감은 장에서 잡히면 된다. 지적 없음", () => {
    const r = wing(null, shutTail(GUIDE_LEN));   // 눈 뜬 장에서는 안 보였다 (꼬리 뿌리 자리가 원래 어둡다)
    expect(r.present).toBe(true);
    expect(eyes(r).R.length).toBe("ok");
    expect(eyes(r).L.length).toBe("ok");
    expect(Math.abs(eyes(r).R.drawn! - GUIDE_LEN)).toBeLessThan(0.04);
    expect(eyes(r).R.dDeg).toBeNull();   // 각도는 눈 뜬 장에서 찾았을 때만 본다
    expect(eyes(r).R.off!).toBeLessThanOrEqual(PARAMS.tol.wingShort);
    expect(match(r)).toBe("similar");
    expect(r.score!).toBeGreaterThanOrEqual(80);
    expect(fold(r)).toBe("similar");
    expect(r.codes).toEqual([]);
    expect(extra(r)).toEqual([]);
    expect((r.metrics as { edge: boolean }).edge).toBe(false);
    // 눈 뜬 장에서도 보이면 각도까지 견준다 — 그대로 '비슷해요'
    const both2 = wing(both((s) => ray(s, GUIDE_DEG, GUIDE_LEN)), shutTail(GUIDE_LEN));
    expect(eyes(both2).R.length).toBe("ok");
    expect(Math.abs(eyes(both2).R.dDeg!)).toBeLessThan(4);
    expect(match(both2)).toBe("similar");
  });

  it("W3 꼬리를 못 찾은 눈은 '많이 달라요 · 없어요' — 한쪽만 없어도 전체가 많이 다르다", () => {
    const r = wing(null, shutTail(GUIDE_LEN, ["R"]));
    expect(r.codes).toEqual(["LINER_WING_SHORT_L"]);
    expect(eyes(r).L.length).toBe("none");
    expect(eyes(r).L.match).toBe("far");
    expect(eyes(r).R.match).toBe("similar");
    expect(match(r)).toBe("far");
    expect(r.score!).toBeLessThan(50);
    expect(fold(r)).toBe("far");
    // 가이드 꼬리가 길 때: 찾았지만 가이드보다 허용 폭 넘게 짧으면 '짧다'
    const longGuide: GuideSource = (partId, f) => {
      const g0 = guide(partId, f), ext = (w: readonly [Pt, Pt]): readonly [Pt, Pt] => [w[0], { x: w[0].x + (w[1].x - w[0].x) * 2, y: w[0].y + (w[1].y - w[0].y) * 2 }];
      return g0.liner ? { liner: { ...g0.liner, wing: { R: ext(g0.liner.wing.R), L: ext(g0.liner.wing.L) } } } : g0;
    };
    const s = wing(null, shutTail(GUIDE_LEN), longGuide);
    expect(eyes(s).R.length).toBe("short");
    expect(s.codes).toEqual(expect.arrayContaining(["LINER_WING_SHORT_R", "LINER_WING_SHORT_L"]));
    expect(match(s)).not.toBe("similar");
    expect(s.score!).toBeLessThan(80);
  });

  it("W4 눈 감은 쌍이 없으면(null) '길다' 만 판정한다 — 그 밖의 눈과 눈머리 넘김은 판정하지 않는다", () => {
    const long = wing(ray("R", 5, 0.32));
    expect(extra(long)).toContain("LINER_WING_LONG_R");
    expect(long.codes.filter((c) => c.startsWith("LINER_WING_SHORT"))).toEqual([]);   // 왼쪽 꼬리가 안 보여도 '짧아요' 를 붙이지 않는다 — 눈 뜬 장은 짧은 꼬리를 자주 놓친다
    expect(eyes(long).L.length).toBeNull();
    expect(eyes(long).L.match).toBeNull();
    expect(eyes(long).L.closed).toBeNull();
    expect(match(long)).toBe("far");   // 판정한 눈만으로
    const over1 = wing(innerOver);
    expect(extra(over1)).toEqual([]);
    expect(eyes(over1).R.innerOver).toBeNull();
    // 눈 뜬 장에서 가이드 길이 꼬리가 보여도 '비슷해요' 로 치지 않는다 — 판정한 것이 없으니 점수도 없다
    const seen = wing(both((s) => ray(s, 30, GUIDE_LEN)));
    expect(seen.present).toBe(true);
    expect(eyes(seen).R.open.found).toBe(true);
    expect(eyes(seen).R.length).toBeNull();
    expect(seen.score).toBeNull();
    expect(match(seen)).toBeNull();
    expect(seen.codes).toEqual([]);
    // 둘째 쌍이 눈 감은 장이 아니면 없는 것으로 본다
    const open = { base: NAT, cur: frame(drawn(ray("R", 5, 0.32))) };
    expect(eyes(scoreLinerWing(open, open, guide)).L.length).toBeNull();
  });

  it("W5 좌우 꼬리 길이가 허용 폭 넘게 다르면 알린다 — 두 눈이 각각 가이드와 비슷해도 '조금 달라요' 로 한 칸 내린다", () => {
    const r = wing(over(ray("R", 5, 0.32), ray("L", 5, 0.24)));
    const lr = (r.metrics as { lrLen: number | null }).lrLen!;
    expect(Math.abs(lr - 0.08)).toBeLessThan(0.03);   // R − L
    expect(lr).toBeGreaterThan(PARAMS.tol.lrDiff);
    expect(extra(r)).toContain("LINER_WING_LR_LEN");
    expect(extra(wing(both((s) => ray(s, 5, 0.32))))).not.toContain("LINER_WING_LR_LEN");
    // 눈 뜬 장에서 안 보인 꼬리는 눈 감은 장의 길이로 견준다
    const c = wing(null, over(shutTail(0.3, ["R"]), shutTail(0.16, ["L"])));
    expect(extra(c)).toContain("LINER_WING_LR_LEN");
    expect((c.metrics as { lrLen: number | null }).lrLen!).toBeGreaterThan(0.08);
    // 한쪽은 가이드보다 조금 길고 한쪽은 조금 짧다 — 눈마다는 '비슷해요' 지만 좌우가 다르다
    const m = wing(null, over(shutTail(0.185, ["R"]), shutTail(0.12, ["L"])));
    expect(eyes(m).R.match).toBe("similar");
    expect(eyes(m).L.match).toBe("similar");
    expect(extra(m)).toEqual(["LINER_WING_LR_LEN"]);
    expect(match(m)).toBe("slight");
    expect(fold(m)).toBe("slight");
  });

  it("W6 눈머리 너머로 뺀 선은 '눈머리를 넘겼다' — 꼬리가 가이드대로여도 '조금 달라요'", () => {
    const r = wing(null, over(innerOver, shutTail(GUIDE_LEN)));
    expect(extra(r)).toEqual(expect.arrayContaining(["LINER_INNER_OVER_R", "LINER_INNER_OVER_L"]));
    expect(Math.abs(eyes(r).R.innerOver! - 0.1)).toBeLessThan(0.025);
    expect(match(r)).toBe("slight");
    expect(fold(r)).toBe("slight");
    expect(eyes(wing(null, shutTail(GUIDE_LEN))).R.innerOver).toBe(0);
  });

  it("W7 맨얼굴끼리는 그린 게 없다 — 점수도 지적도 없다", () => {
    for (const r of [wing(null, null), wing(null)]) {
      expect(r.present).toBe(false);
      expect(r.score).toBeNull();
      expect(match(r)).toBeNull();
      expect(r.codes).toEqual([]);
      expect(extra(r)).toEqual([]);
    }
  });

  it("W8 점수 — 가이드대로 > 눈머리를 넘긴 것 > 길게 뺀 꼬리 · 한쪽 꼬리가 없는 것. 접은 단계가 판정과 같다", () => {
    const ok = wing(null, shutTail(GUIDE_LEN)).score!;
    expect(ok).toBeGreaterThanOrEqual(90);
    const inner = wing(null, over(innerOver, shutTail(GUIDE_LEN))).score!;
    expect(inner).toBeLessThan(80);
    expect(inner).toBeGreaterThanOrEqual(50);
    expect(wing(both((s) => ray(s, 5, 0.32)), shutTail(0.32)).score!).toBeLessThan(50);
    expect(wing(null, shutTail(GUIDE_LEN, ["R"])).score!).toBeLessThan(50);
    // 길수록 낮다 — 상한 없이 끝 사이 거리를 따라간다
    expect(wing(both((s) => ray(s, GUIDE_DEG, 0.3)), shutTail(0.3)).score!).toBeLessThan(wing(both((s) => ray(s, GUIDE_DEG, 0.24)), shutTail(0.24)).score!);
  });

  it("W9 길이가 가이드와 같아도 각도가 크게 다르면 '달라요' — 위로 · 아래로. 각도는 눈 뜬 장에서 꼬리를 찾았을 때만 본다", () => {
    // 가이드 30도 · 15% 인데 65도로 세워 그렸다: 끝 사이 거리 = 2 × 15% × sin(35도 / 2) = 9%
    const up = wing(both((s) => ray(s, 65, GUIDE_LEN)), shutTail(GUIDE_LEN));
    expect(eyes(up).R.open.found).toBe(true);
    expect(eyes(up).R.length).toBe("ok");
    expect(eyes(up).R.dDeg!).toBeGreaterThan(25);
    expect(Math.abs(eyes(up).R.off! - 0.09)).toBeLessThan(0.03);
    expect(match(up)).not.toBe("similar");
    expect(up.score!).toBeLessThan(80);
    expect(up.codes).toEqual(expect.arrayContaining(["LINER_WING_HIGH_R", "LINER_WING_HIGH_L"]));
    expect(extra(up)).toEqual([]);   // 길다고 하지 않는다
    // 길고 눕혀 그렸다 (가이드보다 35도 아래) — 길이 차와 각도 차가 한 값에 같이 들어간다: 길이만 같은 만큼 긴 것보다 더 다르다
    const low = wing(both((s) => ray(s, -5, 0.25)), shutTail(0.25)), straight = wing(both((s) => ray(s, GUIDE_DEG, 0.25)), shutTail(0.25));
    expect(low.codes).toEqual(expect.arrayContaining(["LINER_WING_LOW_R", "LINER_WING_LOW_L"]));
    expect(extra(low)).toEqual(expect.arrayContaining(["LINER_WING_LONG_R", "LINER_WING_LONG_L"]));
    expect(eyes(low).R.off!).toBeGreaterThan(eyes(straight).R.off! + 0.02);
    expect(low.score!).toBeLessThan(straight.score!);
  });

  it("W10 미세 맞춤이 범위 끝에 걸린 눈도 판정한다 — 표시만 남긴다 (metrics.edge)", () => {
    const far = Math.ceil(eyeW * EYE_SHIFT.range);   // 사진이 맞춤 범위 끝만큼 어긋났다
    const r = scoreLinerWing({ base: NAT, cur: frame(shifted(drawn(both((s) => ray(s, GUIDE_DEG, 0.32))), far, 0)) }, null, guide);
    expect(eyes(r).R.open.reg!.edge).toBe(true);
    expect(eyes(r).R.edge).toBe(true);
    expect((r.metrics as { edge: boolean }).edge).toBe(true);
    expect(match(r)).toBe("far");
    expect(r.score).not.toBeNull();
  });
});

// 마지막 전체 사진 한 장을 '정답 그림'(맨얼굴에 화장을 입힌 그림)과 부위별로 견준다 — 부위마다 바로 주변 피부 대비 색이 얼마나 바뀌었나
describe("마지막 전체 사진 — 정답 그림과 비교 (scoreWhole)", () => {
  const regions: WholeRegions = (f) => { const g = guide("shadow", f).regions!; return { polys: [g.R, g.L] }; };
  const POLYS = regions(frameOf(image(), LMS)).polys;
  const inRegion = (x: number, y: number) => POLYS.some((p) => pointInPoly(x, y, p));
  const tint = (c: Rgb, k: number): Paint => (x, y) => (inRegion(x, y) ? (SKIN.map((s, i) => Math.round(s + (c[i]! - s) * k)) as unknown as Rgb) : null);
  const bare = frame(() => null), target = frame(tint(RED, 0.5));
  const run = (p: Paint, gain = 1) => scoreWhole(bare, target, frameOf(image(p, gain), LMS), regions);

  it("X1 정답 그림과 같게 칠하면 '비슷' · 양 1", () => {
    const r = run(tint(RED, 0.5));
    expect(r.verdict).toBe("similar");
    expect(r.amount!).toBeCloseTo(1, 1);
  });

  it("X2 아무것도 안 칠하면 '안 그림' · 양 0", () => {
    const r = run(() => null);
    expect(r.verdict).toBe("none");
    expect(Math.abs(r.amount!)).toBeLessThan(0.05);
  });

  it("X3 조명이 달라도 판정이 같다 — 기준이 그 사진의 주변 피부라서", () => {
    expect(run(() => null, 0.8).verdict).toBe("none");
    expect(run(tint(RED, 0.5), 0.8).verdict).toBe("similar");
  });

  it("X4 옅게 칠하면 '옅음' · 진하게 칠하면 '진함'", () => {
    expect(run(tint(RED, 0.22)).verdict).toBe("weak");
    expect(run(tint(RED, 0.95)).verdict).toBe("strong");
  });

  it("X5 다른 색으로 칠하면 '색 다름'", () => {
    expect(run(tint([70, 110, 190], 0.5)).verdict).toBe("color");
  });

  it("X6 정답 그림에서 그 부위가 거의 안 바뀌었으면 채점하지 않는다 (확인만)", () => {
    const r = scoreWhole(bare, frame(tint(RED, 0.05)), frame(tint(RED, 0.5)), regions);
    expect(r.verdict).toBe("check_only");
    expect(r.target).toBeLessThan(WHOLE.minTarget);
  });

  it("X7 둘레에서 빼라고 한 자리가 달라져도 값이 안 변한다", () => {
    // 영역 바깥쪽 옆(둘레 띠가 지나는 자리)을 빼라고 한다 — 실제로는 눈 · 눈썹처럼 사진마다 달라지는 곳
    const eyes: WholeRegions = (f) => { const r = regions(f); return { ...r, avoid: r.polys.map((p) => { const xs = p.map((q) => q.x), ys = p.map((q) => q.y), x0 = Math.min(...xs) - f.unit.eye, x1 = Math.max(...xs) + f.unit.eye, y0 = Math.min(...ys) - f.unit.eye, y1 = Math.min(...ys) + 2; return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]; }) }; };
    const AVOID = eyes(bare).avoid!;
    const dark: Paint = (x, y) => (AVOID.some((p) => pointInPoly(x, y, p)) && !inRegion(x, y) ? INK : tint(RED, 0.5)(x, y));
    const a = scoreWhole(bare, target, frame(tint(RED, 0.5)), eyes), b = scoreWhole(bare, target, frame(dark), eyes);
    expect(b.amount!).toBeCloseTo(a.amount!, 2);
    expect(scoreWhole(bare, target, frame(dark), regions).amount!).not.toBeCloseTo(a.amount!, 2);   // 안 빼면 변한다
  });

  it("X8 기준 피부(ref)를 주면 둘레 띠 대신 그것을 쓴다 — 옆 구역이 칠해져 있어도 값이 안 변한다", () => {
    const half = (f: SampleFrame) => regions(f).polys.map((p) => { const top = Math.min(...p.map((q) => q.y)), mid = top + 8; return [{ x: Math.min(...p.map((q) => q.x)) + 30, y: top + 2 }, { x: Math.max(...p.map((q) => q.x)) - 30, y: top + 2 }, { x: Math.max(...p.map((q) => q.x)) - 30, y: mid }, { x: Math.min(...p.map((q) => q.x)) + 30, y: mid }]; });
    const fore = (f: SampleFrame) => [[{ x: f.lm[10]!.x - 40, y: f.lm[10]!.y + 20 }, { x: f.lm[10]!.x + 40, y: f.lm[10]!.y + 20 }, { x: f.lm[10]!.x + 40, y: f.lm[10]!.y + 50 }, { x: f.lm[10]!.x - 40, y: f.lm[10]!.y + 50 }]];
    const withRef: WholeRegions = (f) => ({ polys: half(f), ref: fore(f) }), noRef: WholeRegions = (f) => ({ polys: half(f) });
    // 정답도 시도도 영역 전체를 같은 색으로 칠했다 — 작은 구역의 둘레 띠는 칠한 자리라 대비가 0 에 가깝다
    expect(scoreWhole(bare, target, frame(tint(RED, 0.5)), withRef).verdict).toBe("similar");
    expect(scoreWhole(bare, target, frame(tint(RED, 0.5)), noRef).verdict).toBe("check_only");
  });
});
