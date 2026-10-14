/**
 * MediaPipe 얼굴 랜드마커를 **한 번만** 만들고, 화면이 사라지면 놓는 훅 (`lib/landmarker.ts` 를 감싼다).
 *
 * 본 앱은 화면이 떠 있는 동안 모델을 한 번만 불러온다 — 다시 찍을 때마다 2~3초를 기다리지 않게.
 * React 에서는 여기에 두 가지가 더 붙는다:
 *
 *  - 개발 모드(StrictMode)에서 효과가 두 번 돈다. `createLandmarker` 는 await 라서 첫 회차가
 *    늦게 끝나면 **버려진 모델**이 남는다. GPU 를 붙들고 있으니 반드시 `close()` 해야 한다
 *    → 회차 깃발(`dead`)을 보고 늦게 도착한 모델은 그 자리에서 닫는다.
 *  - 정리 함수에서 닫되, 닫은 뒤에 `detectForVideo` 가 불리면 터진다. 그래서 상태를 null 로 되돌려
 *    프레임 루프가 더 쓰지 않게 한다.
 *
 * 돌려주는 것은 **상태가 아니라 ref** 다. 매 프레임 쓰는 물건을 상태로 두면 모델이 준비될 때
 * 화면이 한 번 다시 그려지고, 그 바람에 프레임 콜백이 새 함수가 되어 루프가 다시 돈다.
 */

import { useEffect, useRef, useState } from "react";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { createLandmarker } from "../lib/landmarker";

export interface LandmarkerState {
  /** 준비됐으면 모델, 아니면 null. 매 프레임 여기서 읽는다 */
  ref: React.RefObject<FaceLandmarker | null>;
  /** 준비 끝났나 — 안내 문구를 바꾸는 데만 쓴다 */
  ready: boolean;
  /** 모델을 못 불러왔을 때의 오류 */
  error: unknown;
}

export function useLandmarker(mode: "VIDEO" | "IMAGE", opt?: { blendshapes?: boolean }): LandmarkerState {
  const ref = useRef<FaceLandmarker | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // 그릴 때마다 새 객체가 오는 것을 의존성에 넣으면 모델을 계속 다시 만든다 → 원시값으로 풀어 쓴다
  const blendshapes = opt?.blendshapes ?? true;

  useEffect(() => {
    let dead = false;
    let mine: FaceLandmarker | null = null;
    createLandmarker(mode, { blendshapes })
      .then((m) => {
        // 기다리는 사이 화면이 사라졌다 → 버려진 모델이 GPU 를 붙들지 않게 바로 닫는다
        if (dead) { m.close(); return; }
        mine = m;
        ref.current = m;
        setReady(true);
      })
      .catch((e: unknown) => {
        if (dead) return;
        setError(e);
      });
    return () => {
      dead = true;
      setReady(false);
      // 닫은 모델을 프레임 루프가 더 쓰지 않게 ref 를 먼저 비운다
      if (ref.current === mine) ref.current = null;
      mine?.close();
      mine = null;
    };
  }, [mode, blendshapes]);

  return { ref, ready, error };
}
