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
    // 붉은 기가 분명하면 색상각 앞쪽
    { from: 0, to: 40, byL: [{ cMin: 20, name: "로즈브라운" }, { cMin: 13, name: "레드브라운" }] },
    { from: 40, to: 50, byL: [{ cMin: 15, name: "레드브라운" }] },
    // 노란 기가 강하면 카키 쪽
    { from: 75, to: 120, byL: [{ cMin: 12, name: "카키브라운" }] },
    { from: 0, to: 360, byL: [
      { lMax: 16, name: "초코브라운" }, { lMax: 22, name: "다크브라운" }, { lMax: 30, name: "브라운" },
      { lMax: 40, name: "밀크브라운" }, { name: "라이트브라운" },
    ] },
  ],
  liner: [
    { from: 250, to: 310, byL: [{ name: "네이비" }] },
    { from: 310, to: 340, byL: [{ name: "플럼" }] },
    { from: 340, to: 10, byL: [{ lMax: 30, name: "버건디" }, { name: "로즈" }] },
    { from: 10, to: 32, byL: [{ cMin: 28, name: "코랄" }, { lMax: 24, name: "다크브라운" }, { name: "브라운" }] },
    { from: 32, to: 70, byL: [
      { lMax: 24, name: "다크브라운" }, { lMax: 34, name: "브라운" },
      { lMax: 55, name: "밀크브라운" }, { name: "베이지" },
    ] },
    { from: 70, to: 130, byL: [{ cMin: 12, name: "카키" }, { lMax: 24, name: "다크브라운" }, { name: "브라운" }] },
    { from: 130, to: 250, byL: [{ lMax: 24, name: "다크브라운" }, { name: "브라운" }] },
  ],
  shadow: [
    { from: 300, to: 330, byL: [{ name: "퍼플" }] },
    { from: 330, to: 355, byL: [{ name: "플럼" }] },
    { from: 355, to: 18, byL: [{ lMax: 60, name: "로즈" }, { name: "핑크" }] },
    { from: 18, to: 30, byL: [
      { cMin: 22, lMax: 55, name: "버건디" }, { cMin: 22, name: "로즈" },
      { lMax: 50, name: "모브" }, { name: "누드핑크" },
    ] },
    // 선명하면 색조(코랄·오렌지), 탁하면 갈색 — 같은 색상각에 둘 다 있다
    { from: 30, to: 52, byL: [{ cMin: 30, name: "코랄" }, { lMax: 52, name: "딥브라운" }, { name: "브라운" }] },
    { from: 52, to: 64, byL: [{ cMin: 30, name: "오렌지" }, { lMax: 52, name: "딥브라운" }, { name: "브라운" }] },
    { from: 64, to: 85, byL: [{ lMax: 45, name: "카키브라운" }, { cMin: 25, name: "골드" }, { name: "베이지" }] },
    { from: 85, to: 150, byL: [{ name: "올리브" }] },
    { from: 150, to: 300, byL: [{ name: "그레이" }] },
  ],
  lip: [
    { from: 345, to: 16, byL: [
      { lMax: 36, name: "버건디" }, { lMax: 50, name: "플럼" },
      { lMax: 60, name: "로즈" }, { cMin: 30, name: "핑크" }, { name: "모브" },
    ] },
    // 붉은 쪽은 **색상으로 못 가른다.** 모아 둔 호수 29개의 색상각이 12~42° 안에 다 들어오고,
    // 그중 23개가 이 한 구역(16~34°)에 몰린다. 그런데 전에는 이 구역의 금이 "밝기 45" 하나뿐이라
    // **29개 중 22개(76%)가 「레드」로 떨어졌다** (2026-10-15 측정). 그러면 제품을 골라도
    // "레드 중 아무거나" 가 되어 추천이 뭉개지고, 브랜드가 「트루 피치」·「코랄 문」·「언더 모브」라
    // 부르는 색까지 전부 「레드」가 된다 (이름에 색 낱말을 쓴 제품 12개와 **하나도 안 맞았다**).
    //
    // 그래서 밝기·채도로 네 칸으로 나눈다. 금(밝기 58 · 채도 46)은 **손으로 고른 숫자가 아니라
    // 모아 둔 호수의 중앙값**이다. 이 금으로 제일 큰 묶음이 76% → 28% 로 내려가고,
    // 네 칸에 8·6·6·6 개로 고르게 앉는다.
    //
    // 이름은 새로 만들지 않고 옆 구역 말을 늘렸다 — 로즈는 아래 구역(345~16°), 코랄·피치는
    // 위 구역(34~52°)의 이름이다. 구역을 넘나드는 색이 이름까지 갑자기 바뀌지 않게.
    // 채도 금 위가 또렷한 쪽(레드·코랄), 아래가 탁한 쪽(로즈·피치)이다.
    //
    // 「체리」(채도 55 위)는 **그대로 둔다.** 낮추면 48색 표의 #a83a3a(딥레드)가 체리로 넘어간다 —
    // 어두운 빨강과 선명한 빨강을 가르는 것이 그 금이라 함부로 못 내린다
    { from: 16, to: 34, byL: [
      { lMax: 45, name: "딥레드" },
      { lMax: 58, cMin: 46, name: "레드" }, { lMax: 58, name: "로즈" },
      { cMin: 46, name: "코랄" }, { name: "피치" },
    ] },
    { from: 34, to: 52, byL: [{ lMax: 52, name: "브릭" }, { lMax: 68, name: "코랄" }, { name: "피치" }] },
    { from: 52, to: 70, byL: [{ cMin: 40, name: "오렌지" }, { lMax: 60, name: "브릭" }, { name: "살구" }] },
    { from: 70, to: 100, byL: [{ cMin: 35, name: "오렌지" }, { name: "누드베이지" }] },
    { from: 100, to: 345, byL: [{ name: "플럼" }] },
  ],
  // 볼터치는 **연한 쪽에 금이 없었다** (2026-10-15).
  // 모아 둔 호수 95개가 밝기 70~89 · 채도 12~35 에 몰려 있는데, 금은 48색 팔레트(밝기 59~75 ·
  // 채도 25~45)를 보고 그어져 있었다. 통 안 색과 피부 위 색의 범위가 다른 것이 여기서도 드러난다.
  // 그래서 95개가 사실상 세 이름(모브 34 · 로즈 31 · 베이지핑크 28)으로만 떨어졌다.
  //
  // 아래 두 금(로즈 구간의 밝기 82 · 20~34 구간의 채도 22)은 **모아 둔 호수의 중앙값**이다.
  // 48색 기준점은 둘 다 금 아래에 있어(로즈 #d97f8c 밝기 63 · 핑크 #e08b86 채도 36) 안 깨진다.
  // 이 둘로 제일 큰 묶음이 36% → 24% 로 내려가고 23·22·16·16·16 개로 고르게 앉는다
  cheek: [
    { from: 300, to: 345, byL: [{ name: "라벤더" }] },
    // 연한 쪽을 핑크로 — 같은 색상각이어도 밝으면 "로즈" 보다 "연분홍" 으로 읽힌다
    { from: 345, to: 20, byL: [{ lMax: 82, name: "로즈" }, { name: "핑크" }] },
    // 채도가 남아 있으면 코랄 — 탁한 쪽만 모브로 남긴다
    { from: 20, to: 34, byL: [{ lMax: 62, name: "레드" }, { cMin: 30, name: "핑크" }, { cMin: 22, name: "코랄" }, { name: "모브" }] },
    { from: 34, to: 46, byL: [{ name: "코랄" }] },
    { from: 46, to: 58, byL: [{ lMax: 72, name: "코랄" }, { name: "피치" }] },
    { from: 58, to: 100, byL: [{ lMax: 70, name: "브릭" }, { name: "살구" }] },
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
  // 볼터치의 색상각 폭을 30~56 에서 34~46 으로 **좁혔다** (2026-10-15).
  // 까닭: 볼터치는 피부에 얇게 얹혀 **거의 다 채도 28 아래**로 읽힌다 (모아 둔 호수 95개 중 92개).
  // 그래서 넓은 폭(30~56)과 "채도<28" 이 만나면 **그 구역이 통째로 베이지핑크가 되어**
  // 코랄·피치가 아예 안 나왔다. 48색 기준점(#dda394)은 색상각 39.8 이라 좁혀도 그대로 든다
  if (part === "cheek" && C < 28 && h >= 34 && h < 46) return "베이지핑크";
  if (part === "brow" && C < 11) return "애쉬브라운";
  return null;
}

/**
 * 밝기 수식어(딥·라이트)를 붙이는 부위. 눈썹·라이너는 이름 자체가 밝기 단계
 * (다크브라운·라이트브라운)라 "딥 다크브라운" 이 되어 겹말이다.
 * 채도 수식어(뮤트·비비드)는 겹말이 아니므로 **모든 부위에** 붙인다 —
 * 같은 다크브라운이어도 붉은 기가 도는 것과 탁한 것은 다르다.
 */
const TONED: readonly PalettePart[] = ["lip", "cheek", "shadow"];

/** 이름만으로 이미 탁한 색인 것들 */
const SOFT_BY_NAME: readonly string[] = ["MLBB", "베이지핑크", "애쉬브라운", "그레이베이지", "토프"];

/** 수식어 — 하나만 붙인다. 두 개 붙이면 이름이 길어 읽기 나쁘다 */
function toneOf(part: PalettePart, L: number, C: number): ColorName["tone"] {
  if (C < 24) return "뮤트";
  if (C > 48) return "비비드";
  if (!TONED.includes(part)) return "";
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
