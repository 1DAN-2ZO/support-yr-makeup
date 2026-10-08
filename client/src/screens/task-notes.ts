/**
 * 작업의 답에서 사용 기록(`task` 줄)에 남길 것 읽기 (2026-10-08, 모듈 ⑥) — core/task-timer 의 timeTask 에 넘기는 함수들.
 * main.ts 가 작업을 감쌀 때 쓴다. 숫자와 짧은 이름만 남긴다 — 사진 · 서버가 한 말 · 피드백 문장은 남기지 않는다.
 */

import type { MakeResult } from "@core/picture-maker";
import type { TaskNote } from "@core/task-timer";
import type { SaveKit } from "./feedback-card";
import type { FeedbackLoad } from "./feedback-source";
import type { GuideLoad } from "./guide-source";
import type { RefAnalysis, RefFailure } from "./ref-analyze";

const kbOf = (b: Blob): number => Math.round(b.size / 1024);

/** 정답사진 · 옮긴 그림 — 서버가 나눠 알려 준 시간(부르고 받기까지 · 줄 선 시간 · FLUX 가 스스로 잰 시간)과 받은 그림 크기 */
export function noteOfMake(r: MakeResult): TaskNote {
  return r.ok ? { ok: true, gen_ms: r.ms, queue_ms: r.queueMs, flux_ms: r.fluxMs, kb: kbOf(r.picture) } : { ok: false, why: r.why };
}

/** 부위 가이드 재료 — n = 테두리를 찾은 부위 수 */
export function noteOfGuide(r: GuideLoad): TaskNote {
  return r.ok ? { ok: true, n: r.view.found.length } : { ok: false, why: r.missing };
}

/** 피드백 계산 — n = 본 시도사진 장 수. 계산은 됐지만 "다시 찍기" 로 끝났으면 why 에 blocked */
export function noteOfFeedback(r: FeedbackLoad): TaskNote {
  if (!r.ok) return { ok: false, why: r.missing };
  return { ok: true, n: r.view.frames, why: r.view.feedback.blocked ? "blocked" : r.view.movedFailed ? "moved_failed" : null };
}

/** 결과 한 장 */
export function noteOfSave(kit: SaveKit | null): TaskNote {
  if (!kit) return { ok: false, why: "nothing" };
  return kit.card ? { ok: true, kb: kbOf(kit.card) } : { ok: false, why: "no_card" };
}

/** 참고 사진에서 얼굴 · 색 읽기 — n = 색을 읽은 부위 수 */
export function noteOfRef(r: RefAnalysis | RefFailure): TaskNote {
  return typeof r === "string" ? { ok: false, why: r } : { ok: true, n: Object.keys(r.colors).length };
}

/** 올리기 전에 줄인 참고 사진 크기 */
export function noteOfShrink(b: Blob): TaskNote {
  return { ok: true, kb: kbOf(b) };
}
