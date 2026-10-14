/**
 * 피드백 재료 모으기 — 본 앱 `client/src/screens/feedback-source.ts` 를 그대로 옮긴 것이다.
 * **화면이 아니다.** 화면(`screens/Feedback.tsx`)은 `loadFeedback` 이 준 것을 그리기만 한다.
 *
 * 맨얼굴(촬영) · 정답사진(서버) · 시도사진 묶음을 풀어(사진 → 픽셀) `core/feedback-run` 에 넣고,
 * 화면이 쓸 것 — 부위별 문장(`core/feedback-whole` 의 `WholeFeedback`)과 전체 얼굴 사진 두 장의
 * 주소 — 을 돌려준다.
 *
 * ── 본 앱에서 바꾼 것 (2026-10-14) ──
 *
 * 1. **자리만 바꿨다.** 본 앱의 `@core/*` 별칭이 이 레포에는 없어서 `../core/*` 로 적었고,
 *    본 앱이 `screens/` 에 둔 파일을 이 레포는 `lib/` 에 둔다 (`lib/guide-source` 와 같은 자리).
 *    시도사진 묶음(`AttemptShots`)은 이 레포에서 `screens/Attempt.tsx` 가 들고 있어서 거기서 받는다.
 *    **셈하는 알맹이(줄여서 푸는 크기 · 재는 차례 · 넘기는 모양)는 한 글자도 안 바꿨다.**
 * 2. `blobToRgba` 와 `AnswerPhoto` 는 본 앱에서도 이 파일이 들고 있다. 앞 작업이 피드백 코드가
 *    아직 없던 때라 `lib/guide-source.ts` 에 똑같이 적어 뒀는데 (그 파일 머리글 2번), 이제 이 파일이
 *    왔으니 **본 앱처럼 여기 하나만 두고** 가이드 쪽이 여기서 받아 간다.
 * 3. 아래 `createFeedbackKeeper` 는 **본 앱에 없는 것**이다. 본 앱은 화면을 그릴 때마다 한 번씩
 *    재료를 모으면 됐지만(화면이 한 번만 붙는다), React 는 개발 모드(StrictMode)에서 효과가 두 번
 *    돌고 화면을 다시 들어오면 또 돈다. 채점 한 번이 몇 초라 그때마다 다시 재면 안 된다 →
 *    부위 가이드가 쓰는 보관함(`lib/guide-source` 의 `createGuideKeeper`)과 **같은 짜임**으로 둔다.
 */

import type { RgbaImage } from "@core/color";
import { scaleLm } from "@core/crop";
import { runFeedback, type FeedbackMissing, type FeedbackPhoto } from "@core/feedback-run";
import type { WholeFeedback } from "@core/feedback-whole";
import type { HairMask } from "@core/sampling";
import type { Baseline, Pt } from "@core/types";
import type { AttemptShots } from "../screens/Attempt";

/**
 * 정답사진 (서버가 만들어 준 것). **맨얼굴(촬영한 눈 뜬 장)과 같은 크기 · 같은 자리로 겹친 그림**이어야 한다 —
 * 본 앱 `docs/feedback-input-contract.md` 의 "지킬 것"
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
   * 머리카락 분할. 주면 맨얼굴과 시도사진 장마다 머리카락 자리를 실어 넘긴다 —
   * 눈썹 꼬리는 그것이 있어야 잰다 (core/feedback-measure browTail). 안 주거나 못 만들면 전처럼 없이 넘긴다 (꼬리 문장만 빠진다)
   */
  getHair?: (im: RgbaImage) => Promise<HairMask | null>;
  /** 머리카락 분할에 쓰는 시간 한도 (기본 HAIR_BUDGET_MS) */
  hairBudgetMs?: number;
  /** 사진 → 픽셀. maxSide 를 주면 긴 변을 그만큼으로 줄여서 푼다. 테스트에서 갈아 끼운다 */
  toRgba?: (src: Blob | ImageBitmap, maxSide?: number) => Promise<RgbaImage>;
  now?: () => number;
}

/** 피드백 화면이 그릴 것 */
export interface FeedbackView {
  /** 전체 얼굴 사진 두 장 (객체 URL) — 다 쓰면 dispose */
  answerUrl: string;
  attemptUrl: string;
  /** 같은 두 장의 원본 — 저장 화면이 결과 한 장을 만들 때 쓴다 */
  answer: Blob;
  attempt: Blob;
  /** 부위별 문장 · 요약 · 다시 찍기 안내(blocked) — core/feedback-whole */
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
 * 피드백에 넣는 시도사진 묶음은 긴 변을 이만큼으로 줄여서 푼다.
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

/** 얼굴 점은 촬영 크기 좌표다 — 사진이 다른 크기로 저장돼 있으면 사진 크기로 맞춘다 (예전 세션의 줄인 맨얼굴) */
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
  // 머리카락 분할 — 한 장씩, 시간 한도 안에서만. 못 만든 장은 없이 넘긴다
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

export interface FeedbackKeeper {
  /** 지금 정답사진 · 시도사진으로 잰 것 — 같은 짝이면 재어 둔 것을 그대로 준다 */
  get(): Promise<FeedbackLoad>;
  /** 재어 둔 것을 놓는다 (붙들고 있던 사진 주소도) */
  drop(): void;
}

/**
 * 잰 것을 보관한다 — 화면을 다시 들어오거나 개발 모드에서 효과가 두 번 돌아도 **한 번만** 잰다.
 * 채점 한 번이 사진을 풀고 재는 데 몇 초라, 들어올 때마다 다시 하면 그만큼 기다리게 된다.
 *
 * 같은 것인지는 **정답사진 Blob 과 시도사진 묶음이 그대로인지**로 가린다 (부위 가이드 보관함이
 * 정답사진 Blob 하나로 가리는 것과 같은 방식 — 담는 그릇은 새로 만들어도 된다).
 * 둘 중 하나라도 달라지면(다시 찍기 · 다른 화장 고르기) 앞의 것을 놓는다. 못 잰 것은 보관하지 않는다 —
 * 아직 안 찍은 탓에 못 잰 것이면 찍고 돌아왔을 때 다시 재야 한다
 */
export function createFeedbackKeeper(deps: FeedbackSourceDeps, load: (d: FeedbackSourceDeps) => Promise<FeedbackLoad> = loadFeedback): FeedbackKeeper {
  type Held = { answer: Blob | null; attempt: AttemptShots | null; p: Promise<FeedbackLoad> };
  let held: Held | null = null;
  const drop = (): void => {
    const old = held;
    held = null;
    void old?.p.then((r) => { if (r.ok) r.view.dispose(); }).catch(() => {});
  };
  return {
    get() {
      const answer = deps.getAnswer()?.image ?? null, attempt = deps.getAttempt();
      if (held && (held.answer !== answer || held.attempt !== attempt)) drop();
      if (!held) {
        const p = load(deps);
        const mine: Held = { answer, attempt, p };
        held = mine;
        // 못 잰 것은 들고 있지 않는다 — 다음에 들어올 때 다시 해 본다
        void p.then((r) => { if (held === mine && !r.ok) held = null; }).catch(() => { if (held === mine) held = null; });
      }
      return held.p;
    },
    drop,
  };
}
