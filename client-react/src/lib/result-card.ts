/**
 * 결과 카드 — 합산·막대·사진 두 장을 이미지 한 장으로 (F-11). 모듈 ⑥.
 *
 * **레이아웃은 순수 함수다.** `cardLayout()` 이 그릴 것들의 목록을 만들고,
 * `drawCard()` 가 그걸 캔버스에 옮긴다. 그래서 캔버스 없이도 배치를 시험할 수 있다
 * (jsdom 에는 2d 컨텍스트가 없다).
 *
 * **카드는 화면에 들어올 때 미리 만든다.** iOS 는 사용자 제스처 안에서만 공유 시트를
 * 열어 주는데, 누른 다음에 캔버스를 그리면 그 사이에 제스처가 끝나 버린다.
 */

import { PART_NAME } from "@core/score";
import type { PartId, PartResult, SessionSummary } from "@core/types";

export const CARD_W = 1080;
export const CARD_H = 1350;

export interface CardInput {
  summary: SessionSummary;
  parts: readonly PartResult[];
  lookName: string;
  /** 왼쪽 맨얼굴, 오른쪽 화장 후. 없으면 자리만 비워 둔다 */
  bare: CanvasImageSource | null;
  after: CanvasImageSource | null;
  /** 구석에 찍는 버전 (versionStamp()) */
  stamp: string;
  /** 조명이 달라 색을 못 믿을 때 한 줄 */
  lightingNote: string | null;
}

export type CardOp =
  | { op: "bg"; color: string }
  | { op: "text"; text: string; x: number; y: number; size: number; color: string; align: "left" | "center" | "right"; bold?: boolean; maxW?: number }
  | { op: "bar"; x: number; y: number; w: number; h: number; ratio: number; color: string; track: string }
  | { op: "image"; which: "bare" | "after"; x: number; y: number; w: number; h: number }
  | { op: "box"; x: number; y: number; w: number; h: number; color: string };

const INK = "#2b2b2b";
const MUTED = "#6b6b6b";
const ACCENT = "#2a8c85";
const LINE = "#e6e2da";
const BG = "#f7f5f1";

const PAD = 64;
const PHOTO_H = 420;
const ROW_H = 74;

/** 부위 줄 오른쪽에 적는 값. 점수가 없으면 말로 */
export function partValueText(p: PartResult): string {
  if (p.status === "passed" && typeof p.score === "number") return String(Math.round(p.score));
  if (p.status === "check_only") return "확인만";
  if (p.status === "skipped") return "건너뜀";
  return "-";
}

/** 막대 길이 비율. 점수가 없는 줄은 0 (트랙만 보인다) */
export function barRatio(p: PartResult): number {
  if (p.status !== "passed" || typeof p.score !== "number") return 0;
  return Math.max(0, Math.min(1, p.score / 100));
}

/**
 * 카드에 그릴 것들. 위에서 아래로 — 제목 · 합산 · 사진 두 장 · 부위 막대 · 버전.
 * 좌표는 1080×1350 고정이다. 글자가 넘치면 자르는 건 그리는 쪽에서 한다.
 */
export function cardLayout(input: CardInput): CardOp[] {
  const ops: CardOp[] = [];
  const mid = CARD_W / 2;
  ops.push({ op: "bg", color: BG });

  // 제목
  ops.push({ op: "text", text: "nudy", x: PAD, y: 92, size: 40, color: MUTED, align: "left" });
  // 화장 이름은 길 수 있다 — 왼쪽 "nudy" 자리를 빼고 남는 폭 안에서 말줄임 (#79)
  ops.push({ op: "text", text: input.lookName, x: CARD_W - PAD, y: 92, size: 40, color: ACCENT, align: "right", bold: true, maxW: CARD_W - PAD * 2 - 160 });

  // 합산 — 숫자만 크게. 기준 표기도 보정 표시도 없다 (F-10)
  const total = input.summary.total;
  ops.push({
    op: "text",
    text: total == null ? "—" : String(total),
    x: mid,
    y: 250,
    size: 150,
    color: INK,
    align: "center",
    bold: true,
  });
  if (total == null) {
    ops.push({
      op: "text",
      text: "잰 부위가 없어요",
      x: mid,
      y: 310,
      size: 32,
      color: MUTED,
      align: "center",
    });
  }

  // 사진 두 장 — 같은 크기, 같은 자리
  const photoW = (CARD_W - PAD * 2 - 24) / 2;
  const photoY = 360;
  for (const [i, which] of (["bare", "after"] as const).entries()) {
    const x = PAD + i * (photoW + 24);
    const has = which === "bare" ? input.bare : input.after;
    if (has) ops.push({ op: "image", which, x, y: photoY, w: photoW, h: PHOTO_H });
    else ops.push({ op: "box", x, y: photoY, w: photoW, h: PHOTO_H, color: LINE });
    ops.push({
      op: "text",
      text: which === "bare" ? "맨얼굴" : "지금",
      x: x + photoW / 2,
      y: photoY + PHOTO_H + 42,
      size: 30,
      color: MUTED,
      align: "center",
    });
  }

  let y = photoY + PHOTO_H + 100;

  if (input.lightingNote) {
    ops.push({ op: "text", text: input.lightingNote, x: PAD, y, size: 28, color: MUTED, align: "left", maxW: CARD_W - PAD * 2 });
    y += 46;
  }

  // 부위 막대
  const barX = PAD + 250;
  const barW = CARD_W - PAD - 130 - barX;
  for (const p of input.parts) {
    ops.push({ op: "text", text: PART_NAME[p.partId as PartId], x: PAD, y: y + 30, size: 32, color: INK, align: "left" });
    ops.push({ op: "bar", x: barX, y: y + 12, w: barW, h: 24, ratio: barRatio(p), color: ACCENT, track: LINE });
    ops.push({ op: "text", text: partValueText(p), x: CARD_W - PAD, y: y + 30, size: 32, color: MUTED, align: "right" });
    y += ROW_H;
  }

  // 버전 — 구석에 작게. 어떤 규칙으로 낸 점수인지 나중에 따져 볼 수 있어야 한다
  ops.push({ op: "text", text: input.stamp, x: CARD_W - PAD, y: CARD_H - 40, size: 22, color: MUTED, align: "right" });
  return ops;
}

