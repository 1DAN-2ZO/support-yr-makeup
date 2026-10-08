/**
 * 작업 시간 기록 (2026-10-08, 모듈 ⑥) — 기다리는 작업이 몇 초 걸렸는지 사용 기록(`task` 줄)에 남긴다.
 *
 * 새 흐름의 작업들(정답사진 만들기 · 부위 가이드 · 피드백 · 결과 한 장)은 시간을 재고도 남기지 않아서,
 * 어디가 느린지 볼 자료가 없었다. 작업을 timeTask 로 감싸면 끝날 때 한 줄이 남는다:
 *   { name: "task", task: "answer_make", ms: 23400, ok: true, why: null, gen_ms: 21000, queue_ms: 12000, flux_ms: 8600 }
 * 모으는 곳은 다른 사용 기록과 같다 (POST /events → 서버의 $DHE_DATA_DIR/events/날짜.jsonl), 보는 것은 eval/funnel.
 *
 * - 작업의 답 · 오류는 그대로 돌려준다. 감싸도 부르는 쪽이 달라지지 않는다
 * - 기록하다 난 오류는 삼킨다 — 기록이 화면을 막지 않는다
 * - 숫자와 짧은 이름만 남긴다. 사진 · 얼굴 점 · 파일 이름은 넣지 않는다 (core/log 가 키로도 막는다)
 */

import type { EventFields, TaskName } from "./types";

/** 작업이 끝난 뒤 그 답에서 읽어 남길 것 */
export interface TaskNote {
  ok: boolean;
  /** 못 한 까닭 · 덧붙일 한마디 (짧은 이름. 문장 · 오류 원문 금지) */
  why?: string | null | undefined;
  /** 서버가 부르고 받기까지 걸린 시간 · 줄 선 시간 · FLUX 가 스스로 잰 시간 (정답사진 · 옮긴 그림) */
  gen_ms?: number | null | undefined;
  queue_ms?: number | null | undefined;
  flux_ms?: number | null | undefined;
  /** 개수 — 작업마다 뜻이 다르다 (찾은 부위 수 · 본 시도사진 장 수 · 읽은 색 수) */
  n?: number | null | undefined;
  /** 크기 (KB) — 올린 사진 · 만든 그림 */
  kb?: number | null | undefined;
}

const WHY_MAX = 40;
const EXTRA = ["gen_ms", "queue_ms", "flux_ms", "n", "kb"] as const;

export async function timeTask<T>(
  log: { log: (fields: EventFields) => unknown },
  task: TaskName,
  run: () => Promise<T>,
  read: (result: T) => TaskNote,
  now: () => number = () => performance.now(),
): Promise<T> {
  const t0 = now();
  const write = (note: TaskNote): void => {
    try {
      const ev: Extract<EventFields, { name: "task" }> = {
        name: "task", task, ms: Math.round(now() - t0), ok: note.ok,
        why: typeof note.why === "string" ? note.why.slice(0, WHY_MAX) : null,
      };
      for (const k of EXTRA) {
        const v = note[k];
        if (typeof v === "number" && Number.isFinite(v)) ev[k] = Math.round(v);
      }
      log.log(ev);
    } catch { /* 기록 실패는 넘어간다 */ }
  };
  let result: T;
  try {
    result = await run();
  } catch (e) {
    write({ ok: false, why: "error" });
    throw e;
  }
  let note: TaskNote | null = null;
  try { note = read(result); } catch { /* 답을 못 읽으면 남기지 않는다 */ }
  if (note) write(note);
  return result;
}
