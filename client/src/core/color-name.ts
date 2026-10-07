/**
 * 색 이름 짓기 — 규칙으로 (2026-10-06).
 *
 * 전에는 48색 중 가장 가까운 것을 골라 그 이름을 붙였다. 그러면 **팔레트에 없는 색이
 * 들어오면 엉뚱한 이름**이 나온다. 실제로 참고 사진의 입술색(채도 18)은 입술 팔레트의
 * 채도 범위(25~63) 밖이라 ΔE 14.4 로 떴다. 요즘 유행이 전부 뮤트 쪽이라 자주 걸린다.
 *
 * 그래서 이름을 **색 공간의 구역**으로 짓는다. 어떤 색이 들어와도 답이 나온다.
 *   색상각(h) → 어느 계열인가        예) 40° 근처 = 브릭·코랄 쪽
 *   밝기(L)   → 그 계열 안에서 무엇   예) 0~16° 는 L 로 버건디/플럼/로즈/핑크가 갈린다
 *   채도(C)·밝기(L) → 수식어          예) 채도가 낮으면 "뮤트"
 *
 * 구역 경계는 지어낸 값이 아니라 **48색(poc/synth/core.js)을 LCh 로 펴서 나온 자리**다.
 * color-name.test.ts 가 48색을 전부 다시 이름 지어 보며 경계를 지킨다.
 */

import { rgbToLab } from "./color";
import type { PalettePart } from "./color-family";

export interface ColorName {
  /** 화면에 쓰는 이름 — 수식어까지 붙인 것. 예) "뮤트 브릭" */
  text: string;
  /** 계열만. 예) "브릭" */
  base: string;
  /** 수식어. 없으면 빈 문자열 */
  tone: "" | "뮤트" | "딥" | "라이트" | "비비드";
  lch: { L: number; C: number; h: number };
}

/** 한 색상 구역. 같은 구역 안에서는 밝기로 이름이 갈린다 */
interface Zone {
  /** 색상각 구간 [from, to). from > to 면 0°를 넘어가는 구간 */
  from: number;
  to: number;
  /** 위에서부터 조건이 맞는 첫 칸. 마지막 칸은 조건 없이 받는다 */
  byL: readonly { lMax?: number; cMin?: number; name: string }[];
}

/** 채도가 이보다 낮으면 색이라기보다 회색 — 부위마다 다르게 본다 */
const GRAY_C: Record<PalettePart, number> = { brow: 6, liner: 5, shadow: 8, lip: 10, cheek: 10 };

/** 무채색일 때 밝기로 붙이는 이름 */
const GRAY_NAME: Record<PalettePart, readonly { lMax?: number; name: string }[]> = {
  brow: [{ lMax: 20, name: "소프트블랙" }, { name: "그레이브라운" }],
  liner: [{ lMax: 7, name: "블랙" }, { lMax: 22, name: "소프트블랙" }, { name: "그레이" }],
  shadow: [{ lMax: 35, name: "차콜" }, { name: "그레이" }],
  lip: [{ lMax: 45, name: "토프" }, { name: "그레이베이지" }],
  cheek: [{ name: "그레이베이지" }],
};

const ZONES: Record<PalettePart, readonly Zone[]> = {
  // 눈썹은 전부 갈색 쪽(45~69°)이라 색상보다 밝기가 이름을 가른다.
  // 레드브라운은 붉은 기가 실제로 있어야 한다 — 채도 조건이 없으면 탁한 색까지 끌고 온다
  brow: [
    { from: 0, to: 50, byL: [{ cMin: 15, name: "레드브라운" }] },
    { from: 0, to: 360, byL: [
      { lMax: 22, name: "다크브라운" }, { lMax: 30, name: "브라운" },
      { lMax: 40, name: "밀크브라운" }, { name: "라이트브라운" },
    ] },
  ],
  liner: [
    { from: 250, to: 330, byL: [{ name: "네이비" }] },
    { from: 330, to: 20, byL: [{ name: "버건디" }] },
    { from: 20, to: 250, byL: [{ lMax: 24, name: "다크브라운" }, { name: "브라운" }] },
  ],
  shadow: [
    { from: 300, to: 330, byL: [{ name: "퍼플" }] },
    { from: 330, to: 355, byL: [{ name: "플럼" }] },
    { from: 355, to: 18, byL: [{ lMax: 60, name: "로즈" }, { name: "핑크" }] },
    { from: 18, to: 30, byL: [{ name: "버건디" }] },
    // 선명하면 색조(코랄·오렌지), 탁하면 갈색 — 같은 색상각에 둘 다 있다
    { from: 30, to: 52, byL: [{ cMin: 30, name: "코랄" }, { lMax: 52, name: "딥브라운" }, { name: "브라운" }] },
    { from: 52, to: 64, byL: [{ cMin: 30, name: "오렌지" }, { lMax: 52, name: "딥브라운" }, { name: "브라운" }] },
    { from: 64, to: 85, byL: [{ name: "베이지" }] },
    { from: 85, to: 150, byL: [{ name: "올리브" }] },
    { from: 150, to: 300, byL: [{ name: "그레이" }] },
  ],
  lip: [
    { from: 345, to: 16, byL: [
      { lMax: 36, name: "버건디" }, { lMax: 50, name: "플럼" },
      { lMax: 60, name: "로즈" }, { name: "핑크" },
    ] },
    { from: 16, to: 34, byL: [{ lMax: 45, name: "딥레드" }, { name: "레드" }] },
    { from: 34, to: 52, byL: [{ lMax: 52, name: "브릭" }, { lMax: 68, name: "코랄" }, { name: "피치" }] },
    { from: 52, to: 100, byL: [{ name: "오렌지" }] },
    { from: 100, to: 345, byL: [{ name: "플럼" }] },
  ],
  cheek: [
    { from: 300, to: 345, byL: [{ name: "라벤더" }] },
    { from: 345, to: 20, byL: [{ name: "로즈" }] },
    { from: 20, to: 34, byL: [{ lMax: 62, name: "레드" }, { name: "핑크" }] },
    { from: 34, to: 46, byL: [{ name: "코랄" }] },
    { from: 46, to: 100, byL: [{ lMax: 72, name: "코랄" }, { name: "피치" }] },
    { from: 100, to: 300, byL: [{ name: "올리브" }] },
  ],
};

