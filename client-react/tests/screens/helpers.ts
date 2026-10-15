/**
 * 화면 시험 공통 재료 (#454 D7) — 본 앱 `client/tests/flow-slots.test.ts` 의 `fakeAnalysis` 자리.
 * 진짜는 사진에서 색을 읽지만, 화면 시험에는 다섯 부위 색이 **모양만 맞으면** 된다.
 */
import { vi } from "vitest";
import { hexToRgb } from "@core/color-family";
import { describeColor } from "@core/color-name";
import type { PalettePart } from "@core/color-family";
import type { MakeupTemplate } from "@core/templates";
import type { PartColors, ReadColor } from "../../src/api";

/** 부위마다 다른 색 — 화면에 다섯 줄이 제대로 갈리는지 보려고 */
const HEX: Record<PalettePart, string> = {
  brow: "#5c4a42",
  liner: "#2b2523",
  shadow: "#8b6f5e",
  lip: "#966861",
  cheek: "#e89477",
};

function readColor(part: PalettePart): ReadColor {
  const hex = HEX[part];
  const rgb = hexToRgb(hex);
  const name = describeColor(rgb, part);
  return { hex, rgb, name, product: { hex, rgb, name } };
}

/** 다섯 부위 색 한 벌 — 이름은 본 앱 `core/color-name` 이 짓는다 (화면이 그 이름을 그대로 쓰는지 본다) */
export function fakeColors(): PartColors {
  return {
    brow: readColor("brow"),
    liner: readColor("liner"),
    shadow: readColor("shadow"),
    lip: readColor("lip"),
    cheek: readColor("cheek"),
  };
}

/** 고른 템플릿 하나 — 본 앱 `core/templates` 의 03 "가을" 과 같은 모양 */
export const TEMPLATE: MakeupTemplate = { id: "03", name: "가을", about: "붉은 기 도는 따뜻한 색", thumb: "/templates/03-autumn-mute.webp" };

/**
 * 네트워크를 막는다 — 화면 시험에서 실제 서버로 요청이 나가면 안 된다.
 * 부르면 바로 실패하는 fetch 를 꽂아 두고, 몇 번 불렸는지 셀 수 있게 돌려준다
 */
export function blockNetwork() {
  const fetchFn = vi.fn(async () => {
    throw new Error("시험에서는 네트워크를 쓰지 않는다");
  });
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}

/** jsdom 에는 createObjectURL 이 없다 — 미리보기 주소를 만드는 자리라 채워 준다 (본 앱 시험과 같다) */
export function stubObjectUrl() {
  const urls = new Map<string, Blob>();
  URL.createObjectURL = (b: Blob): string => {
    const u = `blob:${urls.size}`;
    urls.set(u, b);
    return u;
  };
  URL.revokeObjectURL = (): void => {};
  return urls;
}

/** 마이크로태스크 · 타이머 한 바퀴 — 약속이 풀리고 화면이 다시 그려질 틈 */
export const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
