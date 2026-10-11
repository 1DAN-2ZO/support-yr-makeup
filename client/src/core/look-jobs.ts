/**
 * [옛 흐름 · 지금 안 씀] 서버 처리 화면(screens/processing.ts)만 쓴다 — main.ts 는 빈 것(emptyJobSource)만 넘긴다.
 * 2026-10-06 에 흐름이 바뀌어 그 화면들로 가는 길이 없다.
 * 지우지 않고 둔다 — 등록(main.ts) · 테스트도 그대로다. 목록과 근거: client/OLD-FLOW.md
 */
/**
 * 룩 작업 공급자 — 화면과 ④(서버)를 끊어 놓는 자리.
 *
 * ⑥ 는 "지금 어떤 상태인가"와 "바뀌면 알려줘"만 있으면 화면을 그릴 수 있다.
 * 진짜 공급자(POST /looks → 폴링 또는 SSE)는 ④ 가 이 인터페이스로 올린다.
 * 그때까지는 `emptyJobSource()` 라서 전부 "로딩 중"으로 보인다 — 흐름은 안 끊긴다.
 */

import type { LookJob } from "./types";

export interface LookJobSource {
  /** 지금까지 받은 작업들. 아직 없으면 빈 배열 */
  current(): readonly LookJob[];
  /** 상태가 바뀌면 부른다. 구독을 끊는 함수를 돌려준다 */
  subscribe(onChange: () => void): () => void;
}

/** ④ 가 붙기 전. 아무것도 안 온다 */
export function emptyJobSource(): LookJobSource {
  return { current: () => [], subscribe: () => () => {} };
}

/** 고정된 작업 목록 — 시험과 손으로 보는 확인용 */
export function staticJobSource(jobs: readonly LookJob[]): LookJobSource {
  return { current: () => jobs, subscribe: () => () => {} };
}

/** 시험·목업에서 상태를 밀어 넣을 수 있는 공급자 */
export function mutableJobSource(initial: readonly LookJob[] = []): LookJobSource & {
  push: (jobs: readonly LookJob[]) => void;
} {
  let jobs = initial;
  const subs = new Set<() => void>();
  return {
    current: () => jobs,
    subscribe(onChange) {
      subs.add(onChange);
      return () => subs.delete(onChange);
    },
    push(next) {
      jobs = next;
      for (const cb of subs) cb();
    },
  };
}
