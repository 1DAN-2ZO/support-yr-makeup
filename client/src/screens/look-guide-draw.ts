/**
 * 룩 옮기기 (실험) — 부위 가이드(core/look-guide.ts)를 눈으로 보이게 그린다.
 *
 * 부위마다 선 색을 달리하고(무슨 부위인지 한눈에), 흰 테를 둘러 어떤 피부 · 화장 색 위에서도 보이게 한다.
 *   테두리(점선)   바를 자리의 바깥 경계
 *   진한 자리(실선) 색을 가장 많이 올릴 안쪽
 *   선(굵은 실선)   아이라이너
 *   화살표         꼬리가 뻗는 방향 · 블러셔를 쓸어 주는 방향
 *   재는 선        높이 · 두께 (눈 폭 대비 %)
 *   번호 점        짚어 줄 자리 — 옆 목록의 번호와 같다
 * 맨얼굴 위에서 볼 때는 바를 자리를 그 화장 색으로 칠해서 "여기에 이 색" 이 보이게 한다.
 */

import type { GuidePartId, LookGuide, PartGuide } from "@core/look-guide";
import type { Pt } from "@core/types";

export const PART_STYLE: Record<GuidePartId, { name: string; line: string }> = {
  brow: { name: "눈썹", line: "#FFB000" },
  shadow: { name: "섀도우", line: "#19C7B5" },
  liner: { name: "아이라인 (눈머리 ~ 눈꼬리)", line: "#FF3D71" },
  wing: { name: "아이라인 꼬리", line: "#7CFF4F" },
  cheek: { name: "블러셔", line: "#B56BFF" },
  lip: { name: "입술", line: "#3DA5FF" },
};
/** 그리는 순서 = 화장하는 순서에 가깝게, 넓은 것부터 (좁은 선이 위에 오게) */
export const DRAW_ORDER: readonly GuidePartId[] = ["cheek", "shadow", "brow", "lip", "liner", "wing"];
/** 카드 · 범례에 늘어놓는 순서 */
export const CARD_ORDER: readonly GuidePartId[] = ["brow", "shadow", "liner", "wing", "cheek", "lip"];

export interface DrawOpt {
  /** 사진 좌표 → 캔버스 좌표 */
  at: (p: Pt) => Pt;
  /** 바를 자리를 그 화장 색으로 칠할지 (맨얼굴 위에서 볼 때) */
  tint: boolean;
  /** 점 이름 · 재는 선의 숫자 · 화살표 말을 쓸지 (작은 그림에서는 끈다) */
  labels: boolean;
  /** 얼굴 가운데 x (캔버스 좌표) — 글씨를 얼굴 바깥쪽으로 쓰려고 */
  midX: number;
  /** 모양만 그리고 점 · 글씨는 안 붙일 부위 (다른 부위의 카드에 곁들여 그릴 때) */
  quiet?: readonly GuidePartId[];
}
export interface Numbered {
  n: number;
  part: GuidePartId;
  label: string;
}

const rgb = (c: readonly number[], a: number): string => `rgba(${c.map((v) => Math.round(v)).join(",")},${a})`;

