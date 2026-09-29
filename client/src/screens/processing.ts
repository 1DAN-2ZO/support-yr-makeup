/**
 * 서버 처리 — 촬영과 룩 선택 사이. 모듈 ⑥.
 *
 * 사진을 ④ 에 올리고 룩 작업이 생기기를 기다린다. **하나라도 생기면 바로 넘어간다** —
 * 화면 2 가 끝난 룩부터 고를 수 있게 돼 있으므로(F-03) 전부 기다릴 이유가 없다.
 *
 * 기다리는 동안 말이 세 단계로 바뀐다. 사용자가 "멈춘 건가" 를 안 묻게 하려는 것이고,
 * 숫자(몇 초 남음·몇 개 완료)는 안 보여 준다 — 틀리면 더 불안해진다.
 */

import type { LookJobSource } from "../core/look-jobs";
import type { Screen, ScreenContext } from "./shell";

export interface ProcessingDeps {
  jobs: LookJobSource;
  /** 이만큼 지나면 "조금만 더" (기본 20초 — ④ 의 큐 대기 안내와 같은 값) */
  slowMs?: number;
  /** 이만큼 지나면 못 쓰는 것으로 본다 (기본 60초) */
  failMs?: number;
  /** 시험용 */
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
  /** 다시 시도 — 안 주면 버튼을 안 그린다 */
  retry?: () => void;
}

export const DEFAULT_SLOW_MS = 20_000;
export const DEFAULT_FAIL_MS = 60_000;

type Phase = "working" | "slow" | "failed";

const TEXT: Record<Phase, { title: string; note: string }> = {
  working: { title: "화장을 만들고 있어요", note: "얼굴에 맞춰 그리는 중이에요" },
  slow: { title: "조금만 더 기다려 주세요", note: "지금 다른 분들도 만들고 있어요" },
  // 결정 #8 (2026-09-21): 서버가 죽으면 "이용 불가" 로 둔다. 룩 없이 진행하는 대체 흐름은 없다
  failed: { title: "지금은 이용할 수 없어요", note: "서버가 응답하지 않아요. 잠시 후 다시 시도해 주세요" },
};

export function processingScreen<S>(deps: ProcessingDeps): Screen<S> {
  return {
    mount(ctx: ScreenContext<S>) {
      const now = deps.now ?? (() => Date.now());
      const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
      const clearTimer = deps.clearTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
      const slowMs = deps.slowMs ?? DEFAULT_SLOW_MS;
      const failMs = deps.failMs ?? DEFAULT_FAIL_MS;

      const started = now();
      let phase: Phase = "working";
      let alive = true;
      const timers: unknown[] = [];

      const wrap = document.createElement("div");
      wrap.className = "processing";
      ctx.root.append(wrap);

      /** 작업이 하나라도 생기면 화면 2 로. 전부 끝나길 기다리지 않는다 */
      function checkJobs(): void {
        if (!alive || phase === "failed") return;
        if (deps.jobs.current().length > 0) ctx.go("looks");
      }

      function draw(): void {
        const t = TEXT[phase];
        wrap.textContent = "";

        const h = document.createElement("h1");
        h.textContent = t.title;

        const p = document.createElement("p");
        p.className = "muted";
        p.textContent = t.note;

        wrap.append(h, p);

        if (phase === "failed") {
          if (deps.retry) {
            const row = document.createElement("div");
            row.className = "row";
            const again = document.createElement("button");
            again.type = "button";
            again.className = "primary";
            again.textContent = "다시 시도";
            again.addEventListener("click", () => {
              ctx.log.log({ name: "button", button: "processing_retry" });
              deps.retry?.();
            });
            row.append(again);
            wrap.append(row);
          }
          return;
        }

        // 막대는 진행률이 아니라 "돌고 있다" 는 표시다. 가짜 진행률을 그리지 않는다
        const bar = document.createElement("div");
        bar.className = "wait-bar";
        bar.setAttribute("role", "progressbar");
        bar.append(document.createElement("span"));
        wrap.append(bar);
      }

      function goPhase(next: Phase): void {
        if (!alive || phase === next) return;
        phase = next;
        if (next === "failed") {
          ctx.log.log({ name: "error", where: "processing", msg: `no_jobs_after:${now() - started}ms` });
        }
        draw();
      }

      timers.push(setTimer(() => goPhase("slow"), slowMs));
      timers.push(setTimer(() => goPhase("failed"), failMs));

      const stop = deps.jobs.subscribe(checkJobs);
      draw();
      checkJobs();

      return () => {
        alive = false;
        stop();
        for (const id of timers) clearTimer(id);
      };
    },
  };
}
