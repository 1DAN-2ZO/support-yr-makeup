/**
 * 룩별 개인화 대기열 (⑥) — 룩 화면에서 누른 룩마다 개인화를 **한 번** 계산해 기억한다 (결정 2026-09-28).
 *
 * - 안 누른 룩은 계산하지 않는다 (VLM 호출 = 누른 룩 수)
 * - 계산 중에 여러 개를 누르면 **마지막에 누른 룩부터** — 사용자가 지금 보는 룩이 먼저다
 * - 시작한 계산은 끝까지 해서 기억한다 (다른 룩으로 갔다 와도 바로 보이게)
 * - 실패는 기억하지 않는다 — 다시 누르면 다시 계산
 *
 * 한 번에 하나만 계산한다: 학원 컴퓨터 GPU 한 장을 VLM·화장 전이가 같이 쓴다.
 */

export interface PlanQueue<T> {
  /** 계산된 결과를 돌려준다. 기억한 것이면 바로, 아니면 차례가 되어 끝날 때 */
  request: (lookId: string) => Promise<T>;
  /** 기억한 결과 (없으면 undefined) */
  get: (lookId: string) => T | undefined;
  /** 기억을 모두 지운다 (새 세션·다시 찍기) */
  clear: () => void;
}

export function createPlanQueue<T>(compute: (lookId: string) => Promise<T>): PlanQueue<T> {
  const done = new Map<string, T>();
  const waiters = new Map<string, { resolve: (v: T) => void; reject: (e: unknown) => void }[]>();
  /** 기다리는 룩 — 뒤에 있을수록 최근에 누른 것 */
  let queue: string[] = [];
  let running: string | null = null;
  let epoch = 0;

  function settle(lookId: string, fn: (w: { resolve: (v: T) => void; reject: (e: unknown) => void }) => void): void {
    const ws = waiters.get(lookId) ?? [];
    waiters.delete(lookId);
    ws.forEach(fn);
  }

  function pump(): void {
    if (running !== null || !queue.length) return;
    const lookId = queue.pop()!;                   // 마지막에 누른 것부터
    running = lookId;
    const my = epoch;
    compute(lookId).then(
      (v) => {
        if (my !== epoch) return;
        done.set(lookId, v);
        settle(lookId, (w) => w.resolve(v));
      },
      (e) => {
        if (my !== epoch) return;
        settle(lookId, (w) => w.reject(e));
      },
    ).finally(() => {
      if (my !== epoch) return;
      running = null;
      pump();
    });
  }

  return {
    request(lookId) {
      const hit = done.get(lookId);
      if (hit !== undefined) return Promise.resolve(hit);
      return new Promise<T>((resolve, reject) => {
        const ws = waiters.get(lookId) ?? [];
        ws.push({ resolve, reject });
        waiters.set(lookId, ws);
        if (running !== lookId) {
          queue = queue.filter((id) => id !== lookId);
          queue.push(lookId);                      // 다시 누르면 맨 앞(= 배열 끝)으로
        }
        pump();
      });
    },
    get: (lookId) => done.get(lookId),
    clear() {
      epoch++;
      done.clear();
      queue = [];
      running = null;
      for (const id of [...waiters.keys()]) settle(id, (w) => w.reject(new Error("개인화 기억을 지웠다")));
    },
  };
}
