/**
 * 화면 7 저장 · 공유 잇기 (2026-10-07, 모듈 ⑥) — 화면이 아니다. 화면(⑤)은 prepareSave 가 준 것의 save() 를 버튼에 걸기만 한다.
 *
 * 결과 한 장 = 정답사진 · 내 화장(시도사진) 두 장 + 요약 + 부위별 문장(③ WholeFeedback). 점수 · 숫자는 없다.
 * 내 폰에만 내보낸다 — 공유 창(navigator.share) 또는 내려받기. 우리 서버로는 보내지 않는다.
 *
 * 옛 결과 카드(result-card.ts)와 같은 방식: 배치는 순수 함수(feedbackCardLayout), 그리기는 따로(drawFeedbackCard) —
 * 캔버스 없이도 배치를 시험한다. 내보내는 길(saveCard · ShareEnv)은 그쪽 것을 그대로 쓴다.
 * **카드는 미리 만든다.** iOS 는 사용자가 누른 그 순간에만 공유 창을 열어 줘서, 누른 뒤에 그리면 늦는다.
 */

import type { FeedbackTone, WholeFeedback } from "@core/feedback-whole";
import { anchorDownload, fitText, saveCard, type SaveOutcome, type ShareEnv } from "./result-card";

export const FEEDBACK_CARD_W = 1080;

/** 카드에 들어가는 글 (화면 문구는 화면이 정한다 — 이것은 저장되는 그림 안의 글) */
export const CARD_TEXT = {
  brand: "nudy",
  answer: "예상 메이크업",
  attempt: "내 화장",
  okHead: "비슷한 곳",
  fixHead: "다시 볼 곳",
  fixMark: "→",
} as const;

/** 저장 결과를 사용자에게 말할 때 쓰는 문장 — 화면이 가져다 쓴다 */
export const SAVE_TEXT: Record<SaveOutcome, string> = {
  shared: "공유 창에서 저장을 눌러 주세요",
  downloaded: "받은 파일에 저장했어요",
  cancelled: "저장을 취소했어요",
  unavailable: "이 브라우저에서는 저장할 수 없어요. 화면을 캡처해 주세요",
};
/** 공유 창을 쓰는 기기(특히 iPhone)에서 누르기 전에 보여 줄 한 줄 — 거기서 "이미지 저장" 을 눌러야 사진에 들어간다 */
export const SHARE_HINT = "공유 창이 뜨면 '이미지 저장'을 눌러 주세요";

export type FeedbackCardOp =
  | { op: "bg"; color: string; h: number }
  | { op: "text"; text: string; x: number; y: number; size: number; color: string; align: "left" | "center" | "right"; bold?: boolean; maxW?: number }
  | { op: "image"; which: "answer" | "attempt"; x: number; y: number; w: number; h: number }
  | { op: "line"; x: number; y: number; w: number; color: string };

const INK = "#2b2b2b", MUTED = "#6b6b6b", ACCENT = "#2a8c85", WARM = "#c4741f", LINE = "#e6e2da", BG = "#f7f5f1";
const PAD = 64, GAP = 24, NAME_W = 190;
const TONE: Record<FeedbackTone, string> = { ok: ACCENT, fix: INK, info: MUTED };

/**
 * 글자 수로 줄을 나눈다. 한글은 한 글자 폭이 글자 크기와 거의 같아서 "폭 ÷ 글자 크기" 글자면 넘치지 않는다 (빈칸 · 영문은 더 좁아 남는다).
 * 빈칸에서 끊고, 빈칸 없이 긴 말은 글자 수에서 끊는다. 그릴 때 한 번 더 폭을 재서 넘치면 말줄임한다 (fitText)
 */
export function wrapText(text: string, maxChars: number): string[] {
  const n = Math.max(1, Math.floor(maxChars)), out: string[] = [];
  let cur = "";
  const push = (): void => { if (cur) out.push(cur); cur = ""; };
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let w = word;
    if ([...(cur ? `${cur} ${w}` : w)].length <= n) { cur = cur ? `${cur} ${w}` : w; continue; }
    push();
    while ([...w].length > n) { out.push([...w].slice(0, n).join("")); w = [...w].slice(n).join(""); }
    cur = w;
  }
  push();
  return out.length ? out : [""];
}

