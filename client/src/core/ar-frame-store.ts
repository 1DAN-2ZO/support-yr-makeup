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
  set(f: ArFrame): void;
  /** 지금 화장의 장면만. 다른 화장을 골랐으면 null */
  get(lookId: string | null): ArFrame | null;
  clear(): void;
}

export function createArFrameStore(): ArFrameStore {
  let cur: ArFrame | null = null;
  return {
    set(f) {
      cur = f;
    },
    get(lookId) {
      return cur && lookId && cur.lookId === lookId ? cur : null;
    },
    clear() {
      cur = null;
    },
  };
}
