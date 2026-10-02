// 부위마다 화면 방향을 지킨다 — 눈 부위(눈썹·라이너·섀도우)는 가로, 입술·볼·쉐딩은 세로 (팀 협의 2026-09-30 · 2026-10-01, 정의서 3-2)
// 화면 4 는 게이트가 막고, 화면 3·5 는 방향이 틀리면 내용 대신 "가로로 / 세로로 돌려 주세요" 만
import { describe, expect, it } from "vitest";
import { mustRotate, rotateText } from "@core/orientation-lock";
import { GATE_TEXT } from "@core/gate";

describe("mustRotate", () => {
  it("O1 눈 부위 + 세로면 돌려야 한다, 가로면 아니다", () => {
    for (const p of ["brow", "liner", "shadow"] as const) {
      expect(mustRotate(p, "portrait")).toBe(true);
      expect(mustRotate(p, "landscape")).toBe(false);
    }
  });
  it("O2 세로 부위(입술·볼·쉐딩) + 가로면 돌려야 한다, 세로면 아니다 (2026-10-01 — 섀도우 다음 입술로 넘어갈 때 가로 그대로 하지 않게)", () => {
    for (const p of ["lip", "cheek", "contour"] as const) {
      expect(mustRotate(p, "landscape")).toBe(true);
      expect(mustRotate(p, "portrait")).toBe(false);
    }
  });
  it("O3 부위가 없거나 방향을 모르면(옛 브라우저) 막지 않는다", () => {
    expect(mustRotate(null, "portrait")).toBe(false);
    expect(mustRotate(null, "landscape")).toBe(false);
    for (const p of ["liner", "lip"] as const) expect(mustRotate(p, null)).toBe(false);
  });
  it("O4 문구는 화면 4 게이트와 같다 — 눈 부위는 '가로로', 나머지는 '세로로'", () => {
    for (const p of ["brow", "liner", "shadow"] as const) expect(rotateText(p)).toBe(GATE_TEXT.toLandscape);
    for (const p of ["lip", "cheek", "contour"] as const) expect(rotateText(p)).toBe(GATE_TEXT.toPortrait);
    expect(GATE_TEXT.toPortrait).toBe("폰을 세로로 돌려 주세요");
  });
});
