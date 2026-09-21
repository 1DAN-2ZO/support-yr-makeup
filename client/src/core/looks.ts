/**
 * 룩 템플릿 — 데이터는 `rules/looks.json` 에 있고 여기서는 읽기만 한다.
 * 값을 고치려면 JSON 을 고치고 `version` 을 올린다 (ai-pipeline-v6.md 3절).
 *
 * 지금은 POC 초안이다. 팀이 확정하면 같은 자리에서 교체된다 (#78).
 */

import raw from "../../../rules/looks.json";
import type { PartId } from "./types";

export type LookPartId = Exclude<PartId, "contour">;

export interface LookPart {
  alpha?: number;
  alphaR?: number;
  alphaL?: number;
  thick?: number;
  color?: [number, number, number];
}

export interface Look {
  id: string;
  name: string;
  parts: Partial<Record<LookPartId, LookPart>>;
  /** 화면 2 제품 목록 (접기 없음, 부위 순서대로 5줄) */
  products: string[];
  /** 화면 3 근거 한 줄 — 숫자 없이 말로 */
  rationale: Partial<Record<LookPartId, string>>;
}

interface LooksFile {
  version: string;
  note: string;
  partOrder: LookPartId[];
  contour: { products: string[]; rationale: Record<string, string> };
  looks: Look[];
}

const file = raw as unknown as LooksFile;

export const LOOKS_VERSION = file.version;
export const LOOKS: readonly Look[] = file.looks;
export const LOOK_PART_ORDER: readonly LookPartId[] = file.partOrder;

/** 쉐딩·하이라이트는 룩 템플릿에 없다 — 얼굴형 규칙에서 온다 (F-05) */
export const CONTOUR_PRODUCTS: readonly string[] = file.contour.products;
export const CONTOUR_RATIONALE: Readonly<Record<string, string>> = file.contour.rationale;

export function lookById(id: string | null): Look {
  const found = id ? LOOKS.find((l) => l.id === id) : undefined;
  const first = LOOKS[0];
  if (!first) throw new Error("rules/looks.json 에 룩이 없습니다");
  return found ?? first;
}

/** 화면 2 제품 목록: 룩 5부위 + 쉐딩·하이라이트 기본 제품 (F-04) */
export function productList(look: Look): string[] {
  return [...look.products, ...CONTOUR_PRODUCTS];
}