function trace(g: CanvasRenderingContext2D, pts: readonly Pt[], close: boolean): void {
  g.beginPath();
  pts.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)));
  if (close) g.closePath();
}
/** 흰 테 + 색 선 — 어떤 바탕에서도 보이게 */
function strokeHalo(g: CanvasRenderingContext2D, color: string, width: number, dash: number[] = []): void {
  g.lineJoin = "round";
  g.lineCap = "round";
  g.setLineDash([]);
  g.lineWidth = width + 2.5;
  g.strokeStyle = "rgba(255,255,255,0.85)";
  g.stroke();
  g.setLineDash(dash);
  g.lineWidth = width;
  g.strokeStyle = color;
  g.stroke();
  g.setLineDash([]);
}
/** 어두운 알약 바탕 위의 흰 글씨. align: 글씨가 (x, y) 의 어느 쪽에 놓이나 */
function pill(g: CanvasRenderingContext2D, text: string, x: number, y: number, align: "left" | "right" | "center", accent?: string): void {
  g.font = "600 12px system-ui, 'Malgun Gothic', sans-serif";
  const w = g.measureText(text).width + 10, h = 18;
  // 그림 밖으로 나가 잘리지 않게 안으로 민다
  const x0 = Math.max(3, Math.min(g.canvas.width - w - 3, align === "left" ? x : align === "right" ? x - w : x - w / 2));
  y = Math.max(h / 2 + 3, Math.min(g.canvas.height - h / 2 - 3, y));
  g.beginPath();
  g.roundRect(x0, y - h / 2, w, h, 5);
  g.fillStyle = "rgba(20,20,24,0.78)";
  g.fill();
  if (accent) {
    g.fillStyle = accent;
    g.fillRect(x0, y - h / 2 + 3, 2.5, h - 6);
  }
  g.fillStyle = "#fff";
  g.textAlign = "left";
  g.textBaseline = "middle";
  g.fillText(text, x0 + 5, y + 0.5);
}

