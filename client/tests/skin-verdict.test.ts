// 웜/쿨 경향 판정 (b* vs T ± 애매 폭)
import { describe, expect, it } from "vitest";
import { VERDICT_VERSION, WARMCOOL_V0, warmCoolVerdict } from "@core/skin-verdict";
import { evaluate } from "@core/skin-threshold";
import { describeRgb } from "@core/skin-color";

const cfg = { axis: "b", threshold: 20, margin: 3 } as const;

describe("warmCoolVerdict", () => {
  it("V1 T+폭 위는 웜 쪽, T−폭 아래는 쿨 쪽, 그 사이는 애매", () => {
    expect(warmCoolVerdict({ b: 25 }, cfg).tendency).toBe("warm");
    expect(warmCoolVerdict({ b: 15 }, cfg).tendency).toBe("cool");
    for (const b of [17.5, 20, 22.9]) expect(warmCoolVerdict({ b }, cfg).tendency, String(b)).toBe("ambiguous");
  });

  it("V2 경계(|diff| = 폭)는 애매가 아니라 판정 쪽이다 — skin-threshold.evaluate 와 같은 규칙", () => {
    expect(warmCoolVerdict({ b: 23 }, cfg).tendency).toBe("warm");
    expect(warmCoolVerdict({ b: 17 }, cfg).tendency).toBe("cool");
    // evaluate 도 같은 점을 애매로 안 센다
    const e = evaluate([{ v: 23, warm: true }, { v: 17, warm: false }], 20, 1, 3);
    expect(e.kept).toBe(2);
  });

  it("V3 폭 0 이면 애매가 없다 (T 위 웜 · T 이하 쿨)", () => {
    const c = { ...cfg, margin: 0 };
    expect(warmCoolVerdict({ b: 20.01 }, c).tendency).toBe("warm");
    expect(warmCoolVerdict({ b: 20 }, c).tendency).toBe("cool");
  });

  it("V4 결과에 잰 값 · 기준 · 차이가 같이 나온다 (화면이 근거를 보여 주려고)", () => {
    expect(warmCoolVerdict({ b: 24.5 }, cfg)).toEqual({ tendency: "warm", value: 24.5, threshold: 20, margin: 3, diff: 4.5 });
  });

  it("V5 실제 색에서: 노란 기운 볼은 웜 쪽, 분홍 기운 볼은 쿨 쪽 (기본 설정)", () => {
    const yellowish = describeRgb([214, 170, 130]).lab, pinkish = describeRgb([222, 176, 172]).lab;
    expect(yellowish.b).toBeGreaterThan(pinkish.b);
    expect(warmCoolVerdict(yellowish).tendency).toBe("warm");
    expect(warmCoolVerdict(pinkish).tendency).toBe("cool");
  });

  it("V6 기본 설정은 상식 범위이고 버전 이름이 있다", () => {
    expect(WARMCOOL_V0.threshold).toBeGreaterThan(10);
    expect(WARMCOOL_V0.threshold).toBeLessThan(35);
    expect(WARMCOOL_V0.margin).toBeGreaterThan(0);
    expect(VERDICT_VERSION).toMatch(/^warmcool-v\d+\.\d+$/);
  });
});
