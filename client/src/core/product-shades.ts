/**
 * 제품 호수별 색 — 저장 형식 (2026-10-12). 데이터는 `rules/product-shades.json` 에 있고 여기서는 읽고 검사만 한다.
 * 값을 더하거나 고치면 `version` 을 올린다 (ai-pipeline-v6.md 3절, looks.json 과 같은 규칙).
 *
 * 왜 따로 두나: `product-picks.ts` 의 제품 목록은 계열 이름만 안다. 호수마다 **실제 색**을 넣으면
 * 참고 사진에서 뽑은 색과 색 거리(ΔE)로 가장 비슷한 호수를 바로 이을 수 있다. 호수가 수십~백여 개라
 * 제품 목록 파일에 끼워 넣으면 길고 부딪히기 쉬워서 JSON 으로 뺐다. 제품과는 (부위 · 브랜드 · 제품명) 으로 잇는다.
 *
 * 한 줄 예시 (`rules/product-shades.json` 의 `shades` 배열 안):
 *   {
 *     "part": "lip",                      // brow | liner | shadow | cheek | lip — product-picks.ts 의 부위와 같다
 *     "brand": "롬앤",                    // product-picks.ts 의 brand 와 글자까지 같게
 *     "product": "쥬시 래스팅 틴트",      // product-picks.ts 의 name 과 글자까지 같게
 *     "shade": "멜티드 헤이즐",           // 호수 이름 (공식 표기 그대로)
 *     "hex": "#946b60",                   // 소문자 #rrggbb, sRGB
 *     "kind": "chip",                     // chip = 브랜드 색상표(대표 색) · swatch = 피부·팔에 바른 발색 사진에서 잰 것
 *     "source": "https://…",              // 색을 뽑은 출처 (주소 또는 사진 이름)
 *     "checkedAt": "2026-10-12",          // 색을 뽑은 날 (YYYY-MM-DD)
 *     "finish": "matte",                  // 선택. matte | satin | shimmer | glitter | sheer | gloss — 칩은 쉬어·펄이면 실제 발색과 다를 수 있다
 *     "note": "…"                         // 선택. 짧은 메모
 *   }
 *
 * 칩(chip)은 브랜드가 그린 대표 색이라 발색(swatch)과 다를 수 있다 — 같은 호수가 둘 다 있으면 발색이 더 믿을 만하다.
 * 한 제품에 색이 여럿인 것(팔레트 · 듀얼 치크 · 틴트+글로스 겸용)은 넣지 않는다 — 한 호수에 색 하나인 제품만.
 * 같은 (부위 · 브랜드 · 제품 · 호수) 는 한 줄만 둔다.
 * 확인: `npx vitest run tests/product-shades.test.ts` — 형식 · 중복 · 없는 제품 이름을 잡는다.
 */

import raw from "../../../rules/product-shades.json";
import { rgbToLab } from "./color";
import type { Lab } from "./color";
import { hexToRgb } from "./color-family";
import type { PalettePart } from "./color-family";
import { PRODUCT_PICKS } from "./product-picks";
import type { ProductPick } from "./product-picks";

export const SHADE_PARTS = ["brow", "liner", "shadow", "cheek", "lip"] as const satisfies readonly PalettePart[];
export const SHADE_KINDS = ["chip", "swatch"] as const;
export const SHADE_FINISHES = ["matte", "satin", "shimmer", "glitter", "sheer", "gloss"] as const;

export type ShadeKind = (typeof SHADE_KINDS)[number];
export type ShadeFinish = (typeof SHADE_FINISHES)[number];

export interface ShadeEntry {
  part: PalettePart;
  brand: string;
  /** ProductPick.name 과 같은 말 */
  product: string;
  /** 호수 이름 */
  shade: string;
  /** 소문자 #rrggbb (sRGB) */
  hex: string;
  kind: ShadeKind;
  source: string;
  /** YYYY-MM-DD */
  checkedAt: string;
  finish?: ShadeFinish;
  note?: string;
}

export interface ParsedShades {
  version: string;
  /** 검사를 통과한 줄만 */
  entries: ShadeEntry[];
  /** 통과 못 한 줄 이유 — "3번째 줄: hex 가 #rrggbb 가 아님" 처럼 */
  errors: string[];
}

const VERSION_RE = /^shade-v\d+\.\d+$/;
const HEX_RE = /^#[0-9a-f]{6}$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

