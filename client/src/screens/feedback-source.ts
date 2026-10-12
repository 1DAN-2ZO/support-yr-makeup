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
import type { HairMask } from "@core/sampling";
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
  /**
   * 머리카락 분할 (screens/hair-segmenter 의 HairMasker, #429). 주면 맨얼굴과 시도사진 장마다 머리카락 자리를 실어 넘긴다 —
   * 눈썹 꼬리는 그것이 있어야 잰다 (core/feedback-measure browTail). 안 주거나 못 만들면 전처럼 없이 넘긴다 (꼬리 문장만 빠진다)
   */
  getHair?: (im: RgbaImage) => Promise<HairMask | null>;
  /** 머리카락 분할에 쓰는 시간 한도 (기본 HAIR_BUDGET_MS) */
  hairBudgetMs?: number;
  /** 사진 → 픽셀. maxSide 를 주면 긴 변을 그만큼으로 줄여서 푼다. 테스트에서 갈아 끼운다 */
  toRgba?: (src: Blob | ImageBitmap, maxSide?: number) => Promise<RgbaImage>;
  now?: () => number;
}

/** 화면 6 이 그릴 것 */
export interface FeedbackView {
  /** 전체 얼굴 사진 두 장 (객체 URL) — 다 쓰면 dispose */
  answerUrl: string;
  attemptUrl: string;
  /** 같은 두 장의 원본 — 화면 7 이 결과 한 장을 만들 때 쓴다 (screens/feedback-card prepareSave) */
  answer: Blob;
  attempt: Blob;
  /** 부위별 문장 · 요약 · 다시 찍기 안내(blocked) — ③ core/feedback-whole */
  feedback: WholeFeedback;
  /** 사진을 풀고 재는 데 걸린 시간 */
  ms: number;
  /** 본 시도사진 장 수 */
  frames: number;
  /** 머리카락 분할을 실은 시도사진 장 수 — 0 이면 눈썹 꼬리는 재지 않았다 (맨얼굴에서 못 만들었거나 안 켬) */
  hairFrames: number;
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

export async function blobToRgba(src: Blob | ImageBitmap, maxSide = Infinity): Promise<RgbaImage> {
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

/** 머리카락 분할에 넣는 그림의 긴 변 — 모델이 어차피 512 로 줄여 본다. 원본을 통째로 넘기면 한 장에 수십 MB 를 한 번 더 복사한다 */
export const HAIR_SIDE = 512;
/** 머리카락 분할 전체(맨얼굴 1 + 시도사진 장 수)에 쓰는 시간 한도. 넘기면 남은 장은 없이 넘긴다 */
export const HAIR_BUDGET_MS = 6000;
/** 한 장에 쓰는 한도 — 모델을 받다가 멈추면 끝없이 기다리지 않게 */
const HAIR_ONE_MS = 4000;

/** 긴 변을 maxSide 로 줄인 그림 (가까운 칸을 고른다). 이미 작으면 그대로 */
export function shrinkRgba(im: RgbaImage, maxSide: number): RgbaImage {
  const k = maxSide / Math.max(im.w, im.h);
  if (k >= 1) return im;
  const w = Math.max(1, Math.round(im.w * k)), h = Math.max(1, Math.round(im.h * k)), data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(im.h - 1, Math.floor(y / k));
    for (let x = 0; x < w; x++) {
      const s = (sy * im.w + Math.min(im.w - 1, Math.floor(x / k))) * 4, d = (y * w + x) * 4;
      data[d] = im.data[s]!; data[d + 1] = im.data[s + 1]!; data[d + 2] = im.data[s + 2]!; data[d + 3] = im.data[s + 3]!;
    }
  }
  return { data, w, h };
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
  // 머리카락 분할 (#429) — 한 장씩, 시간 한도 안에서만. 못 만든 장은 없이 넘긴다
  const hairT0 = now(), budget = deps.hairBudgetMs ?? HAIR_BUDGET_MS;
  const hairOf = async (im: RgbaImage): Promise<HairMask | null> => {
    if (!deps.getHair || now() - hairT0 > budget) return null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<null>((r) => { timer = setTimeout(() => r(null), HAIR_ONE_MS); });
    try { return await Promise.race([deps.getHair(shrinkRgba(im, HAIR_SIDE)), late]); } catch { return null; } finally { clearTimeout(timer); }
  };
  // 맨얼굴에서 못 만들면 시도사진은 하지 않는다 — 늘린 양은 맨얼굴의 끝을 빼서 재는 것이라 맨얼굴이 없으면 못 잰다
  const bareHair = await hairOf(bareIm);
  const attempt: FeedbackPhoto[] = [];
  let hairFrames = 0;
  for (const s of open) {
    const im = await toRgba(s.blob, ATTEMPT_DECODE_SIDE), hair = bareHair ? await hairOf(im) : null;
    if (hair) hairFrames++;
    attempt.push({ ...photoOf(im, s.lm, s), ...(hair ? { hair } : {}) });
  }
  const bare: FeedbackPhoto = { ...photoOf(bareIm, base.lm, base), ...(bareHair && hairFrames ? { hair: bareHair } : {}) };
  const run = runFeedback({ bare, answer: answerIm, attempt, moved: movedIm });
  if (!run.ok) return run;

  const urls = [URL.createObjectURL(answer.image), URL.createObjectURL(open[0]!.blob)];
  return {
    ok: true,
    view: {
      answerUrl: urls[0]!, attemptUrl: urls[1]!, answer: answer.image, attempt: open[0]!.blob, feedback: run.feedback,
      ms: Math.round(now() - t0), frames: open.length, hairFrames, movedFailed: movedFailed || run.movedDropped,
      dispose: () => { for (const u of urls) URL.revokeObjectURL(u); },
    },
  };
}
