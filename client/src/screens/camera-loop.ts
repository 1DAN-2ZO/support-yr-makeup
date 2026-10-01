/**
 * 공용 카메라 루프 (#245) — 카메라에 **새 장면이 들어올 때만** 부른다.
 *
 * requestVideoFrameCallback(rVFC) 이 있으면 새 장면마다, 없으면 화면 그리기(rAF)마다.
 * rAF 만 쓰면 화면(60·120Hz)이 카메라(약 30장)보다 자주 돌아 같은 장면을 두세 번 분석한다 — 촬영·2-b 가 그랬다.
 * 카메라가 어두워 장면을 덜 주면(15~24장) 그만큼만 분석한다.
 *
 * - `now`: 늘어나기만 하는 시각(ms, performance.now() 와 같은 기준). detectForVideo · 떨림 필터 · 대기 시간에 그대로 쓴다
 * - 오류: 다음 장면을 먼저 예약하고 부른다. onError 가 있으면 넘기고 루프는 계속(멈출지는 부른 쪽), 없으면 그대로 던진다
 * - stop() 뒤에는 다시 안 불린다 (콜백 안에서 불러도)
 * - 가렸다 돌아왔을 때 영상이 멈춰 있으면 다시 튼다 — rVFC 는 멈춘 영상에서 안 불린다.
 *   카메라 자체가 꺼졌으면(폰 홈 화면) 이걸로는 못 살린다 → 화면이 카메라를 새로 켠다 (화면 1·4 는 다시 그림)
 */

import type { DocLike } from "./camera-locks";

export interface LoopVideo {
  readonly paused: boolean;
  play(): Promise<void>;
  requestVideoFrameCallback?(cb: (now: number) => void): number;
  cancelVideoFrameCallback?(handle: number): void;
}

export interface LoopEnv {
  raf(cb: (now: number) => void): number;
  caf(handle: number): void;
  doc: DocLike | null;
}

export interface FrameLoopOptions {
  onError?: (e: unknown) => void;
  /** 시험용 — 기본은 브라우저 것 */
  env?: Partial<LoopEnv>;
}

/** 루프를 켜고 끄는 함수를 돌려준다 */
export function startFrameLoop(video: LoopVideo, onFrame: (now: number) => void, opts: FrameLoopOptions = {}): () => void {
  const env: LoopEnv = {
    raf: (cb) => requestAnimationFrame(cb),
    caf: (h) => cancelAnimationFrame(h),
    doc: typeof document === "undefined" ? null : document,
    ...opts.env,
  };
  const vfc = typeof video.requestVideoFrameCallback === "function";
  let stopped = false;
  let handle = 0;
  let last = -Infinity;

  const schedule = (): void => {
    handle = vfc ? video.requestVideoFrameCallback!(tick) : env.raf(tick);
  };

  function tick(t: number): void {
    if (stopped) return;
    schedule();
    // detectForVideo 는 시각이 늘어나야 한다
    const now = Math.max(t, last + 1);
    last = now;
    try {
      onFrame(now);
    } catch (e) {
      if (!opts.onError) throw e;
      opts.onError(e);
    }
  }

  const onVisibility = (): void => {
    if (stopped || env.doc?.visibilityState !== "visible") return;
    if (video.paused) void video.play().catch(() => {});
  };
  env.doc?.addEventListener("visibilitychange", onVisibility);

  schedule();
  return () => {
    if (stopped) return;
    stopped = true;
    if (vfc) video.cancelVideoFrameCallback?.(handle);
    else env.caf(handle);
    env.doc?.removeEventListener("visibilitychange", onVisibility);
  };
}
