/**
 * 매 프레임 도는 루프 (`lib/camera-loop.ts` 의 `startFrameLoop` 을 감싼다).
 *
 * 본 앱은 "카메라에 새 장면이 들어올 때만" 부른다 — 화면(60·120Hz)이 카메라(약 30장)보다 자주
 * 돌아 같은 장면을 두세 번 분석하던 문제 때문이다 (#245). 그 규칙은 `startFrameLoop` 에 그대로 있다.
 *
 * **React 에서 가장 흔한 사고는 콜백 때문에 루프가 두 겹으로 도는 것이다.** 프레임마다 하는 일은
 * 상태를 읽으니 콜백이 그릴 때마다 새 함수가 된다. 그 함수를 의존성 배열에 넣으면 그릴 때마다
 * 루프를 끄고 다시 켠다 — 안정 프레임 수가 계속 0 으로 돌아가 영원히 못 찍는다.
 *   → 콜백은 **ref 에 담아** 두고, 의존성에는 원시값(`on`)과 video 요소만 넣는다.
 *
 * 개발 모드(StrictMode)의 두 번 실행은 `startFrameLoop` 가 돌려주는 stop() 을 정리 함수에서
 * 반드시 부르는 것으로 막는다. stop() 뒤에는 콜백이 다시 안 불린다(본 앱에 시험이 붙어 있다).
 * 정말 하나만 도는지는 `liveFrameLoops()` 로 셀 수 있다.
 */

import { useEffect, useRef } from "react";
import { startFrameLoop, type LoopVideo } from "../lib/camera-loop";

/** 지금 돌고 있는 루프 수 — 두 겹으로 도는지 눈으로 재려고 둔다 (임시 페이지 capture-probe 가 읽는다) */
let live = 0;
export const liveFrameLoops = (): number => live;

export interface UseFrameLoopOptions {
  /** 미리보기 video. 없거나 on=false 면 루프를 켜지 않는다 */
  video: React.RefObject<HTMLVideoElement | null>;
  /** 카메라·모델이 다 준비됐을 때만 true 로 켠다 */
  on: boolean;
  /** 프레임마다. 그릴 때마다 새 함수여도 된다 — 루프는 다시 돌지 않는다 */
  onFrame: (now: number) => void;
  /** 콜백이 던진 오류. 주면 루프는 계속 돈다 */
  onError?: (e: unknown) => void;
}

export function useFrameLoop({ video, on, onFrame, onError }: UseFrameLoopOptions): void {
  // 늘 가장 최근 콜백을 쓴다. 의존성에 넣지 않으니 루프는 켜질 때 한 번만 시작한다
  const frame = useRef(onFrame);
  const fail = useRef(onError);
  useEffect(() => {
    frame.current = onFrame;
    fail.current = onError;
  });

  useEffect(() => {
    const el = video.current;
    if (!on || !el) return;
    live += 1;
    const stop = startFrameLoop(el as unknown as LoopVideo, (now) => frame.current(now), {
      // onError 를 안 받았으면 본 앱처럼 그대로 던진다 — 조용히 삼키면 깨진 루프가 계속 돈다
      onError: (e) => {
        if (fail.current) fail.current(e);
        else throw e;
      },
    });
    return () => {
      stop();
      live -= 1;
    };
  }, [on, video]);
}
