/**
 * [새 흐름 POC] 가이드 대 시도 — 부위별 덜 그림 · 넘침 (2026-10-07, ②). 점수는 없다.
 * 화면 6 피드백은 ③ 담당이라, 그 화면이 오기 전에 새 흐름을 한 바퀴 돌려 보는 POC(flow-poc.html)에서만 쓰는 간단 비교다.
 *   덜 그림: 가이드 안(테두리에서 tol 안쪽)이면서 정답사진이 칠한 자리인데, 시도사진은 그 둘레(tol)에도 안 칠한 곳 —
 *           가이드 안을 다 칠하라고 보면 원래 진한 눈썹 털처럼 정답사진에서도 안 바뀐 곳이 덜 그림으로 나왔다 (실사진, 시험 F9)
 *   넘침:   시도사진에서 칠했는데 가이드 밖(테두리에서 tol 넘게) — 테두리를 딱 맞출 순 없어서 tol 만큼은 봐준다
 * 아래 섀도는 섀도 화면에 합친다. 블러셔는 비교하지 않고 확인만 (볼터치는 채점에서 뺐다 — 서비스 정의서 2026-10-06).
 * 화면 순서는 서비스 정의서 §8 이야기대로 눈썹 → 라이너 → 섀도 → 입술, 블러셔는 맨 뒤.
 */

import { pointInPoly } from "./color";
import type { ExtractPart, PartMask } from "./makeup-extract";
import { dilate, erode, type PartGuide } from "./part-guide";
import type { PartId, Pt } from "./types";

export type FeedbackPart = Extract<PartId, "brow" | "liner" | "shadow" | "lip" | "cheek">;
export const FEEDBACK_ORDER: readonly FeedbackPart[] = ["brow", "liner", "shadow", "lip", "cheek"];

/**
 * tol: 봐주는 테두리 폭(눈 폭 비율 — 부르는 쪽이 px 로 바꿔 넘긴다) · miss: 덜 그린 곳이 가이드 안쪽의 이 비율 넘으면 말한다 ·
 * over: 넘친 곳이 칠한 곳의 이 비율 넘으면 말한다 · none: 가이드 둘레 안에 칠한 곳이 칠해야 할 자리의 이 비율도 안 되면 "안 칠함" ·
 * thin: 가이드를 tol 만큼 깎고 남은 게 이 비율 밑이면 가는 띠(라이너)라 깎지 않는다
 */
export const FEEDBACK = {
  tol: 0.06, miss: 0.2, over: 0.15, none: 0.05, thin: 0.25,
  say: {
    ok: "가이드대로 칠했어요",
    miss: "가이드 안에 덜 칠한 곳이 있어요",
    over: "가이드 밖으로 나간 곳이 있어요",
    none: "아직 거의 안 칠한 것 같아요",
    checkOnly: "확인만 — 블러셔는 비교하지 않아요",
  },
} as const;

const PAGE: Partial<Record<ExtractPart, FeedbackPart>> = { brow: "brow", liner: "liner", shadow: "shadow", underShadow: "shadow", lip: "lip", cheek: "cheek" };
/** 떼어 낸 부위 → 가이드 · 피드백 화면 (아래 섀도는 섀도 화면, 쉐딩 · 하이라이트는 없음) */
export const pageOf = (p: ExtractPart): FeedbackPart | null => PAGE[p] ?? null;

export interface PartFeedback {
  part: FeedbackPart;
  /** 덜 그린 곳 · 넘친 곳 (w×h, 1 = 그 자리) */
  missed: Uint8Array;
  over: Uint8Array;
  missRatio: number;
  overRatio: number;
  /** 말로 — 점수 없이 */
  notes: string[];
}

function raster(polys: readonly Pt[][], w: number, h: number): Uint8Array {
  const m = new Uint8Array(w * h), xs = polys.flat().map((p) => p.x), ys = polys.flat().map((p) => p.y);
  const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(w - 1, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(h - 1, Math.ceil(Math.max(...ys)));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (polys.some((p) => pointInPoly(x, y, p))) m[y * w + x] = 1;
  return m;
}

const count = (m: Uint8Array): number => m.reduce((s, v) => s + v, 0);

/** 그 화면 부위(아래 섀도는 섀도)의 뗀 픽셀을 하나로 */
function union(parts: readonly PartMask[], page: FeedbackPart, n: number): Uint8Array {
  const m = new Uint8Array(n);
  for (const p of parts) if (pageOf(p.part) === page) for (let i = 0; i < n; i++) if (p.mask[i]) m[i] = 1;
  return m;
}

/**
 * @param guides 정답사진에서 만든 부위 가이드 (core/part-guide) — 맨얼굴 좌표
 * @param answer 정답사진에서 뗀 부위 (가이드를 만든 그것) — 같은 좌표
 * @param attempt 시도사진에서 뗀 부위 (맨얼굴에 겹친 뒤 extractAll) — 같은 좌표
 * @param tolPx 봐주는 테두리 폭 px (보통 FEEDBACK.tol × 눈 폭)
 */
export function guideFeedback(guides: readonly PartGuide[], answer: readonly PartMask[], attempt: readonly PartMask[], w: number, h: number, tolPx: number): PartFeedback[] {
  const r = Math.max(1, Math.round(tolPx));
  return FEEDBACK_ORDER.flatMap((part): PartFeedback[] => {
    const polys = guides.filter((g) => pageOf(g.part) === part).flatMap((g) => g.polys).filter((p) => p.length >= 3);
    if (!polys.length) return [];
    if (part === "cheek") return [{ part, missed: new Uint8Array(w * h), over: new Uint8Array(w * h), missRatio: 0, overRatio: 0, notes: [FEEDBACK.say.checkOnly] }];
    const G = raster(polys, w, h), A = union(attempt, part, w * h);
    // 가는 띠(라이너)는 tol 만큼 깎으면 다 없어져 칠해야 할 자리가 0 — 맨얼굴인데 '가이드대로' 였다 (실사진, 시험 F10)
    const eroded = erode(G, w, h, r), inner = count(eroded) >= FEEDBACK.thin * count(G) ? eroded : G;
    const outer = dilate(G, w, h, r), T = dilate(union(answer, part, w * h), w, h, r), An = dilate(A, w, h, r);
    const missed = new Uint8Array(w * h), over = new Uint8Array(w * h);
    let want = 0, near = 0;
    for (let i = 0; i < A.length; i++) {
      if (inner[i] && T[i]) { want++; if (!An[i]) missed[i] = 1; }
      if (A[i] && !outer[i]) over[i] = 1;
      if (A[i] && outer[i]) near++;
    }
    const missRatio = count(missed) / Math.max(1, want), overRatio = count(over) / Math.max(1, count(A));
    if (near < FEEDBACK.none * want) return [{ part, missed, over, missRatio, overRatio, notes: [FEEDBACK.say.none] }];
    const notes: string[] = [];
    if (missRatio > FEEDBACK.miss) notes.push(FEEDBACK.say.miss);
    if (overRatio > FEEDBACK.over) notes.push(FEEDBACK.say.over);
    return [{ part, missed, over, missRatio, overRatio, notes: notes.length ? notes : [FEEDBACK.say.ok] }];
  });
}
