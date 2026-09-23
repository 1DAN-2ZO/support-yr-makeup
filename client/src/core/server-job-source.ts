/**
 * LookJobSource 의 실제 구현 — 서버(④)에 사진을 올리고 폴링으로 상태를 따라간다.
 *
 * 계약: server/app/main.py·schemas.py
 *   POST {baseUrl}/sessions/{sessionId}/jobs  multipart/form-data
 *     photo, look_ids(콤마 구분), chosen?  →  { session_id, jobs: LookJob[] }
 *   GET {baseUrl}/jobs/{job_id}  →  LookJob
 *
 * 원칙: 서버가 없거나 요청이 실패해도 던지지 않는다 — `onError`만 부르고
 * 마지막으로 알려진 상태로 둔다(초기 제출 실패면 `current()`는 계속 빈 배열 —
 * `emptyJobSource()`와 같은 "로딩 중" 동작).
 *
 * **보는 사람이 없으면 폴링하지 않는다 (#130).** 구독자가 0이면 타이머를 걸지 않고,
 * 마지막 구독자가 떠나면 걸려 있던 타이머를 끈다. 폰에서 화면을 떠난 뒤에도 1초마다
 * 서버를 두드리면 배터리를 먹고, 작업이 `queued`에 걸려 있으면 영원히 안 멈춘다.
 * 다시 구독하면 재개하므로 화면으로 돌아오면 이어서 따라간다.
 */

import type { LookJob } from "./types";
import type { LookJobSource } from "./look-jobs";
import { setVersions } from "./versions";

export interface ServerJobSourceOptions {
  baseUrl: string;
  sessionId: string;
  photo: Blob;
  lookIds: readonly string[];
  chosen?: string | null;
  pollMs?: number;
  fetchImpl?: typeof fetch;
  onError?: (e: unknown) => void;
}

const DEFAULT_POLL_MS = 1000;

const PENDING_STATUSES = new Set(["queued", "waiting_long", "running"]);

function isPending(job: LookJob): boolean {
  return PENDING_STATUSES.has(job.status);
}

export function createServerJobSource(opts: ServerJobSourceOptions): LookJobSource {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const pollMs = opts.pollMs ?? DEFAULT_POLL_MS;

  let jobs: LookJob[] = [];
  const subs = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  function notify(): void {
    for (const cb of subs) cb();
  }

  function reportError(e: unknown): void {
    if (opts.onError) opts.onError(e);
  }

  function schedulePoll(): void {
    if (timer !== undefined) return;
    if (subs.size === 0) return;          // 보는 사람이 없으면 안 건다 (#130)
    if (!jobs.some(isPending)) return;
    timer = setTimeout(() => {
      timer = undefined;
      void pollOnce();
    }, pollMs);
  }

  async function pollOnce(): Promise<void> {
    const pending = jobs.filter(isPending);
    if (pending.length === 0) return;

    const results = await Promise.all(
      pending.map(async (job) => {
        try {
          const res = await fetchImpl(`${opts.baseUrl}/jobs/${job.job_id}`);
          if (!res.ok) throw new Error(`GET /jobs/${job.job_id} -> ${res.status}`);
          const updated = (await res.json()) as LookJob;
          return updated;
        } catch (e) {
          reportError(e);
          return null;
        }
      }),
    );

    let changed = false;
    for (const updated of results) {
      if (!updated) continue;
      const idx = jobs.findIndex((j) => j.job_id === updated.job_id);
      if (idx !== -1) {
        jobs[idx] = updated;
        changed = true;
      }
    }

    if (changed) notify();
    schedulePoll();   // 폴링이 도는 사이에 마지막 구독자가 떠났으면 여기서 멈춘다
  }

  function stopPoll(): void {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
  }

  async function submit(): Promise<void> {
    try {
      const form = new FormData();
      form.set("photo", opts.photo);
      form.set("look_ids", opts.lookIds.join(","));
      if (opts.chosen != null) form.set("chosen", opts.chosen);

      const res = await fetchImpl(`${opts.baseUrl}/sessions/${opts.sessionId}/jobs`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error(`POST /sessions/${opts.sessionId}/jobs -> ${res.status}`);

      const data = (await res.json()) as { session_id: string; jobs: LookJob[] };
      jobs = data.jobs;

      const transfer = jobs.find((j) => j.ver?.transfer)?.ver.transfer;
      if (transfer) setVersions({ transfer });

      notify();
      schedulePoll();
    } catch (e) {
      reportError(e);
    }
  }

  void submit();

  return {
    current: () => [...jobs],
    subscribe(onChange) {
      subs.add(onChange);
      schedulePoll();                     // 다시 보기 시작하면 재개
      return () => {
        subs.delete(onChange);
        if (subs.size === 0) stopPoll();
      };
    },
  };
}
