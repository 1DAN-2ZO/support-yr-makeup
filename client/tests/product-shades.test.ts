// 제품 호수별 색 저장 형식 (rules/product-shades.json) — 형식 · 중복 · 없는 제품 이름을 잡는다.
// 다른 세션이 제품을 채울 때 이 시험이 오타를 막는다.
import { describe, expect, it } from "vitest";
import { PRODUCT_PICKS } from "@core/product-picks";
import {
  PRODUCT_SHADES, PRODUCT_SHADES_VERSION, PRODUCT_SHADE_ERRORS,
  parseShades, shadeKey, shadeLab, shadesOf, unknownProducts,
} from "@core/product-shades";
import type { ShadeEntry } from "@core/product-shades";

const row = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  part: "lip", brand: "테스트브랜드", product: "테스트 틴트", shade: "멜티드 헤이즐", hex: "#946b60",
  kind: "chip", source: "https://example.com/chart", checkedAt: "2026-10-12", ...over,
});
const file = (shades: unknown[], version = "shade-v0.1"): unknown => ({ version, shades });

describe("호수 색 파일 검사 (parseShades)", () => {
  it("S1 올바른 줄은 통과하고, 선택 항목(finish · note)은 있을 때만 담긴다", () => {
    const p = parseShades(file([row(), row({ shade: "휩드 베리", hex: "#d3a0a1", finish: "sheer", note: " 쉬어해서 칩보다 연함 " })]));
    expect(p.errors).toEqual([]);
    expect(p.entries).toHaveLength(2);
    expect(p.entries[0]).not.toHaveProperty("finish");
    expect(p.entries[1]).toMatchObject({ finish: "sheer", note: "쉬어해서 칩보다 연함" });
    expect(p.version).toBe("shade-v0.1");
  });

  it("S2 hex 는 소문자 #rrggbb 만 — 대문자 · 3자리 · # 없음 · 글자 섞임은 거른다", () => {
    for (const hex of ["#946B60", "#946", "946b60", "#94zb60", "", 3, null]) {
      const p = parseShades(file([row({ hex })]));
      expect(p.entries, String(hex)).toHaveLength(0);
      expect(p.errors[0], String(hex)).toContain("hex");
    }
  });

  it("S3 부위 · kind · finish 는 정해진 값만", () => {
    expect(parseShades(file([row({ part: "contour" })])).errors[0]).toContain("part");
    expect(parseShades(file([row({ kind: "photo" })])).errors[0]).toContain("kind");
    expect(parseShades(file([row({ finish: "metallic" })])).errors[0]).toContain("finish");
  });

  it("S4 날짜는 실제 날짜여야 한다 (2026-02-30 은 안 됨)", () => {
    for (const checkedAt of ["2026-02-30", "2026-13-01", "26-10-12", "2026/10/12", "", undefined]) {
      expect(parseShades(file([row({ checkedAt })])).errors[0], String(checkedAt)).toContain("checkedAt");
    }
    expect(parseShades(file([row({ checkedAt: "2028-02-29" })])).errors).toEqual([]);   // 윤년
  });

  it("S5 brand · product · shade · source 가 비면 거른다 (공백만도)", () => {
    for (const k of ["brand", "product", "shade", "source"]) {
      const p = parseShades(file([row({ [k]: "   " })]));
      expect(p.entries, k).toHaveLength(0);
      expect(p.errors[0], k).toContain(k === "shade" ? "shade" : k);
    }
  });

  it("S6 같은 호수가 두 번이면 뒤의 것을 거르고 어느 줄과 겹치는지 알려 준다", () => {
    const p = parseShades(file([row(), row({ hex: "#111111" })]));
    expect(p.entries).toHaveLength(1);
    expect(p.entries[0]!.hex).toBe("#946b60");
    expect(p.errors).toEqual(["2번째 줄: 1번째 줄과 같은 호수 (테스트브랜드 테스트 틴트 멜티드 헤이즐)"]);
  });

  it("S7 제품이나 부위가 다르면 같은 호수 이름이어도 겹치지 않는다", () => {
    const p = parseShades(file([row(), row({ product: "다른 틴트" }), row({ part: "cheek" })]));
    expect(p.errors).toEqual([]);
    expect(p.entries).toHaveLength(3);
  });

  it("S8 한 줄이 틀려도 나머지는 살린다 — 던지지 않는다", () => {
    const p = parseShades(file([row({ hex: "bad" }), row({ shade: "소이 로즈" }), 5, null, "x"]));
    expect(p.entries).toHaveLength(1);
    expect(p.errors).toHaveLength(4);
    expect(p.errors[0]).toMatch(/^1번째 줄/);
  });

  it("S9 version 이 'shade-v숫자.숫자' 꼴이 아니면 알려 준다", () => {
    expect(parseShades(file([], "v1")).errors[0]).toContain("version");
    expect(parseShades(file([], "shade-v0.1")).errors).toEqual([]);
    expect(parseShades(file([], "shade-v12.30")).errors).toEqual([]);
  });

  it("S10 파일 모양이 틀리면 (객체 아님 · shades 가 배열 아님) 빈 결과와 이유", () => {
    expect(parseShades(null).errors).toEqual(["파일이 객체가 아님"]);
    expect(parseShades([]).entries).toEqual([]);
    expect(parseShades({ version: "shade-v0.1", shades: {} }).errors).toContain("shades 가 배열이 아님");
  });
});