/**
 * 폭에 맞춰 말줄임 (#79). 글자 수로 자르면 기기마다 글꼴 폭이 달라 넘치거나 남는다 — 실제 폭(measure)으로 잰다.
 * 들어가면 그대로, 넘치면 "…" 을 붙여 들어가는 만큼, "…" 도 안 들어가면 빈 글자
 */
export function fitText(measure: (t: string) => number, text: string, maxW: number): string {
  if (measure(text) <= maxW) return text;
  const chars = [...text];
  for (let n = chars.length - 1; n > 0; n--) {
    const t = chars.slice(0, n).join("").trimEnd() + "…";
    if (measure(t) <= maxW) return t;
  }
  return measure("…") <= maxW ? "…" : "";
}

/** 목록을 캔버스에 옮긴다. 여기엔 배치 판단이 없다 */
export function drawCard(ctx: CanvasRenderingContext2D, ops: readonly CardOp[], input: CardInput): void {
  for (const o of ops) {
    switch (o.op) {
      case "bg":
        ctx.fillStyle = o.color;
        ctx.fillRect(0, 0, CARD_W, CARD_H);
        break;
      case "box":
        ctx.fillStyle = o.color;
        ctx.fillRect(o.x, o.y, o.w, o.h);
        break;
      case "image": {
        const img = o.which === "bare" ? input.bare : input.after;
        if (img) ctx.drawImage(img, o.x, o.y, o.w, o.h);
        break;
      }
      case "bar":
        ctx.fillStyle = o.track;
        ctx.fillRect(o.x, o.y, o.w, o.h);
        ctx.fillStyle = o.color;
        ctx.fillRect(o.x, o.y, o.w * o.ratio, o.h);
        break;
      case "text":
        ctx.fillStyle = o.color;
        ctx.font = `${o.bold ? "600 " : ""}${o.size}px system-ui, sans-serif`;
        ctx.textAlign = o.align;
        ctx.fillText(o.maxW ? fitText((t) => ctx.measureText(t).width, o.text, o.maxW) : o.text, o.x, o.y);
        break;
    }
  }
}

/**
 * 카드를 내보낸다. **갤러리에 자동으로 넣을 수는 없다** — 브라우저가 안 준다.
 *
 * 1순위 공유 시트(`navigator.share`) — iOS 에서는 여기서 사용자가 "이미지 저장"을 눌러야
 * 사진 앱에 들어간다. 2순위 내려받기. 둘 다 안 되면 그렇다고 말한다.
 *
 * 환경을 주입받는 이유: 브라우저마다 다르게 동작하는 부분이라 시험으로 고정해 둬야 한다.
 */
export interface ShareEnv {
  canShare?: (data: { files: File[] }) => boolean;
  share?: (data: { files: File[]; title?: string }) => Promise<void>;
  download: (blob: Blob, name: string) => void;
}

export type SaveOutcome = "shared" | "downloaded" | "cancelled" | "unavailable";

export async function saveCard(blob: Blob | null, name: string, env: ShareEnv): Promise<SaveOutcome> {
  if (!blob) return "unavailable";
  const file = new File([blob], name, { type: blob.type || "image/jpeg" });
  if (env.share && env.canShare?.({ files: [file] })) {
    try {
      await env.share({ files: [file], title: "nudy 결과" });
      return "shared";
    } catch (e) {
      // 사용자가 공유 시트를 닫은 것은 실패가 아니다 — 내려받기로 넘기지 않는다
      if (e instanceof Error && e.name === "AbortError") return "cancelled";
    }
  }
  try {
    env.download(blob, name);
    return "downloaded";
  } catch {
    return "unavailable";
  }
}

/** 기본 내려받기 — a[download] 한 번 누르기 */
export function anchorDownload(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** 카드 한 장. 캔버스가 없는 환경(시험)에서는 null */
export async function renderCard(input: CardInput): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // 글꼴이 다 불러와진 뒤에 그린다 — 안 그러면 기본 글꼴 폭으로 재고 그려 줄바꿈·말줄임이 어긋난다 (#79)
  await (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready.catch(() => {});
  drawCard(ctx, cardLayout(input), input);
  return new Promise((resolve) => {
    if (typeof canvas.toBlob !== "function") return resolve(null);
    canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92);
  });
}
