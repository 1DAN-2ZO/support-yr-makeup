/**
 * 2-b AR 한 장면 — "화장하러 가기" 를 누른 순간 내 얼굴에 개인화 화장이 입혀진 한 장과 그때의 얼굴 점. 모듈 ⑥.
 *
 * 서버 완성본(Stable-Makeup)이 빠져서 화면 3 "부위 완성본" 이 이 장면을 쓴다 (#182, ②).
 * 사진·점은 **안 뒤집힌 카메라 좌표**다 (AR 캔버스는 CSS 로만 거울).
 * 지금은 메모리에만 — 앱을 다시 켜면 없다. ① 의 세션 저장 자리(#181 arframe)가 오면 거기로 옮긴다.
 */

import type { Pt } from "./types";

export interface ArFrame {
  lookId: string;
  image: Blob;
  lm: Pt[];
  w: number;
  h: number;
}

export interface ArFrameStore {
  /**
   * 누른 순간 자리를 먼저 잡는다 — JPEG 로 바꾸는 것(toBlob)은 늦게 끝나는데 화면 3 은 바로 열린다.
   * 전엔 다 바꾼 뒤에야 넣어서 첫 부위 완성본이 거의 항상 쌩얼로 떨어졌다 (#190 리뷰)
   */
  set(lookId: string, frame: ArFrame | Promise<ArFrame | null>): void;
  /** 지금 화장의 장면만 (저장 중이면 끝날 때까지 기다리는 Promise). 다른 화장을 골랐으면 null. 저장이 실패하면 null 로 풀린다 */
  get(lookId: string | null): Promise<ArFrame | null> | null;
  clear(): void;
}

export function createArFrameStore(): ArFrameStore {
  let cur: { lookId: string; frame: Promise<ArFrame | null> } | null = null;
  return {
    set(lookId, frame) {
      cur = { lookId, frame: Promise.resolve(frame).catch(() => null) };
    },
    get(lookId) {
      return cur && lookId && cur.lookId === lookId ? cur.frame : null;
    },
    clear() {
      cur = null;
    },
  };
}
