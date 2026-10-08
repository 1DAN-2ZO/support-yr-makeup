/**
 * 그림 만들어 보관하기 (2026-10-08, 모듈 ⑥ 백 연결) — 화면이 부르는 두 가지:
 *   makeAnswer(참고 사진) : 맨얼굴 + 참고 사진 → 정답사진 → answer 칸   (화면 3)
 *   makeMoved()          : 맨얼굴 + 시도사진 눈 뜬 장 → 옮긴 그림 → moved 칸   (화면 5 뒤 — 피드백이 계산에만 쓴다. 화면에 보여 주지 않는다)
 * 서버 부르기는 core/transfer-client, 보관은 core/made-pictures. 화면(⑤)은 결과의 ok · why 만 보고 그리면 된다.
 *
 * 같은 것을 만드는 중에 또 부르면 새로 보내지 않는다 — 버튼을 두 번 눌러도 GPU 는 한 번만 돈다.
 */

import type { MadeKey } from "./made-pictures";
import type { TransferFail, TransferResult } from "./transfer-client";

/** no_bare 맨얼굴이 없음(촬영 전) · no_attempt 시도사진이 없음 — 나머지는 서버 쪽 까닭 */
export type MakeFail = TransferFail | "no_bare" | "no_attempt";

export type MakeResult =
  | { ok: true; picture: Blob; ms: number | null }
  | { ok: false; why: MakeFail; message?: string };

export interface PictureMakerDeps {
  /** 맨얼굴 눈 뜬 장 (화면 1) — 폰에 저장해 둔 원본 크기 */
  getBare: () => Promise<Blob | null>;
  /** 시도사진 눈 뜬 장의 셔터 장 (화면 5) — 원본 크기 */
  getAttempt: () => Blob | null;
  /** 받은 그림을 칸에 넣는다 */
  put: (key: MadeKey, picture: Blob) => Promise<void>;
  request: (bare: Blob, ref: Blob) => Promise<TransferResult>;
}

export interface PictureMaker {
  makeAnswer(ref: Blob): Promise<MakeResult>;
  makeMoved(): Promise<MakeResult>;
  /** 지금 만드는 중인가 */
  busy(key: MadeKey): boolean;
}

export function createPictureMaker(deps: PictureMakerDeps): PictureMaker {
  const running: Partial<Record<MadeKey, Promise<MakeResult>>> = {};

  function once(key: MadeKey, pickRef: () => Blob | null, missing: MakeFail): Promise<MakeResult> {
    const going = running[key];
    if (going) return going;
    const p = (async (): Promise<MakeResult> => {
      const ref = pickRef();
      if (!ref) return { ok: false, why: missing };
      const bare = await deps.getBare();
      if (!bare) return { ok: false, why: "no_bare" };
      const r = await deps.request(bare, ref);
      if (r.ok) await deps.put(key, r.picture);
      return r;
    })().finally(() => { delete running[key]; });
    running[key] = p;
    return p;
  }

  return {
    makeAnswer: (ref) => once("answer", () => ref, "no_bare"),
    makeMoved: () => once("moved", deps.getAttempt, "no_attempt"),
    busy: (key) => key in running,
  };
}