describe("호수 색 쓰는 쪽", () => {
  const entries = parseShades(file([row(), row({ shade: "소이 로즈", hex: "#ac706c" }), row({ product: "다른 틴트" })])).entries;

  it("L1 shadeLab: hex 에서 Lab 을 계산한다 (흰색 L≈100, 검정 L≈0, 같은 hex 면 같은 값)", () => {
    expect(shadeLab({ hex: "#ffffff" }).L).toBeCloseTo(100, 0);
    expect(shadeLab({ hex: "#000000" }).L).toBeCloseTo(0, 5);
    const a = shadeLab({ hex: "#946b60" }), b = shadeLab(entries[0]!);
    expect(a).toEqual(b);
    expect(a.L).toBeGreaterThan(40);
    expect(a.L).toBeLessThan(60);
  });

  it("L2 shadesOf: 부위 · 브랜드 · 제품이 모두 같은 것만", () => {
    expect(shadesOf(entries, "lip", "테스트브랜드", "테스트 틴트").map((e) => e.shade)).toEqual(["멜티드 헤이즐", "소이 로즈"]);
    expect(shadesOf(entries, "cheek", "테스트브랜드", "테스트 틴트")).toEqual([]);
  });

  it("L3 unknownProducts: product-picks.ts 에 없는 제품(오타 포함)을 가리키는 줄을 잡는다", () => {
    const real = PRODUCT_PICKS.lip[0]!;
    const good: ShadeEntry = { ...(row() as unknown as ShadeEntry), brand: real.brand, product: real.name };
    const typo: ShadeEntry = { ...good, product: real.name + " " };   // 글자 하나 다르면 이어지지 않는다
    expect(unknownProducts([good])).toEqual([]);
    expect(unknownProducts([typo])).toEqual([typo]);
    expect(unknownProducts(entries)).toHaveLength(3);   // 테스트브랜드는 실제 목록에 없다
  });

  it("L4 shadeKey 는 부위 · 브랜드 · 제품 · 호수로 정해진다", () => {
    expect(shadeKey(entries[0]!)).toBe("lip|테스트브랜드|테스트 틴트|멜티드 헤이즐");
  });
});

describe("실제 파일 (rules/product-shades.json)", () => {
  it("F1 형식 오류가 하나도 없다 — 새로 채운 줄이 틀리면 여기서 걸린다", () => {
    expect(PRODUCT_SHADE_ERRORS, PRODUCT_SHADE_ERRORS.join("\n")).toEqual([]);
    expect(PRODUCT_SHADES_VERSION).toMatch(/^shade-v\d+\.\d+$/);
  });

  it("F2 모든 줄이 product-picks.ts 의 실제 제품을 가리킨다 (브랜드 · 제품명이 글자까지 같다)", () => {
    const bad = unknownProducts(PRODUCT_SHADES);
    expect(bad.map((e) => `${e.part} ${e.brand} ${e.product} ${e.shade}`)).toEqual([]);
  });
});