/**
 * 구역 이름을 밀어내는 특수 이름. 화장 어휘에서 자주 쓰여 따로 둔다.
 * MLBB(= my lips but better)는 "입술색에 가까운 탁한 색" 이라 채도·밝기로만 정해진다.
 */
function special(part: PalettePart, L: number, C: number, h: number): string | null {
  if (part === "lip" && C >= 55 && h >= 34 && h < 52) return "오렌지";
  if (part === "lip" && C >= 55 && h >= 16 && h < 34) return "체리";
  // 따뜻한 색은 채도가 내려가면 붉은빛이 아니라 갈색으로 읽힌다 — 요즘 뮤트 톤이 전부 여기다
  if (part === "lip" && C < 30 && h >= 24 && h < 60) return L < 56 ? "브릭" : "MLBB";
  if (part === "cheek" && C < 28 && h >= 30 && h < 56) return "베이지핑크";
  if (part === "brow" && C < 11) return "애쉬브라운";
  return null;
}

/** 수식어를 붙이는 부위. 눈썹·라이너는 이름 자체가 밝기 단계(다크브라운·라이트브라운)라 중복이다 */
const TONED: readonly PalettePart[] = ["lip", "cheek", "shadow"];

/** 이름만으로 이미 탁한 색인 것들 */
const SOFT_BY_NAME: readonly string[] = ["MLBB", "베이지핑크", "애쉬브라운", "그레이베이지", "토프"];

/** 수식어 — 하나만 붙인다. 두 개 붙이면 이름이 길어 읽기 나쁘다 */
function toneOf(part: PalettePart, L: number, C: number): ColorName["tone"] {
  if (!TONED.includes(part)) return "";
  if (C < 24) return "뮤트";
  if (C > 48) return "비비드";
  if (L < 32) return "딥";
  if (L > 73) return "라이트";
  return "";
}

function inZone(h: number, z: Zone): boolean {
  return z.from <= z.to ? h >= z.from && h < z.to : h >= z.from || h < z.to;
}

/** 조건이 맞는 첫 칸. 하나도 안 맞으면 null — 그러면 다음 구역으로 넘어간다 */
function pick(rules: readonly { lMax?: number; cMin?: number; name: string }[], L: number, C: number): string | null {
  for (const r of rules) {
    if (r.lMax !== undefined && L >= r.lMax) continue;
    if (r.cMin !== undefined && C < r.cMin) continue;
    return r.name;
  }
  return null;
}

export function toLch(rgb: readonly [number, number, number]): { L: number; C: number; h: number } {
  const { L, a, b } = rgbToLab(rgb[0], rgb[1], rgb[2]);
  return { L, C: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 };
}

/** 어떤 색이 들어와도 이름을 지어 준다 */
export function describeColor(rgb: readonly [number, number, number], part: PalettePart): ColorName {
  const lch = toLch(rgb);
  const { L, C, h } = lch;
  if (C < GRAY_C[part]) {
    const name = pick(GRAY_NAME[part], L, C) ?? "그레이";
    return { text: name, base: name, tone: "", lch };
  }
  // 색상각이 맞는 구역을 차례로 본다. 구역 안 조건(채도 등)이 안 맞으면 다음 구역으로 —
  // 예: 눈썹 46° 라도 채도가 낮으면 레드브라운이 아니라 밝기 단계로 간다
  let fromZone: string | null = null;
  for (const z of ZONES[part]) {
    if (!inZone(h, z)) continue;
    fromZone = pick(z.byL, L, C);
    if (fromZone) break;
  }
  const base = special(part, L, C, h) ?? fromZone ?? "브라운";
  // MLBB·베이지핑크는 이름에 이미 "탁하다" 가 들어 있다 — "뮤트 MLBB" 는 겹말이다
  const tone = SOFT_BY_NAME.includes(base) ? "" : toneOf(part, L, C);
  return { text: tone ? `${tone} ${base}` : base, base, tone, lch };
}

/**
 * 부위별로 나올 수 있는 계열 이름 전부. 제품 입력 화면이 고르는 목록으로 쓴다 —
 * 손으로 적으면 "브릭" 과 "브릭색" 처럼 어긋나서 제품이 안 걸린다.
 */
export function familiesOf(part: PalettePart): string[] {
  const names = new Set<string>();
  for (const r of GRAY_NAME[part]) names.add(r.name);
  for (const z of ZONES[part]) for (const r of z.byL) names.add(r.name);
  // 구역표에 없고 special() 에서만 나오는 이름
  const extra: Partial<Record<PalettePart, string[]>> = {
    lip: ["오렌지", "체리", "브릭", "MLBB"],
    cheek: ["베이지핑크"],
    brow: ["애쉬브라운"],
  };
  for (const n of extra[part] ?? []) names.add(n);
  return [...names].sort((a, b) => a.localeCompare(b, "ko"));
}
