/**
 * 그림 만들어 보관하기 (2026-10-08, 모듈 ⑥ 백 연결) — 화면이 부르는 두 가지:
 *   makeAnswer(참고 사진 | 템플릿 번호) : 맨얼굴 + 참고 사진(또는 템플릿 번호) → 정답사진 → answer 칸   (화면 3)
 *   makeMoved()          : 맨얼굴 + 시도사진 눈 뜬 장 → 옮긴 그림 → moved 칸   (화면 5 뒤 — 피드백이 계산에만 쓴다. 화면에 보여 주지 않는다)
 * 서버 부르기는 core/transfer-client, 보관은 core/made-pictures. 화면(⑤)은 결과의 ok · why 만 보고 그리면 된다.
 *
 * - 같은 사진으로 만드는 중에 또 부르면 새로 보내지 않고 같은 결과를 기다린다 — 버튼을 두 번 눌러도 GPU 는 한 번
 * - **다른 사진**으로 부르면 앞의 결과를 그 사진의 결과인 것처럼 돌려주지 않는다 — "만드는 중"(busy)으로 답한다
 * - cancel() 뒤에 도착한 그림은 칸에 넣지 않는다 — 끝내기 · 맨얼굴 다시 찍기 · 시도사진 다시 찍기 뒤에 옛 그림이 되살아나지 않게.
 *   (서버가 그리던 것까지 멈추지는 못한다. 받지 않을 뿐이다)
 */

import type { MadeKey } from "./made-pictures";
import type { TransferFail, TransferRef, TransferResult } from "./transfer-client";

/** no_bare 맨얼굴이 없음(촬영 전) · no_attempt 시도사진이 없음 · cancelled 기다리는 사이에 버려짐 — 나머지는 서버 쪽 까닭 */
export type MakeFail = TransferFail | "no_bare" | "no_attempt" | "cancelled";

export type MakeResult =
  | { ok: true; picture: Blob; ms: number | null; queueMs?: number | null; fluxMs?: number | null }
  | { ok: false; why: MakeFail; message?: string };

export interface PictureMakerDeps {
  /** 맨얼굴 눈 뜬 장 (화면 1) — 폰에 저장해 둔 원본 크기 */
  getBare: () => Promise<Blob | null>;
  /** 시도사진 눈 뜬 장의 셔터 장 (화면 5) — 원본 크기 */
  getAttempt: () => Blob | null;
  /** 받은 그림을 칸에 넣는다 */
  put: (key: MadeKey, picture: Blob) => Promise<void>;
  request: (bare: Blob, ref: TransferRef) => Promise<TransferResult>;
}

export interface PictureMaker {
  makeAnswer(ref: TransferRef): Promise<MakeResult>;
  makeMoved(): Promise<MakeResult>;
  /** 지금 만드는 중인가 */
  busy(key: MadeKey): boolean;
  /** 만드는 중인 것을 버린다 — 답이 와도 칸에 넣지 않는다. key 를 안 주면 둘 다 */
  cancel(key?: MadeKey): void;
}

const KEYS: readonly MadeKey[] = ["answer", "moved"];

/** 같은 출처인가 — 사진은 같은 Blob, 템플릿은 같은 번호 */
function sameRef(a: TransferRef, b: TransferRef): boolean {
  if (a instanceof Blob || b instanceof Blob) return a === b;
  return a.template === b.template;
}

export function createPictureMaker(deps: PictureMakerDeps): PictureMaker {
  const running: Partial<Record<MadeKey, { ref: TransferRef; p: Promise<MakeResult> }>> = {};
  /** cancel 할 때마다 오른다 — 시작할 때의 값과 달라졌으면 버려진 것이다 */
  const round: Record<MadeKey, number> = { answer: 0, moved: 0 };

  function once(key: MadeKey, ref: TransferRef | null, missing: MakeFail): Promise<MakeResult> {
    if (!ref) return Promise.resolve({ ok: false, why: missing });
    const going = running[key];
    if (going) return sameRef(going.ref, ref) ? going.p : Promise.resolve({ ok: false, why: "busy" });
    const mine = round[key];
    const p = (async (): Promise<MakeResult> => {
      const bare = await deps.getBare();
      if (!bare) return { ok: false, why: "no_bare" };
      const r = await deps.request(bare, ref);
      if (round[key] !== mine) return { ok: false, why: "cancelled" };
      if (r.ok) await deps.put(key, r.picture);
      return r;
    })().finally(() => { if (running[key]?.p === p) delete running[key]; });
    running[key] = { ref, p };
    return p;
  }

  return {
    makeAnswer: (ref) => once("answer", ref, "no_bare"),
    makeMoved: () => once("moved", deps.getAttempt(), "no_attempt"),
    busy: (key) => key in running,
    cancel(key) {
      for (const k of key ? [key] : KEYS) {
        round[k]++;
        delete running[k];
      }
    },
  };
}
