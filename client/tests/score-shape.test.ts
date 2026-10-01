// 결과 모양 채점 실험 (score-shape 브랜치, 2026-10-01) — 맨얼굴과 비교하지 않고 **지금 사진 한 장**에서
// "가이드 안이 얼마나 채워져 있나" 를 잰다. 원래 있던 눈썹과 새로 그린 것을 가리지 않는다 (팀 방향: 눈썹이 이미 정답 모양이면 무시하지 않는다)
import { describe, expect, it } from "vitest";
import { LM } from "@core/landmarks";
import { frameOf } from "@core/sampling";
import { browShape, linerBand, routeOf, scoreHybrid, shapeFill, tintFill, tintProgress } from "@core/score-shape";
import { decide } from "@core/score";
import type { GuideSource } from "@core/score-part";
import { rgbToLab } from "@core/color";
import { sampleLiner } from "@core/sampling";
import type { Pt } from "@core/types";
import { BROWN, LMS, NATURAL, P, RED, SKIN, browPaint, geomOf, guide, image, linerPaint, lipPaint, regionPaint, type Paint } from "./helpers/synth-face";

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

  it("C6 라이너는 항상 원본 대조 — 결과 모양은 눈꼬리 주름을 꼬리로 읽는다", () => {
    const bare = frame(() => null);
    expect(scoreHybrid("liner", bare, frame(linerPaint()), withBrow, { templateColor: [30, 25, 28] }).route).toBe("compare");
  });
});