/** 그릴 것들과 카드 높이. 폭은 FEEDBACK_CARD_W 고정, 높이는 줄 수만큼 늘어난다 */
export function feedbackCardLayout(feedback: WholeFeedback): { ops: FeedbackCardOp[]; height: number } {
  const ops: FeedbackCardOp[] = [];
  const text = (t: string, x: number, y: number, size: number, color: string, extra: Partial<Extract<FeedbackCardOp, { op: "text" }>> = {}): void => {
    ops.push({ op: "text", text: t, x, y, size, color, align: "left", ...extra });
  };
  text(CARD_TEXT.brand, PAD, 96, 44, ACCENT, { bold: true });

  // 사진 두 장 — 전체 얼굴, 같은 크기 (세로 3:4 로 가운데를 잘라 넣는다)
  const pw = (FEEDBACK_CARD_W - PAD * 2 - GAP) / 2, ph = Math.round((pw * 4) / 3), py = 140;
  for (const [i, which] of (["answer", "attempt"] as const).entries()) {
    const x = PAD + i * (pw + GAP);
    ops.push({ op: "image", which, x, y: py, w: pw, h: ph });
    text(CARD_TEXT[which], x + pw / 2, py + ph + 44, 30, MUTED, { align: "center" });
  }
  let y = py + ph + 110;

  // 요약 — 부위 이름만. 비어 있으면 줄을 만들지 않는다
  const bodyX = PAD + NAME_W, bodyW = FEEDBACK_CARD_W - PAD - bodyX;
  for (const [head, names, color] of [[CARD_TEXT.okHead, feedback.ok, ACCENT], [CARD_TEXT.fixHead, feedback.fix, WARM]] as const) {
    if (!names.length) continue;
    text(head, PAD, y, 30, color, { bold: true });
    for (const l of wrapText(names.join(" · "), bodyW / 30)) { text(l, bodyX, y, 30, INK, { maxW: bodyW }); y += 42; }
    y += 8;
  }
  ops.push({ op: "line", x: PAD, y: y - 10, w: FEEDBACK_CARD_W - PAD * 2, color: LINE });
  y += 44;

  // 부위별 — 이름 · 문장 · (덧붙임) · (→ 고치는 방법). 받은 순서 그대로
  for (const p of feedback.parts) {
    text(p.name, PAD, y, 34, INK, { bold: true });
    for (const l of wrapText(p.line, bodyW / 34)) { text(l, bodyX, y, 34, TONE[p.tone], { maxW: bodyW }); y += 48; }
    if (p.more) for (const l of wrapText(p.more, bodyW / 30)) { text(l, bodyX, y, 30, MUTED, { maxW: bodyW }); y += 42; }
    if (p.fix) for (const [i, l] of wrapText(`${CARD_TEXT.fixMark} ${p.fix}`, bodyW / 30).entries()) { text(l, bodyX + (i ? 34 : 0), y, 30, WARM, { maxW: bodyW - (i ? 34 : 0) }); y += 42; }
    y += 26;
  }
  const height = Math.round(y + 30);
  ops.unshift({ op: "bg", color: BG, h: height });
  return { ops, height };
}

export interface FeedbackCardImages {
  answer: CanvasImageSource & { width: number; height: number };
  attempt: CanvasImageSource & { width: number; height: number };
}

