/**
 * 화면 6 피드백 재료 모으기 (2026-10-07, 모듈 ⑥, #332) — 화면이 아니다. 화면(⑤)은 loadFeedback 이 준 것을 그리기만 한다.
 *
 * 세션의 맨얼굴 · 화면 5 의 시도사진 묶음 · 화면 3 의 정답사진을 풀어(사진 → 픽셀) core/feedback-run 에 넣고,
 * 화면이 쓸 것 — 문장(③ WholeFeedback) · 전체 얼굴 사진 두 장의 주소 — 을 돌려준다.
 * 정답사진 · 옮긴 그림을 서버에서 받아 오는 것은 부르는 쪽(main.ts)이 넘긴다 (getAnswer · getMoved).
 */

import type { RgbaImage } from "@core/color";
import { scaleLm } from "@core/crop";
import { runFeedback, type FeedbackMissing, type FeedbackPhoto } from "@core/feedback-run";
import type { WholeFeedback } from "@core/feedback-whole";
import type { Baseline, Pt } from "@core/types";
import type { AttemptShots } from "./attempt";

/**
 * 정답사진 (화면 3 이 만든 것). **맨얼굴(화면 1 눈 뜬 장)과 같은 크기 · 같은 자리로 겹친 그림**이어야 한다 —
 * docs/feedback-input-contract.md "지킬 것". 만드는 방식은 #331 에서 정한다
 */
export interface AnswerPhoto {
  image: Blob;
}

export interface FeedbackSourceDeps {
  getBaseline: () => Baseline | null;
  getAttempt: () => AttemptShots | null;
  getAnswer: () => AnswerPhoto | null;
  /** 옮긴 그림 받아 오기 (서버). 없으면 라이너는 보지 않는다. 실패해도 나머지 부위는 판정한다 */
  getMoved?: () => Promise<Blob | null>;
  /** 사진 → 픽셀. maxSide 를 주면 긴 변을 그만큼으로 줄여서 푼다. 테스트에서 갈아 끼운다 */
  toRgba?: (src: Blob | ImageBitmap, maxSide?: number) => Promise<RgbaImage>;
  now?: () => number;
}

/** 화면 6 이 그릴 것 */
export interface FeedbackView {
  /** 전체 얼굴 사진 두 장 (객체 URL) — 다 쓰면 dispose */
  answerUrl: string;
  attemptUrl: string;
  /** 부위별 문장 · 요약 · 다시 찍기 안내(blocked) — ③ core/feedback-whole */
  feedback: WholeFeedback;
  /** 사진을 풀고 재는 데 걸린 시간 */
  ms: number;
  /** 본 시도사진 장 수 */
  frames: number;
  /** 옮긴 그림을 받지 못했거나(서버 실패) 크기가 달라 쓰지 못했다 — 라이너 줄이 "볼 수 없었어요" 인 까닭 */
  movedFailed: boolean;
  dispose: () => void;
}

export type FeedbackLoad = { ok: true; view: FeedbackView } | { ok: false; missing: FeedbackMissing };

/**
 * 피드백에 넣는 시도사진 묶음은 긴 변을 이만큼으로 줄여서 푼다 (#336 ③ 리뷰 · 결정 2026-10-07).
 * 원본(2160×3840)은 한 장이 33MB 쯤이라 다섯 장을 풀면 폰에서 느리거나 메모리가 모자랄 수 있다. 입술 · 섀도우 · 눈썹은
 * 1080×1920 으로 줄인 그림에서 확인한 것이다. 저장해 둔 사진은 원본 그대로 — 원본 크기는 서버로 보내는 한 장(옮긴 그림용)에만 쓴다.
 * 맨얼굴 · 정답사진 · 옮긴 그림은 서로 같은 크기여야 해서 줄이지 않는다
 */
export const ATTEMPT_DECODE_SIDE = 1920;

async function blobToRgba(src: Blob | ImageBitmap, maxSide = Infinity): Promise<RgbaImage> {
  const bmp = src instanceof Blob ? await createImageBitmap(src) : src;
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * k));
  c.height = Math.max(1, Math.round(bmp.height * k));
  const g = c.getContext("2d", { willReadFrequently: true });
  if (!g) throw new Error("캔버스를 열 수 없어요");
  g.drawImage(bmp, 0, 0, c.width, c.height);
  if (src instanceof Blob) bmp.close();
  const d = g.getImageData(0, 0, c.width, c.height);
  return { data: d.data, w: d.width, h: d.height };
}

/** 얼굴 점은 촬영 크기 좌표다 — 사진이 다른 크기로 저장돼 있으면 사진 크기로 맞춘다 (예전 세션의 줄인 맨얼굴, #240) */
const photoOf = (image: RgbaImage, lm: readonly Pt[], shot: { w: number; h: number }): FeedbackPhoto =>
  ({ image, lm: scaleLm(lm, shot, { w: image.w, h: image.h }) });

export async function loadFeedback(deps: FeedbackSourceDeps): Promise<FeedbackLoad> {
  const now = deps.now ?? (() => performance.now()), toRgba = deps.toRgba ?? blobToRgba;
  const base = deps.getBaseline(), tries = deps.getAttempt(), answer = deps.getAnswer();
  if (!base?.bareImage) return { ok: false, missing: "bare" };
  if (!answer) return { ok: false, missing: "answer" };
  const open = tries?.front_open ?? [];
  if (!open.length) return { ok: false, missing: "attempt" };

  const t0 = now();
  let movedFailed = false;
  const movedBlob = deps.getMoved ? await deps.getMoved().catch(() => { movedFailed = true; return null; }) : null;
  // 한 장씩 푼다 — 한꺼번에 풀면 원본 크기 여러 장이 메모리에 같이 올라간다
  const bareIm = await toRgba(base.bareImage), answerIm = await toRgba(answer.image), movedIm = movedBlob ? await toRgba(movedBlob) : null;
  const attempt: FeedbackPhoto[] = [];
  for (const s of open) attempt.push(photoOf(await toRgba(s.blob, ATTEMPT_DECODE_SIDE), s.lm, s));
  const run = runFeedback({ bare: photoOf(bareIm, base.lm, base), answer: answerIm, attempt, moved: movedIm });
  if (!run.ok) return run;

  const urls = [URL.createObjectURL(answer.image), URL.createObjectURL(open[0]!.blob)];
  return {
    ok: true,
    view: {
      answerUrl: urls[0]!, attemptUrl: urls[1]!, feedback: run.feedback,
      ms: Math.round(now() - t0), frames: open.length, movedFailed: movedFailed || run.movedDropped,
      dispose: () => { for (const u of urls) URL.revokeObjectURL(u); },
    },
  };
}
