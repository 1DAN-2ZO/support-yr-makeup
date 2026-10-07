// 색 이름 짓기 — 규칙이 48색(근거 데이터)과 어긋나지 않는지
import { describe, expect, it } from "vitest";
import { PALETTE, COLOR_FAMILY, hexToRgb } from "@core/color-family";
import type { PalettePart } from "@core/color-family";
import { describeColor, toLch } from "@core/color-name";

const PARTS: PalettePart[] = ["brow", "liner", "shadow", "lip", "cheek"];

/** 48색은 구역 경계를 정한 근거다. 같은 뜻으로 묶이는 이름은 같은 것으로 본다 */
const SAME: Record<string, string> = {
  살구: "피치",
  누드베이지: "MLBB",
  그레이브라운: "애쉬브라운",
  딥레드: "레드",
  딥브라운: "브라운",
};
const norm = (s: string): string => SAME[s] ?? s;

describe("색 이름 규칙", () => {
  it("CN1 어떤 색이 와도 이름이 나온다 — 색 공간을 고르게 훑어도 빈 칸이 없다", () => {
    for (const part of PARTS) {
      for (let r = 0; r <= 255; r += 51) {
        for (let g = 0; g <= 255; g += 51) {
          for (let b = 0; b <= 255; b += 51) {
            const n = describeColor([r, g, b], part);
            expect(n.text.length, `${part} ${r},${g},${b}`).toBeGreaterThan(0);
            expect(n.base).not.toContain("undefined");
          }
        }
      }
    }
  });

  it("CN2 근거가 된 48색은 원래 계열 이름과 같은 계열로 돌아온다", () => {
    const off: string[] = [];
    for (const part of PARTS) {
      for (const hex of PALETTE[part]) {
        const want = COLOR_FAMILY[hex]!;
        const got = describeColor(hexToRgb(hex), part);
        if (norm(got.base) !== norm(want)) off.push(`${part} ${hex} ${want} → ${got.base}`);
      }
    }
    expect(off, `어긋난 색:\n${off.join("\n")}`).toEqual([]);
  });

  it("CN3 팔레트 밖의 탁한 색도 제 계열로 — 전에 ΔE 14.4 로 어긋났던 입술색", () => {
    // 참고 사진에서 뽑은 입술색. 채도 18 로 입술 팔레트(25~63) 밖이다
    const n = describeColor(hexToRgb("#966861"), "lip");
    expect(n.lch.C).toBeLessThan(25);
    expect(n.base).toBe("브릭");
    expect(n.tone).toBe("뮤트");
    expect(n.text).toBe("뮤트 브릭");
  });

  it("CN4 채도가 아주 낮으면 색이 아니라 회색 쪽 이름", () => {
    expect(describeColor([40, 38, 37], "liner").base).toBe("소프트블랙");
    expect(describeColor([60, 58, 57], "liner").base).toBe("그레이");
    expect(describeColor([18, 17, 16], "liner").base).toBe("블랙");
    expect(describeColor([140, 138, 142], "shadow").base).toBe("그레이");
  });

  it("CN4-b 구역 안 조건이 안 맞으면 다음 구역으로 — 붉은 기 없는 눈썹을 레드브라운이라 하면 안 된다", () => {
    // 참고 사진 눈썹: 색상각은 레드브라운 구간(49°)이지만 채도가 11 뿐이다
    const n = describeColor(hexToRgb("#786259"), "brow");
    expect(n.lch.h).toBeLessThan(50);
    expect(n.lch.C).toBeLessThan(15);
    expect(n.base).toBe("라이트브라운");
  });

  it("CN5 수식어는 하나만 — 이름이 길어지면 못 읽는다", () => {
    for (const part of PARTS) {
      for (let r = 0; r <= 255; r += 37) {
        for (let g = 0; g <= 255; g += 37) {
          for (let b = 0; b <= 255; b += 37) {
            expect(describeColor([r, g, b], part).text.split(" ").length).toBeLessThanOrEqual(2);
          }
        }
      }
    }
  });

  it("CN6 LCh 변환이 맞다 — 회색은 채도 0 에 가깝고, 빨강은 0° 근처", () => {
    expect(toLch([128, 128, 128]).C).toBeLessThan(2);
    const red = toLch([220, 40, 50]);
    expect(red.h).toBeGreaterThan(20);
    expect(red.h).toBeLessThan(45);
    expect(red.C).toBeGreaterThan(50);
  });
});