/** 고른 부위들을 그린다. 번호를 매긴 점의 목록을 돌려준다 (옆에 같은 번호로 풀어 쓰라고) */
export function drawGuideParts(g: CanvasRenderingContext2D, guide: LookGuide, parts: readonly GuidePartId[], o: DrawOpt): Numbered[] {
  const numbered: Numbered[] = [];
  const order = DRAW_ORDER.filter((p) => parts.includes(p));
  /** 그림 안에 있는 자리인가 — 잘라 낸 그림 밖의 점 이름이 가장자리에 끌려와 찍히지 않게 */
  const inView = (q: Pt): boolean => q.x >= 0 && q.y >= 0 && q.x <= g.canvas.width && q.y <= g.canvas.height;
  // ① 넓은 것부터: 칠 → 테두리 → 진한 자리
  for (const p of order) {
    const part: PartGuide = guide[p], color = PART_STYLE[p].line;
    const polys = part.outline.polys.map((poly) => poly.map(o.at)), zones = part.zones.map((z) => z.poly.map(o.at));
    if (o.tint && part.color) {
      g.fillStyle = rgb(part.color, 0.6);
      for (const poly of polys) {
        trace(g, poly, true);
        g.fill();
      }
      // 진한 자리는 한 번 더 칠해 더 짙게
      g.fillStyle = rgb(part.color, 0.55);
      for (const z of zones) {
        trace(g, z, true);
        g.fill();
      }
    }
    for (const poly of polys) {
      trace(g, poly, true);
      strokeHalo(g, color, 2.2, [7, 5]);
    }
    for (const z of zones) {
      trace(g, z, true);
      strokeHalo(g, color, 1.4);
    }
  }
  // ② 선 · 화살표 · 재는 선
  for (const p of order) {
    const part = guide[p], color = PART_STYLE[p].line;
    for (const line of part.outline.lines) {
      const pts = line.map(o.at);
      if (o.tint && part.color) {
        // 맨얼굴 위에서는 라이너를 그 색 그대로 먼저 긋는다
        trace(g, pts, false);
        g.lineCap = "round";
        g.lineJoin = "round";
        g.lineWidth = 4.5;
        g.strokeStyle = rgb(part.color, 0.95);
        g.stroke();
        trace(g, pts, false);
        g.lineWidth = 1.4;
        g.strokeStyle = color;
        g.stroke();
      } else {
        trace(g, pts, false);
        strokeHalo(g, color, 2.6);
      }
    }
    for (const a of part.arrows) {
      const from = o.at(a.from), to = o.at(a.to), len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
      const ux = (to.x - from.x) / len, uy = (to.y - from.y) / len, head = Math.min(11, Math.max(7, len * 0.3));
      trace(g, [from, to], false);
      strokeHalo(g, color, 2.2);
      trace(g, [to, { x: to.x - ux * head - uy * head * 0.55, y: to.y - uy * head + ux * head * 0.55 }, { x: to.x - ux * head + uy * head * 0.55, y: to.y - uy * head - ux * head * 0.55 }], true);
      g.fillStyle = color;
      g.fill();
      g.lineWidth = 1.2;
      g.strokeStyle = "rgba(255,255,255,0.9)";
      g.stroke();
    }
    for (const m of part.measures) {
      const from = o.at(m.from), to = o.at(m.to), len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
      const nx = (-(to.y - from.y) / len) * 5, ny = ((to.x - from.x) / len) * 5;
      for (const [w, c] of [[3.2, "rgba(20,20,24,0.7)"], [1.4, "#fff"]] as const) {
        g.beginPath();
        g.moveTo(from.x, from.y);
        g.lineTo(to.x, to.y);
        g.moveTo(from.x - nx, from.y - ny);
        g.lineTo(from.x + nx, from.y + ny);
        g.moveTo(to.x - nx, to.y - ny);
        g.lineTo(to.x + nx, to.y + ny);
        g.setLineDash([]);
        g.lineWidth = w;
        g.strokeStyle = c;
        g.stroke();
      }
    }
  }
  // ③ 글씨: 재는 선의 숫자, 화살표 말, 진한 자리 말
  if (o.labels) {
    for (const p of order) {
      if (o.quiet?.includes(p)) continue;
      const part = guide[p], color = PART_STYLE[p].line;
      for (const m of part.measures) {
        const a = o.at(m.from), b = o.at(m.to), mx = (a.x + b.x) / 2, out = mx < o.midX ? -1 : 1;
        if (!inView({ x: mx, y: (a.y + b.y) / 2 })) continue;
        pill(g, m.label, mx - out * 8, (a.y + b.y) / 2, out < 0 ? "left" : "right", color);
      }
      for (const a of part.arrows) {
        const to = o.at(a.to), from = o.at(a.from), out = to.x >= from.x ? 1 : -1;
        if (!inView(to)) continue;
        pill(g, a.label, to.x + out * 14, to.y - 22, out > 0 ? "left" : "right", color);
      }
    }
  }
  // ④ 번호 점 — 맨 위에
  for (const p of order) {
    if (o.quiet?.includes(p)) continue;
    const part = guide[p], color = PART_STYLE[p].line;
    for (const d of part.dots) {
      const n = numbered.length + 1, at = o.at(d.at), r = o.labels ? 9 : 5;
      numbered.push({ n, part: p, label: d.label });
      if (!inView(at)) continue;
      g.beginPath();
      g.arc(at.x, at.y, r, 0, 2 * Math.PI);
      g.fillStyle = color;
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = "#fff";
      g.stroke();
      if (!o.labels) continue;
      g.font = "700 11px system-ui, sans-serif";
      g.fillStyle = "#14141a";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(String(n), at.x, at.y + 0.5);
      const out = at.x < o.midX ? -1 : 1;
      pill(g, d.label, at.x + out * 14, at.y, out < 0 ? "right" : "left", color);
    }
  }
  return numbered;
}

/** 그 부위에 그릴 것이 차지하는 자리 (사진 좌표). 그릴 것이 없으면 null */
export function partBounds(part: PartGuide): { xa: number; ya: number; xb: number; yb: number } | null {
  const pts = [...part.outline.polys.flat(), ...part.outline.lines.flat(), ...part.zones.flatMap((z) => z.poly), ...part.dots.map((d) => d.at), ...part.arrows.flatMap((a) => [a.from, a.to])];
  if (!pts.length) return null;
  return { xa: Math.min(...pts.map((q) => q.x)), ya: Math.min(...pts.map((q) => q.y)), xb: Math.max(...pts.map((q) => q.x)), yb: Math.max(...pts.map((q) => q.y)) };
}

