/**
 * 색 계열 이름표 — 48색 팔레트와 한국어 계열 이름.
 * 원본은 poc/synth/core.js 의 PALETTE · COLOR_FAMILY (학습 데이터 생성기가 쓰는 것).
 * 저기는 브라우저 번들 밖이라 값을 그대로 옮겨 왔다. 저쪽이 바뀌면 여기도 같이 고친다.
 *
 * 쓰는 법: 사진에서 뽑은 색은 **그대로 보여 주고**, 이름만 여기서 가장 가까운 것을 붙인다
 * (2026-10-06 결정). 팔레트가 임시값이라 색까지 팔레트로 바꾸면 실제와 달라진다.
 */

import { deltaE, rgbToLab } from "./color";
import type { PartId } from "./types";

/** 팔레트가 색을 들고 있는 부위. contour 는 없다 */
export type PalettePart = Exclude<PartId, "contour">;

export const PALETTE: Record<PalettePart, readonly string[]> = {
  brow: ["#3d2b1f", "#4a3728", "#6b4f3a", "#5c4a42", "#57514c", "#2b2523", "#5a3a2e", "#7d6350"],
  liner: ["#12100f", "#1c1917", "#3b2f2a", "#53392b", "#4a2230", "#1f2a44", "#3a3a3c"],
  shadow: ["#8b6f5e", "#7d5f52", "#c2a68f", "#d08a72", "#c98b93", "#b5737f", "#8a6f96", "#7d5a72", "#8a8464", "#c07a4e", "#8c8a8e", "#8c4f52"],
  lip: ["#b8504f", "#a83a3a", "#e07a5f", "#d9633b", "#d97f96", "#c96b7e", "#c08878", "#c9927e", "#7d2f3f", "#93445e", "#c02b45", "#a85440", "#e59b84"],
  cheek: ["#e08b86", "#e89477", "#f0a98a", "#d97f8c", "#eaa07d", "#c497bc", "#dda394", "#d9716e"],
};

/** 색 → 한국어 계열 이름. 같은 이름이 여러 색에 붙기도 한다(부위마다 쓰임이 달라서) */
export const COLOR_FAMILY: Readonly<Record<string, string>> = {
  "#3d2b1f": "다크브라운",
  "#4a3728": "브라운",
  "#6b4f3a": "밀크브라운",
  "#5c4a42": "애쉬브라운",
  "#57514c": "그레이브라운",
  "#2b2523": "소프트블랙",
  "#5a3a2e": "레드브라운",
  "#7d6350": "라이트브라운",
  "#12100f": "블랙",
  "#1c1917": "소프트블랙",
  "#3b2f2a": "다크브라운",
  "#53392b": "브라운",
  "#4a2230": "버건디",
  "#1f2a44": "네이비",
  "#3a3a3c": "그레이",
  "#8b6f5e": "브라운",
  "#7d5f52": "딥브라운",
  "#c2a68f": "베이지",
  "#d08a72": "코랄",
  "#c98b93": "핑크",
  "#b5737f": "로즈",
  "#8a6f96": "퍼플",
  "#7d5a72": "플럼",
  "#8a8464": "올리브",
  "#c07a4e": "오렌지",
  "#8c8a8e": "그레이",
  "#8c4f52": "버건디",
  "#b8504f": "레드",
  "#a83a3a": "딥레드",
  "#e07a5f": "코랄",
  "#d9633b": "오렌지",
  "#d97f96": "핑크",
  "#c96b7e": "로즈",
  "#c08878": "MLBB",
  "#c9927e": "누드베이지",
  "#7d2f3f": "버건디",
  "#93445e": "플럼",
  "#c02b45": "체리",
  "#a85440": "브릭",
  "#e59b84": "피치",
  "#e08b86": "핑크",
  "#e89477": "코랄",
  "#f0a98a": "피치",
  "#d97f8c": "로즈",
  "#eaa07d": "살구",
  "#c497bc": "라벤더",
  "#dda394": "베이지핑크",
  "#d9716e": "레드",
};

export interface FamilyMatch {
  /** 팔레트에서 가장 가까운 색 */
  hex: string;
  /** 그 색의 계열 이름 — 화면에 "OO 계열" 로 쓴다 */
  family: string;
  /** Lab 거리. 크면 팔레트가 그 색을 못 담고 있다는 뜻 */
  dE: number;
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number): string => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** 뽑은 색에 가장 가까운 팔레트 색과 그 계열 이름 */
export function nearestFamily(rgb: readonly [number, number, number], part: PalettePart): FamilyMatch {
  const lab = rgbToLab(rgb[0], rgb[1], rgb[2]);
  let best = PALETTE[part][0]!, bd = Infinity;
  for (const hex of PALETTE[part]) {
    const [r, g, b] = hexToRgb(hex);
    const d = deltaE(lab, rgbToLab(r, g, b));
    if (d < bd) { bd = d; best = hex; }
  }
  return { hex: best, family: COLOR_FAMILY[best] ?? "", dE: bd };
}
