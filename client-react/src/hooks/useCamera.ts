/**
 * 앞 카메라를 열고 닫는 훅. 본 앱 `screens/capture.ts` 의 `start()` · `stopCamera()` 가 하던 일 중
 * **카메라에 관한 것만** 옮겼다 — 1080p 로 열기 · 카메라 잠금 풀기 · 초광각 줌 · 화면 꺼짐 방지.
 *
 * 미리보기 video 에 붙이는 일은 **여기서 하지 않는다.** 스트림만 돌려주고 화면이 붙인다 —
 * 훅이 남의 ref 를 건드리면 "언제 붙었나" 가 그리기 순서에 묶여 따라가기 어려워지고,
 * 완성사진·실시간 가이드처럼 미리보기가 없는 곳에서도 이 훅을 그대로 쓸 수 있다.
 *
 * **React 가 본 앱에 없던 위험을 만든다.** 개발 모드(StrictMode)에서 효과가 두 번 돌기 때문에
 * `getUserMedia` 가 두 번 불리고, 첫 번째가 늦게 끝나면 이미 정리된 화면에 스트림이 남는다.
 * 카메라 불이 안 꺼지고, 다른 앱이 카메라를 못 쓴다. 그래서 두 가지를 둔다:
 *
 *  1. 효과 안에서 `dead` 라는 그 회차만의 깃발을 든다. `await` 에서 돌아올 때마다 확인하고,
 *     이미 죽었으면 **그 자리에서 트랙을 끈다**. 늦게 도착한 스트림이 떠돌지 않는다.
 *  2. 정리 함수에서 트랙·웨이크락을 반드시 놓는다. 잠금은 풀고 나서 끈다 — PC 웹캠은 잠금을
 *     기기에 저장해서 다음에 열 때 하얗게·파랗게 남는다 (본 앱 #267).
 *
 * 의존성 배열에는 **원시값만** 넣는다. 함수나 배열을 넣으면 그릴 때마다 새것이라 카메라가 다시 열린다.
 */

import { useCallback, useEffect, useState } from "react";
import { ALL_LOCKS, applyCameraLocks, applyUltraWideZoom, releaseCameraLocks, requestWakeLock, type WakeLockSentinelLike } from "../lib/camera-locks";

/** 카메라 잠금 비교용 주소 꼬리 `?lock=all|wb|wbfocus` 의 값. 기본(없음)은 아무것도 잠그지 않는다 (#267) */
export type LockMode = "all" | "wb" | "wbfocus" | null;

/** 주소에서 잠금 모드만 뽑는다 — 원시값이라 의존성 배열에 그대로 넣어도 안전하다 */
export function lockModeFromSearch(search: string): LockMode {
  const mode = new URLSearchParams(search).get("lock");
  return mode === "all" || mode === "wb" || mode === "wbfocus" ? mode : null;
}

function locksOf(mode: LockMode): NonNullable<Parameters<typeof applyCameraLocks>[1]> {
  if (mode === "all") return ALL_LOCKS;
  if (mode === "wb") return ["whiteBalanceMode"];
  if (mode === "wbfocus") return ["whiteBalanceMode", "focusMode"];
  return [];
}

export interface UseCameraOptions {
  /** false 면 열지 않는다(열려 있으면 끈다). 다 찍은 뒤·탭이 숨었을 때 끄는 데 쓴다 */
  on: boolean;
  /** 비교 시험용 잠금. 기본은 아무것도 잠그지 않는다 */
  lockMode?: LockMode;
}

export interface CameraState {
  /** 열린 스트림. 아직이거나 실패했으면 null */
  stream: MediaStream | null;
  /** 못 열었을 때의 오류 그대로 — 사람 말로 바꾸는 것은 `core/camera-fail` 이 한다 */
  error: unknown;
  /** 다시 열기. 오류 뒤 "다시 시도" 가 부른다 */
  retry: () => void;
}

export function useCamera({ on, lockMode = null }: UseCameraOptions): CameraState {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<unknown>(null);
  // 이 숫자가 바뀔 때마다 카메라를 처음부터 다시 연다 — "다시 시도" 가 올린다
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!on) return;
    // 이 회차만의 깃발. 정리 함수가 내리면 늦게 돌아온 await 는 스스로 치운다
    let dead = false;
    let open: MediaStream | null = null;
    let wake: WakeLockSentinelLike | null = null;

    /** 열어 둔 것 전부 놓기. 정리 함수와 "늦게 도착한 스트림" 이 같은 길을 지난다 */
    const release = (): void => {
      for (const t of open?.getTracks() ?? []) {
        // 잠금을 풀고 나서 끈다 (#267). 풀기가 실패해도 끄는 것은 한다
        void releaseCameraLocks(t as unknown as Parameters<typeof releaseCameraLocks>[0])
          .catch(() => {})
          .finally(() => t.stop());
      }
      open = null;
      void wake?.release().catch(() => {});
      wake = null;
    };

    (async () => {
      // 1080p: 720p 에서는 iPhone 초광각 얼굴이 작아 눈 폭 80px 을 못 채운다 (본 앱 1-2 실측)
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      // 기다리는 사이 화면이 사라졌다 → 떠도는 스트림이 되기 전에 끈다
      if (dead) { s.getTracks().forEach((t) => t.stop()); return; }
      open = s;
      const track = s.getVideoTracks()[0];
      if (track) {
        const tl = track as unknown as Parameters<typeof applyCameraLocks>[0];
        // 앞 세션·다른 화면이 남긴 잠금부터 푼다 (#267)
        await releaseCameraLocks(tl);
        if (dead) { release(); return; }
        const only = locksOf(lockMode);
        if (only.length) {
          await new Promise((r) => setTimeout(r, 1500));   // 자동이 자리 잡은 뒤 잠근다
          if (dead) { release(); return; }
          await applyCameraLocks(tl, only);
        }
        await applyUltraWideZoom(track as unknown as Parameters<typeof applyUltraWideZoom>[0]);
        if (dead) { release(); return; }
      }
      wake = await requestWakeLock(navigator.wakeLock as unknown as Parameters<typeof requestWakeLock>[0]);
      if (dead) { release(); return; }
      setStream(s);
    })().catch((e: unknown) => {
      release();
      if (dead) return;
      // 반쯤 켜진 카메라는 끄고(다른 앱이 못 쓰게 붙들지 않게) 까닭을 넘긴다 — 화면이 사람 말로 바꿔 보여 준다
      setError(e);
    });

    return () => {
      dead = true;
      release();
      // 꺼진 스트림·지난 오류를 물려주지 않는다. 다음 회차(또는 on=false)가 깨끗하게 시작한다
      setStream(null);
      setError(null);
    };
  }, [on, attempt, lockMode]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { stream, error, retry };
}