export interface BoardInput {
  guide: LookGuide;
  /** 눈 폭(px) · 얼굴 칸 (사진 좌표) */
  u: number;
  face: { x: number; y: number; w: number; h: number };
  /** 두 눈의 자리 (사진 좌표, 사진에서 왼쪽 눈 · 오른쪽 눈) — 아이라이너는 가늘어서 눈을 한쪽씩 크게 확대해 보여 준다 */
  eyes: { xa: number; ya: number; xb: number; yb: number }[];
  /** 바탕 그림 두 장 (같은 크기): 입힌 결과(정답사진) · 내 맨얼굴 */
  result: HTMLCanvasElement;
  bare: HTMLCanvasElement;
}

/** 바탕을 잘라 그리고 그 위에 가이드를 얹은 캔버스 한 장 */
function shot(inp: BoardInput, parts: readonly GuidePartId[], box: { x: number; y: number; w: number; h: number }, base: "result" | "bare", width: number, labels: boolean, quiet: readonly GuidePartId[] = []): HTMLCanvasElement {
  const cv = document.createElement("canvas"), k = width / box.w;
  cv.width = width;
  cv.height = Math.max(1, Math.round(box.h * k));
  const g = cv.getContext("2d")!;
  g.imageSmoothingQuality = "high";
  g.drawImage(base === "bare" ? inp.bare : inp.result, box.x, box.y, box.w, box.h, 0, 0, cv.width, cv.height);
  drawGuideParts(g, inp.guide, parts, { at: (p) => ({ x: (p.x - box.x) * k, y: (p.y - box.y) * k }), tint: base === "bare", labels, midX: (inp.face.x + inp.face.w / 2 - box.x) * k, quiet });
  return cv;
}

/**
 * 한눈에 보는 판: 맨 위에 얼굴 전체(정답사진 위 가이드 · 맨얼굴 위 색칠), 그 아래 부위마다 카드 한 장 —
 * 확대한 그림 두 장(어떻게 보여야 하나 · 어디에 바르나), 따라 하는 순서, 잰 값.
 */
