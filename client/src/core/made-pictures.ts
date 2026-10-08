/**
 * 만든 그림 보관 (2026-10-08, 모듈 ⑥) — 서버가 만들어 준 그림 두 장을 폰 세션 저장소에 둔다 (#331 ② 제안).
 *   answer = 정답사진 (화면 3: 맨얼굴 + 참고 사진) · moved = 옮긴 그림 (화면 5 뒤: 맨얼굴 + 시도사진 눈 뜬 장)
 * 둘 다 맨얼굴(화면 1 눈 뜬 장)과 같은 크기 · 같은 자리로 겹치는 그림이다 (docs/feedback-input-contract.md).
 *
 * 바로 읽을 수 있게 메모리에도 들고, 앱을 다시 켜도 남게 저장소(① core/session-store 의 사진 칸)에도 쓴다.
 * 저장이 실패해도(저장공간 · 사생활 보호 모드) 이번 세션에서는 메모리 것으로 쓴다.
 * 짝이 깨지면 버린다: 정답사진이 바뀌면 옮긴 그림을, 맨얼굴을 다시 찍으면 둘 다.
 * 끝내기(clearAll)는 저장소가 통째로 지운다. 우리 서버에는 남기지 않는다
 */

import type { SessionStore } from "./session-store";

export type MadeKey = "answer" | "moved";
const KEYS: readonly MadeKey[] = ["answer", "moved"];

export interface MadePictures {
  get(key: MadeKey): Blob | null;
  /** 넣기 (null 이면 지우기). 정답사진을 바꾸면 옮긴 그림도 같이 지운다 */
  set(key: MadeKey, picture: Blob | null): Promise<void>;
  /** 앱을 켤 때 — 저장소에 남아 있던 것을 되살린다 */
  restore(): Promise<void>;
  /** 맨얼굴이 바뀌었을 때 — 둘 다 버린다 */
  clear(): Promise<void>;
}

export function createMadePictures(store: Pick<SessionStore, "saveImage" | "loadImage" | "deleteImage">): MadePictures {
  const held: Record<MadeKey, Blob | null> = { answer: null, moved: null };

  async function put(key: MadeKey, picture: Blob | null): Promise<void> {
    held[key] = picture;
    try {
      if (picture) await store.saveImage(key, picture);
      else await store.deleteImage(key);
    } catch { /* 저장이 막혀도 이번 세션은 메모리 것으로 */ }
  }

  return {
    get: (key) => held[key],
    async set(key, picture) {
      await put(key, picture);
      if (key === "answer") await put("moved", null);
    },
    async restore() {
      for (const key of KEYS) {
        const v = await store.loadImage(key).catch(() => null);
        held[key] = v instanceof Blob ? v : v ? new Blob([v]) : null;
      }
    },
    async clear() {
      for (const key of KEYS) await put(key, null);
    },
  };
}
