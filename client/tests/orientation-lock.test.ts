// 눈 부위(눈썹·라이너·섀도우)는 화면 3·4·5 모두 가로에서만 (팀 협의 2026-09-30, 정의서 3-2)
// 화면 4 는 게이트가 막고, 화면 3·5 는 세로면 내용 대신 "가로로 돌려 주세요" 만
import { describe, expect, it } from "vitest";
import { ROTATE_TEXT, mustRotate } from "@core/orientation-lock";
import { GATE_TEXT } from "@core/gate";

describe("mustRotate", () => {
  it("O1 눈 부위 + 세로면 돌려야 한다, 가로면 아니다", () => {
    for (const p of ["brow", "liner", "shadow"] as const) {
      expect(mustRotate(p, "portrait")).toBe(true);
      expect(mustRotate(p, "landscape")).toBe(false);
    }
  });
  it("O2 세로 부위(입술·볼·쉐딩)와 부위 없음은 막지 않는다", () => {
    for (const p of ["lip", "cheek", "contour"] as const) for (const o of ["portrait", "landscape"] as const) expect(mustRotate(p, o)).toBe(false);
    expect(mustRotate(null, "portrait")).toBe(false);
  });
  it("O3 문구는 화면 4 게이트와 같다", () => {
    expect(ROTATE_TEXT).toBe(GATE_TEXT.toLandscape);
  });
});