function validDate(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export const shadeKey = (e: Pick<ShadeEntry, "part" | "brand" | "product" | "shade">): string =>
  `${e.part}|${e.brand}|${e.product}|${e.shade}`;

/** JSON 한 덩어리를 검사해서 쓸 수 있는 줄과 문제를 나눈다. 던지지 않는다 — 한 줄이 틀려도 앱은 나머지로 돈다 */
export function parseShades(input: unknown): ParsedShades {
  const errors: string[] = [];
  if (!isRecord(input)) return { version: "", entries: [], errors: ["파일이 객체가 아님"] };
  const version = typeof input["version"] === "string" ? input["version"] : "";
  if (!VERSION_RE.test(version)) errors.push(`version 이 "shade-v숫자.숫자" 꼴이 아님: ${JSON.stringify(input["version"])}`);
  const list = input["shades"];
  if (!Array.isArray(list)) return { version, entries: [], errors: [...errors, "shades 가 배열이 아님"] };

  const entries: ShadeEntry[] = [];
  const seen = new Map<string, number>();
  list.forEach((row, i) => {
    const at = `${i + 1}번째 줄`;
    if (!isRecord(row)) { errors.push(`${at}: 객체가 아님`); return; }
    const problems: string[] = [];

    const part = row["part"];
    if (!SHADE_PARTS.includes(part as PalettePart)) problems.push(`part 가 ${SHADE_PARTS.join("·")} 중 하나가 아님: ${JSON.stringify(part)}`);
    const brand = text(row["brand"]), product = text(row["product"]), shade = text(row["shade"]), source = text(row["source"]);
    if (!brand) problems.push("brand 가 비었음");
    if (!product) problems.push("product 가 비었음");
    if (!shade) problems.push("shade(호수 이름)가 비었음");
    if (!source) problems.push("source(출처)가 비었음");
    const hex = row["hex"];
    if (typeof hex !== "string" || !HEX_RE.test(hex)) problems.push(`hex 가 소문자 #rrggbb 가 아님: ${JSON.stringify(hex)}`);
    const kind = row["kind"];
    if (!SHADE_KINDS.includes(kind as ShadeKind)) problems.push(`kind 가 ${SHADE_KINDS.join("·")} 중 하나가 아님: ${JSON.stringify(kind)}`);
    const checkedAt = row["checkedAt"];
    if (typeof checkedAt !== "string" || !validDate(checkedAt)) problems.push(`checkedAt 이 실제 날짜(YYYY-MM-DD)가 아님: ${JSON.stringify(checkedAt)}`);
    const finish = row["finish"];
    if (finish !== undefined && !SHADE_FINISHES.includes(finish as ShadeFinish)) problems.push(`finish 가 ${SHADE_FINISHES.join("·")} 중 하나가 아님: ${JSON.stringify(finish)}`);
    const note = row["note"];
    if (note !== undefined && typeof note !== "string") problems.push("note 가 글이 아님");
    if (problems.length) { errors.push(`${at}: ${problems.join(" / ")}`); return; }

    const entry: ShadeEntry = {
      part: part as PalettePart, brand: brand!, product: product!, shade: shade!, hex: hex as string,
      kind: kind as ShadeKind, source: source!, checkedAt: checkedAt as string,
      ...(finish !== undefined ? { finish: finish as ShadeFinish } : {}),
      ...(typeof note === "string" && note.trim() !== "" ? { note: note.trim() } : {}),
    };
    const key = shadeKey(entry);
    const first = seen.get(key);
    if (first !== undefined) { errors.push(`${at}: ${first}번째 줄과 같은 호수 (${entry.brand} ${entry.product} ${entry.shade})`); return; }
    seen.set(key, i + 1);
    entries.push(entry);
  });
  return { version, entries, errors };
}

/** 호수 색의 Lab (D65). 저장하지 않고 hex 에서 계산한다 — 두 값이 어긋날 일이 없게 */
export function shadeLab(e: Pick<ShadeEntry, "hex">): Lab {
  const [r, g, b] = hexToRgb(e.hex);
  return rgbToLab(r, g, b);
}

/** 한 제품의 호수들 */
export function shadesOf(entries: readonly ShadeEntry[], part: PalettePart, brand: string, product: string): ShadeEntry[] {
  return entries.filter((e) => e.part === part && e.brand === brand && e.product === product);
}

/** product-picks.ts 에 없는 제품을 가리키는 줄 — 오타를 잡는다 (브랜드 · 제품명이 글자까지 같아야 이어진다) */
export function unknownProducts(
  entries: readonly ShadeEntry[],
  picks: Readonly<Record<PalettePart, readonly ProductPick[]>> = PRODUCT_PICKS,
): ShadeEntry[] {
  return entries.filter((e) => !picks[e.part].some((p) => p.brand === e.brand && p.name === e.product));
}

const parsed = parseShades(raw);
export const PRODUCT_SHADES_VERSION = parsed.version;
/** 검사를 통과한 호수 색 전부 */
export const PRODUCT_SHADES: readonly ShadeEntry[] = parsed.entries;
/** 파일에서 걸러진 줄의 이유. 비어 있어야 한다 (시험이 확인한다) */
export const PRODUCT_SHADE_ERRORS: readonly string[] = parsed.errors;