/** 목록을 캔버스에 옮긴다. 사진은 칸을 꽉 채우게 가운데를 잘라 넣는다 (늘리지 않는다) */
export function drawFeedbackCard(ctx: CanvasRenderingContext2D, ops: readonly FeedbackCardOp[], images: FeedbackCardImages): void {
  for (const o of ops) {
    if (o.op === "bg") { ctx.fillStyle = o.color; ctx.fillRect(0, 0, FEEDBACK_CARD_W, o.h); }
    else if (o.op === "line") { ctx.fillStyle = o.color; ctx.fillRect(o.x, o.y, o.w, 2); }
    else if (o.op === "image") {
      const img = images[o.which], k = Math.max(o.w / img.width, o.h / img.height), sw = o.w / k, sh = o.h / k;
      ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, o.x, o.y, o.w, o.h);
    } else {
      ctx.fillStyle = o.color;
      ctx.font = `${o.bold ? "600 " : ""}${o.size}px system-ui, sans-serif`;
      ctx.textAlign = o.align;
      ctx.fillText(o.maxW ? fitText((t) => ctx.measureText(t).width, o.text, o.maxW) : o.text, o.x, o.y);
    }
  }
}

/** 결과 한 장에 필요한 것 — 문장과 사진 두 장 (screens/feedback-source 의 FeedbackView 가 그대로 맞는다) */
export interface SaveSource {
  feedback: WholeFeedback;
  answer: Blob;
  attempt: Blob;
}

/** 카드 한 장(JPEG). 캔버스를 못 쓰는 환경이면 null */
export async function renderFeedbackCard(src: SaveSource): Promise<Blob | null> {
  const { ops, height } = feedbackCardLayout(src.feedback);
  const canvas = document.createElement("canvas");
  canvas.width = FEEDBACK_CARD_W;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx || typeof canvas.toBlob !== "function") return null;
  // 글꼴이 다 불러와진 뒤에 그린다 — 안 그러면 기본 글꼴 폭으로 재서 말줄임이 어긋난다 (#79)
  await (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready.catch(() => {});
  const [answer, attempt] = await Promise.all([createImageBitmap(src.answer), createImageBitmap(src.attempt)]);
  try {
    drawFeedbackCard(ctx, ops, { answer, attempt });
  } finally {
    answer.close();
    attempt.close();
  }
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92));
}

function browserShareEnv(): ShareEnv {
  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean; share?: (d: unknown) => Promise<void> };
  const env: ShareEnv = { download: anchorDownload };
  if (typeof nav.canShare === "function") env.canShare = (d) => nav.canShare!(d);
  if (typeof nav.share === "function") env.share = (d) => nav.share!(d);
  return env;
}

/** 화면 7 이 쓰는 것 */
export interface SaveKit {
  /** 미리 만든 카드. 못 만들었으면 null (save 는 "unavailable" 을 준다) */
  card: Blob | null;
  /** 공유 창을 쓰는 기기인가 — 맞으면 누르기 전에 SHARE_HINT 를 보여 준다 */
  usesShareSheet: boolean;
  /** 저장 버튼에 건다. **버튼을 누른 그 자리에서 바로 부른다** (await 뒤에 부르면 iOS 가 공유 창을 안 연다). 결과는 SAVE_TEXT 로 말한다 */
  save: () => Promise<SaveOutcome>;
}

export interface PrepareSaveOptions {
  env?: ShareEnv;
  makeCard?: (src: SaveSource) => Promise<Blob | null>;
  name?: string;
}

/**
 * 화면 7 에 들어올 때 부른다 — 카드를 미리 만들어 둔다. 저장할 판정이 없으면 null
 * (피드백을 안 거쳤거나, "다시 찍어 주세요" 로 끝나 부위별 문장이 없을 때)
 */
export async function prepareSave(src: SaveSource | null, opt: PrepareSaveOptions = {}): Promise<SaveKit | null> {
  if (!src || src.feedback.blocked || !src.feedback.parts.length) return null;
  const env = opt.env ?? browserShareEnv(), name = opt.name ?? "nudy.jpg";
  const card = await (opt.makeCard ?? renderFeedbackCard)(src).catch(() => null);
  const file = card ? new File([card], name, { type: card.type || "image/jpeg" }) : null;
  return {
    card,
    usesShareSheet: !!(env.share && file && env.canShare?.({ files: [file] })),
    save: () => saveCard(card, name, env),
  };
}