export function renderBoard(host: HTMLElement, inp: BoardInput): void {
  host.replaceChildren();
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  };
  const figure = (cv: HTMLCanvasElement, caption: string): HTMLElement => {
    const f = el("figure");
    f.append(cv, el("figcaption", "", caption));
    return f;
  };
  const W = inp.result.width, H = inp.result.height;
  const clamp = (b: { x: number; y: number; w: number; h: number }): { x: number; y: number; w: number; h: number } => {
    const x = Math.max(0, b.x), y = Math.max(0, b.y);
    return { x, y, w: Math.min(W, b.x + b.w) - x, h: Math.min(H, b.y + b.h) - y };
  };
  const found = DRAW_ORDER.filter((p) => inp.guide[p].found);

  // 얼굴 전체
  const all = el("section", "gcard gall");
  all.append(el("h4", "", "얼굴 전체"));
  const legend = el("div", "legend");
  for (const p of CARD_ORDER) {
    const item = el("span", inp.guide[p].found ? "" : "off", PART_STYLE[p].name);
    item.style.setProperty("--c", PART_STYLE[p].line);
    legend.append(item);
  }
  all.append(legend);
  const pairAll = el("div", "pair");
  pairAll.append(figure(shot(inp, found, clamp(inp.face), "result", 640, false), "정답사진 위에 그린 가이드"), figure(shot(inp, found, clamp(inp.face), "bare", 640, false), "내 맨얼굴 위 — 바를 자리를 그 색으로 칠함"));
  all.append(pairAll);
  host.append(all);

  // 부위마다
  for (const p of CARD_ORDER) {
    const part = inp.guide[p], card = el("section", part.found ? "gcard" : "gcard none");
    card.style.setProperty("--c", PART_STYLE[p].line);
    const h4 = el("h4", "", PART_STYLE[p].name);
    if (part.color) {
      const sw = el("span", "swatch");
      sw.style.background = rgb(part.color, 1);
      sw.title = `이 자리의 색 rgb(${part.color.map((v) => Math.round(v)).join(", ")})`;
      h4.append(sw, el("small", "", "이 색으로"));
    }
    card.append(h4);
    const b = part.found ? partBounds(part) : null;
    if (b && (p === "liner" || p === "wing")) {
      // 눈을 한쪽씩: 그 눈 전체 + 그 눈 쪽에 그린 것이 다 들어오게, 글씨를 쓰는 바깥쪽은 넉넉히
      const mid = inp.face.x + inp.face.w / 2;
      const pts = [...part.outline.lines.flat(), ...part.zones.flatMap((z) => z.poly), ...part.dots.map((d) => d.at), ...part.arrows.flatMap((a) => [a.from, a.to])];
      for (const eye of inp.eyes) {
        const left = (eye.xa + eye.xb) / 2 < mid, mine = pts.filter((q) => q.x < mid === left);
        const xa = Math.min(eye.xa, ...mine.map((q) => q.x)), xb = Math.max(eye.xb, ...mine.map((q) => q.x));
        const ya = Math.min(eye.ya, ...mine.map((q) => q.y)), yb = Math.max(eye.yb, ...mine.map((q) => q.y));
        const out = inp.u * 0.95, inn = inp.u * 0.25, padY = inp.u * 0.4;
        const box = clamp({ x: xa - (left ? out : inn), y: ya - padY, w: xb - xa + out + inn, h: yb - ya + 2 * padY });
        const pair = el("div", "pair");
        const who = left ? "오른쪽 눈 (사진에서 왼쪽)" : "왼쪽 눈 (사진에서 오른쪽)";
        // 꼬리 카드에는 속눈썹 선의 아이라인도 옅게 같이 그린다 — 꼬리가 어디서 이어지는지 보이게
        const both: GuidePartId[] = p === "wing" && inp.guide.liner.found ? ["liner", "wing"] : [p];
        const quiet: GuidePartId[] = p === "wing" ? ["liner"] : [];
        pair.append(figure(shot(inp, both, box, "result", 720, true, quiet), `${who} — 정답사진`), figure(shot(inp, both, box, "bare", 720, true, quiet), `${who} — 여기에 긋기`));
        card.append(pair);
      }
    } else if (b) {
      // 점 이름은 얼굴 바깥쪽에 쓴다 — 이름이 있으면 옆으로 넉넉히 잘라 글씨가 그림을 가리지 않게
      const pad = inp.u * 0.45, padX = part.dots.length || part.arrows.length ? inp.u * 1.1 : pad;
      const box = clamp({ x: b.xa - padX, y: b.ya - pad, w: b.xb - b.xa + 2 * padX, h: b.yb - b.ya + 2 * pad });
      const pair = el("div", "pair");
      pair.append(figure(shot(inp, [p], box, "result", 720, true), "정답사진 — 이렇게 보이게"), figure(shot(inp, [p], box, "bare", 720, true), "내 맨얼굴 — 여기에 바르기"));
      card.append(pair);
    } else {
      card.append(el("p", "empty", "이 화장 사진에서는 이 부위의 화장이 안 보여요."));
    }
    if (part.steps.length) {
      const ol = el("ol", "steps");
      for (const s of part.steps) ol.append(el("li", "", s));
      card.append(ol);
    }
    if (part.notes.length) {
      const det = el("details");
      det.append(el("summary", "", part.found ? "잰 값" : "왜 안 보인다고 봤나"));
      const ul = el("ul");
      for (const n of part.notes) ul.append(el("li", "", `${n.label}: ${n.value}`));
      det.append(ul);
      card.append(det);
    }
    host.append(card);
  }
}
