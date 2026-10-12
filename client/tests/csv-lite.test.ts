// 작은 CSV 읽기·쓰기 — 사진 이름에 쉼표가 든 경우 (Deep Armocromia: "Felicity Jones, 4.png")
import { describe, expect, it } from "vitest";
import { csvCell, csvSplit } from "@core/csv-lite";

describe("csv-lite", () => {
  it("C1 평범한 줄은 쉼표로 나뉜다 (빈 칸 포함)", () => {
    expect(csvSplit("a,b,,d")).toEqual(["a", "b", "", "d"]);
    expect(csvSplit("")).toEqual([""]);
  });

  it("C2 따옴표 칸 안의 쉼표는 그대로 둔다", () => {
    expect(csvSplit("train/autunno/soft/Felicity Jones, 4,train,1")).toHaveLength(4);   // 따옴표 없이는 3칸이어야 할 줄이 4칸으로 밀린다 (이게 원래 버그)
    expect(csvSplit('"train/autunno/soft/Felicity Jones, 4",train,1')).toEqual(["train/autunno/soft/Felicity Jones, 4", "train", "1"]);
  });

  it("C3 큰따옴표 두 개는 따옴표 하나", () => {
    expect(csvSplit('"a ""b"" c",d')).toEqual(['a "b" c', "d"]);
  });

  it("C4 csvCell 로 쓴 것은 csvSplit 으로 그대로 돌아온다", () => {
    const cells = ["plain", "has, comma", 'has "quote"', "한글, 이름", ""];
    expect(csvSplit(cells.map(csvCell).join(","))).toEqual(cells);
  });

  it("C5 쉼표 · 따옴표가 없으면 감싸지 않는다", () => {
    expect(csvCell("plain 1")).toBe("plain 1");
  });
});
