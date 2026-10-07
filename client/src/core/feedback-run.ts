/**
 * 화면 6 피드백 잇기 (2026-10-07, 모듈 ⑥, #332) — 앱이 가진 것을 ③ 의 feedbackWhole(core/feedback-measure) 에 넣는다. 순수 함수.
 *
 * 재는 법 · 문장 · 기준값은 전부 ③ 것이다. 여기서는 넣기 전에 "넣어도 되는 것인가" 만 본다:
 *   - 맨얼굴 · 정답사진 · 시도사진 중 없는 것이 있으면 판정하지 않고 무엇이 없는지 돌려준다 (화면이 안내한다)
 *   - 정답사진이 맨얼굴과 크기가 다르면 판정하지 않는다 — 겹친다는 조건이 깨진 그림으로는 결과가 틀린다
 *     (docs/feedback-input-contract.md "지킬 것" 1)
 *   - 옮긴 그림은 있으면 쓰고, 크기가 다르면 버린다 (라이너만 "볼 수 없었어요" 가 되고 나머지 부위는 그대로 판정)
 */

import type { RgbaImage } from "./color";
import { feedbackWhole } from "./feedback-measure";
import type { WholeFeedback } from "./feedback-whole";
import { frameOf, type HairMask } from "./sampling";
import type { Pt } from "./types";

/** 사진 한 장 — 그림과 그 그림 px 기준 얼굴 점 */
export interface FeedbackPhoto {
  image: RgbaImage;
  lm: readonly Pt[];
  hair?: HairMask;
}

export interface FeedbackSources {
  /** 맨얼굴 눈 뜬 장 (화면 1) */
  bare: FeedbackPhoto | null;
  /** 정답사진 (화면 3) — 맨얼굴과 같은 크기 · 같은 자리 */
  answer: RgbaImage | null;
  /** 시도사진 눈 뜬 장 묶음 (화면 5) — 1~5장 */
  attempt: readonly FeedbackPhoto[];
  /** 옮긴 그림 — 시도사진의 화장을 정답사진과 같은 방법으로 맨얼굴에 옮긴 것. 없으면 라이너는 보지 않는다 */
  moved?: RgbaImage | null;
}

/** 판정하지 못한 까닭: 무엇이 없나 · answer_size = 정답사진이 맨얼굴과 크기가 다름 */
export type FeedbackMissing = "bare" | "answer" | "attempt" | "answer_size";

export type FeedbackRun =
  | { ok: true; feedback: WholeFeedback; /** 옮긴 그림을 받았는데 크기가 달라 버렸다 */ movedDropped: boolean }
  | { ok: false; missing: FeedbackMissing };

const sameSize = (a: RgbaImage, b: RgbaImage): boolean => a.w === b.w && a.h === b.h;

export function runFeedback(s: FeedbackSources): FeedbackRun {
  if (!s.bare) return { ok: false, missing: "bare" };
  if (!s.answer) return { ok: false, missing: "answer" };
  if (!s.attempt.length) return { ok: false, missing: "attempt" };
  if (!sameSize(s.answer, s.bare.image)) return { ok: false, missing: "answer_size" };
  const movedDropped = !!s.moved && !sameSize(s.moved, s.bare.image);
  const moved = s.moved && !movedDropped ? s.moved : null;
  const feedback = feedbackWhole({
    bare: frameOf(s.bare.image, s.bare.lm, s.bare.hair),
    target: s.answer,
    cur: s.attempt.map((a) => frameOf(a.image, a.lm, a.hair)),
    moved,
  });
  return { ok: true, feedback, movedDropped };
}
