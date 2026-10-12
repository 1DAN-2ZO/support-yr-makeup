// 제품 줄의 호수 색(hex) 규칙 — 제품을 더한 사람이 오타를 여기서 바로 본다.
import { describe, expect, it } from "vitest";
import { PRODUCT_PICKS, validateHex } from "@core/product-picks";
import type { ProductPick } from "@core/product-picks";
import type { PalettePart } from "@core/color-family";

const empty = (): Record<PalettePart, ProductPick[]> => ({ brow: [], liner: [], shadow: [], cheek: [], lip: [] });
const pick = (over: Partial<ProductPick> = {}): ProductPick => ({
  families: ["코랄"], brand: "테스트", name: "테스트 틴트", kind: "틴트",
  shade: "멜티드 헤이즐", hex: "#946b60", ...over,
});
const lipOnly = (...l: ProductPick[]): Record<PalettePart, ProductPick[]> => ({ ...empty(), lip: l });

describe("제품 줄의 호수 색 검사 (validateHex)", () => {
  it("H1 올바른 줄 · hex 없는 줄(계열만 쓰는 기존 방식)은 통과", () => {
    const noHex: ProductPick = { families: ["코랄"], brand: "테스트", name: "다른 틴트", kind: "틴트" };
    expect(validateHex(lipOnly(pick(), noHex))).toEqual([]);
  });

  it("H2 hex 는 소문자 #rrggbb 만 — 대문자 · 3자리 · # 없음은 거른다", () => {
    for (const hex of ["#946B60", "#946", "946b60", "#94zb60", ""]) {
      expect(validateHex(lipOnly(pick({ hex })))[0], hex).toContain("hex 가 소문자 #rrggbb");
    }
  });

  it("H3 hex 가 있으면 shade(호수 이름)도 있어야 한다", () => {
    expect(validateHex(lipOnly(pick({ shade: "" })))[0]).toContain("shade");
  });

  it("H4 같은 호수에 hex 줄이 둘이면 뒤의 것을 알려 준다 — 제품이나 호수가 다르면 괜찮다", () => {
    expect(validateHex(lipOnly(pick(), pick({ hex: "#111111" })))).toHaveLength(1);
    expect(validateHex(lipOnly(pick(), pick({ shade: "소이 로즈" }), pick({ name: "다른 틴트" })))).toEqual([]);
  });

  it("F1 실제 제품 목록(PRODUCT_PICKS)에 규칙 위반이 없다 — 새로 채운 줄이 틀리면 여기서 걸린다", () => {
    const problems = validateHex(PRODUCT_PICKS);
    expect(problems, problems.join("\n")).toEqual([]);
  });
});
