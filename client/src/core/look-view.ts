/**
 * [옛 흐름 · 지금 안 씀] 화면 2 · 2-b(screens/looks.ts · fullrender.ts)만 쓴다.
 * 2026-10-06 에 흐름이 바뀌어 그 화면들로 가는 길이 없다.
 * 지우지 않고 둔다 — 등록(main.ts) · 테스트도 그대로다. 목록과 근거: client/OLD-FLOW.md
 */
/**
 * 화면 2 표시 규칙 — 순수 함수. DOM 을 모른다.
 *
 * 룩 썸네일은 서버(④)가 만든다. 오기 전에는 "로딩 중", 실패한 룩은 "준비 중"으로 두고
 * **끝난 룩부터 순서대로 고를 수 있게** 한다 (F-03).
 */

import { lookById, productList, type Look } from "./looks";
import type { LookJob } from "./types";

export type TileState = "loading" | "waiting_long" | "ready" | "unavailable";

export interface LookTile {
  lookId: string;
  name: string;
  state: TileState;
  /** ready 일 때만 있다 */
  imageUrl: string | null;
  /** 화면에 그대로 쓰는 한 줄. 숫자 없음 */
  note: string;
  /** 고를 수 있나 */
  selectable: boolean;
}

const NOTE: Record<TileState, string> = {
  loading: "로딩 중",
  waiting_long: "잠시 후 다시 볼게요",
  ready: "",
  // fallback(정체성 미달)·error 를 사용자에게 구분해 보여줄 이유가 없다
  unavailable: "준비 중",
};

export function tileState(job: LookJob | undefined): TileState {
  if (!job) return "loading";
  switch (job.status) {
    case "done":
      return job.result_url ? "ready" : "unavailable";
    case "waiting_long":
      return "waiting_long";
    case "fallback":
    case "error":
      return "unavailable";
    default:
      return "loading";
  }
}

/** 룩 목록 + 서버 작업 상태 → 화면에 그릴 타일들. 룩 순서는 rules/looks.json 그대로 */
export function tiles(looks: readonly Look[], jobs: readonly LookJob[]): LookTile[] {
  const byLook = new Map(jobs.map((j) => [j.look_id, j]));
  return looks.map((l) => {
    const job = byLook.get(l.id);
    const state = tileState(job);
    return {
      lookId: l.id,
      name: l.name,
      state,
      imageUrl: state === "ready" ? (job?.result_url ?? null) : null,
      note: NOTE[state],
      selectable: state === "ready",
    };
  });
}

/** 하나라도 고를 수 있나 — 전부 로딩이면 "이 룩으로 시작"을 누를 수 없다 */
export function anySelectable(ts: readonly LookTile[]): boolean {
  return ts.some((t) => t.selectable);
}

/** 전부 준비 중이면 서버가 죽은 것 — 화면에 안내를 띄운다 */
export function allUnavailable(ts: readonly LookTile[]): boolean {
  return ts.length > 0 && ts.every((t) => t.state === "unavailable");
}

export interface LookDetail {
  look: Look;
  /** 룩 5부위 + 쉐딩·하이라이트 기본 제품. 접기 없이 전부 (F-04) */
  products: string[];
}

export function lookDetail(lookId: string | null): LookDetail {
  const look = lookById(lookId);
  return { look, products: productList(look) };
}

/** 화면 2-b: 전체 완성 예상 한 장. 고른 룩의 결과를 그대로 쓴다 */
export function fullRenderUrl(jobs: readonly LookJob[], lookId: string | null): string | null {
  if (!lookId) return null;
  const job = jobs.find((j) => j.look_id === lookId);
  return job?.status === "done" ? job.result_url : null;
}

// ---------- 화장 목록 타일 (2026-09-29: Stable-Makeup 을 빼서 서버 그림이 없다) ----------

export interface CatalogTile {
  lookId: string;
  name: string;
  /** 대표 이미지. 없으면 null — 색 견본을 그린다 */
  imageUrl: string | null;
  /** 그 화장의 입술·볼·섀도 색 (#rrggbb). 대표 이미지가 없을 때 쓴다 */
  swatch: string[];
  /** 처음부터 전부 고를 수 있다 — 기다릴 서버 그림이 없다 */
  selectable: true;
}

const hex = (c: readonly number[]): string => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

export function catalogTiles(looks: readonly Look[]): CatalogTile[] {
  return looks.map((l) => ({
    lookId: l.id,
    name: l.name,
    imageUrl: l.image ?? null,
    swatch: (["lip", "cheek", "shadow"] as const).flatMap((p) => (l.parts[p]?.color ? [hex(l.parts[p]!.color!)] : [])),
    selectable: true,
  }));
}

