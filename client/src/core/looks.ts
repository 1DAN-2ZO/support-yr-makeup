/**
 * 룩 템플릿 — 데이터는 `rules/looks.json` 에 있고 여기서는 읽기만 한다.
 * 값을 고치려면 JSON 을 고치고 `version` 을 올린다 (ai-pipeline-v6.md 3절).
 *
 * look-v0.2 = ④ 가 확정한 화장 10종 (#133, 2026-09-30). 색·진하기는 나중에 바뀔 수 있다 — 바뀌면 version 을 올린다.
 */

import raw from "../../../rules/looks.json";
import type { PartId } from "./types";

export type LookPartId = Exclude<PartId, "contour">;

export type Rgb = [number, number, number];

export interface LookPart {
  alpha?: number;
  alphaR?: number;
  alphaL?: number;
  thick?: number;
  color?: Rgb;
  /** 섀도우 두 색 — at 0 = 속눈썹 쪽, 1 = 눈썹 쪽 (look-v0.2, ④ 템플릿 그대로). 없으면 color 한 색 */
  stops?: { at: number; color: Rgb }[];
  axis?: "vertical" | "horizontal";
  /** 섀도우가 라이너 꼬리 방향으로 길게 이어진다 */
  tailExtend?: boolean;
  finish?: "matte" | "glitter";
  /** 입술 가장자리 색 — 가운데(color) → 가장자리(edge) 그러데이션 */
  edge?: Rgb;
}

/** 채점하지 않는 그리기 전용 부위 (look-v0.2). 마스카라는 채점 안 함 (결정 2026-09-30) */
export interface LookExtras {
  lash?: { intensity: "natural" | "deep"; alpha: number; color: Rgb };
  aegyo?: { alpha: number; color: Rgb; finish?: "matte" | "glitter" };
  contour?: { alpha: number; color: Rgb };
  highlight?: { alpha: number; color: Rgb };
}

export interface Look {
  id: string;
  name: string;
  parts: Partial<Record<LookPartId, LookPart>>;
  extras?: LookExtras;
  /** 화면 2 제품 목록 (접기 없음, 부위 순서대로 5줄) */
  products: string[];
  /** 화면 3 근거 한 줄 — 숫자 없이 말로 */
  rationale: Partial<Record<LookPartId, string>>;
  /** 화면 2 대표 이미지 (앱 기준 경로, 예: "looks/daily.jpg"). 없으면 색 견본 (2026-09-29) */
  image?: string;
}

/** 합산 설정. **전 룩 공통** — 룩마다 다르면 "이 룩은 점수가 잘 나온다"가 생겨 룩 간 비교가 안 된다 */
export interface Scoring {
  weights: Partial<Record<LookPartId, number>>;
  harmonyRange: { maxDeltaAb: number } | null;
}

interface LooksFile {
  version: string;
  note: string;
  partOrder: LookPartId[];
  scoring: Scoring;
  contour: { products: string[]; rationale: Record<string, string> };
  looks: Look[];
}

const file = raw as unknown as LooksFile;

export const LOOKS_VERSION = file.version;
export const LOOKS: readonly Look[] = file.looks;
export const LOOK_PART_ORDER: readonly LookPartId[] = file.partOrder;

/**
 * ③ 의 `computeSummary` 에 넘기는 합산 설정 (`SummaryTemplate` 과 같은 모양).
 * 값은 `rules/looks.json` 에 있다 — 코드에 숫자를 박지 않는다 (dev-stack-v6.md §6).
 *
 * **전 룩 공통이다** (결정 2026-09-22). 룩마다 가중치가 다르면 점수가 잘 나오는 룩이 생기고,
 * 사용자가 그것만 고르게 된다. 룩 간 비교도 안 된다.
 */
export const SUMMARY_TEMPLATE: {
  partIds: readonly LookPartId[];
  weights: Scoring["weights"];
  harmonyRange: Scoring["harmonyRange"];
} = {
  partIds: file.partOrder,
  weights: file.scoring.weights,
  harmonyRange: file.scoring.harmonyRange,
};

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
