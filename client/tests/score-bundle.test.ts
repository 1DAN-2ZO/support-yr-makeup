// 3-3 (#34) 확인받기 프레임 묶음 채점 — 3~5장을 각각 채점해 합친다. 가려진 장은 빼고, 다 가려지면 확인만(hand)
// 점수는 중앙값: 흔들린 한 장이 점수를 끌고 가지 않게. 한 줄 평·사진은 중앙값에 가장 가까운 장(대표 장)에서.
import { describe, expect, it } from "vitest";
import { scoreBundle, scorePart, type BundleInput } from "@core/score-part";
import { toOutcome } from "@core/score";
import { BARE, LMS, guide, image, linerPaint, made, type Paint } from "./helpers/synth-face";

const fr = (paint: Paint, occluded: boolean | null = false): BundleInput => ({ im: image(paint), pts: LMS, occluded });
const good = () => fr(linerPaint());
const bad = () => fr(linerPaint({ R: 14, L: 14 }));   // 꼬리를 크게 올려 그린 장
const none = () => fr(() => null);                    // 아무것도 안 바른 장 → 확인만(faint)
const single = (paint: Paint) => {
  const { result, ctx } = scorePart("liner", BARE, made(paint), guide);
  return toOutcome("liner", result, ctx);
};

describe("프레임 묶음 채점", () => {
  it("한 장이면 그 장만 채점한 것과 같다", () => {
    const b = scoreBundle("liner", BARE, [good()], guide);
    expect(b.outcome.score).toBe(single(linerPaint()).score);
    expect(b.pick).toBe(0);
    expect(b.used).toBe(1);
  });

  it("점수는 중앙값 — 한 장이 튀어도 나머지 둘의 점수를 따른다", () => {
    const g = single(linerPaint()).score!, x = single(linerPaint({ R: 14, L: 14 })).score!;
    expect(x).toBeLessThan(g);   // 전제: 꼬리를 올린 장은 점수가 낮다
    const b = scoreBundle("liner", BARE, [good(), bad(), good()], guide);
    expect(b.outcome.score).toBe(g);
    expect(b.pick).not.toBe(1);
  });

  it("가려진 장(occluded true)은 빼고 채점한다 — 안 잰 장(null)은 쓴다", () => {
    const b = scoreBundle("liner", BARE, [good(), fr(linerPaint({ R: 14, L: 14 }), true), fr(linerPaint(), null)], guide);
    expect(b.used).toBe(2);
    expect(b.excluded).toBe(1);
    expect(b.outcome.score).toBe(single(linerPaint()).score);
    expect(b.outcome.metrics.frames).toEqual({ used: 2, excluded: 1 });
  });

  it("전부 가려졌으면 확인만(hand) — 대표 장이 없다", () => {
    const b = scoreBundle("liner", BARE, [fr(linerPaint(), true), fr(linerPaint(), true)], guide);
    expect(b.outcome.decision).toBe("check_only");
    expect(b.outcome.checkReason).toBe("hand");
    expect(b.outcome.score).toBeNull();
    expect(b.pick).toBeNull();
  });

  it("확인만인 장이 절반보다 많으면 확인만, 이유는 가장 많이 나온 것", () => {
    const b = scoreBundle("liner", BARE, [none(), good(), none()], guide);
    expect(b.outcome.decision).toBe("check_only");
    expect(b.outcome.checkReason).toBe("faint");
  });

  it("점수 난 장이 절반 이상이면 점수 — 확인만인 한 장은 무시", () => {
    const b = scoreBundle("liner", BARE, [good(), none(), good()], guide);
    expect(b.outcome.decision).toBe("scored");
    expect(b.outcome.score).toBe(single(linerPaint()).score);
  });

  it("대표 장의 한 줄 평·코드를 쓴다", () => {
    const b = scoreBundle("liner", BARE, [bad(), bad(), good()], guide);
    const x = single(linerPaint({ R: 14, L: 14 }));
    expect(b.outcome.score).toBe(x.score);
    expect(b.outcome.diagnosisCodes).toEqual(x.diagnosisCodes);
    expect(b.outcome.diagnosis).toBe(x.diagnosis);
  });

  it("장이 하나도 없으면 던진다 — 화면이 '확인받기 결과가 없어요' 로 처리할 일", () => {
    expect(() => scoreBundle("liner", BARE, [], guide)).toThrow(/프레임/);
  });
});
