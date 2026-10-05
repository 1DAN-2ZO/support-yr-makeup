/**
 * 머리선 점 — MediaPipe 얼굴 점 478개는 이마 중간(10번)까지라 이마 위 끝(머리선)을 모른다 (2026-10-05 사용자).
 * 머리카락 분할 마스크(screens/hair-segmenter)로 머리카락이 시작하는 자리를 찾아 점을 **따로** 더한다 — 478점은 그대로
 * (점 개수를 가정하는 코드가 많아서 배열에 끼워 넣지 않는다).
 *
 * 칸마다: MediaPipe 이마 위 선(FOREHEAD_ARC)의 점에서 얼굴 위쪽(미간 168 → 이마 위 10)으로 올라가며 처음 머리카락이 이어지는 곳.
 *  - 출발점 바로 위부터 머리카락이면 앞머리가 이마를 덮은 것 → 그 칸은 MediaPipe 선으로 되돌아간다 ("bangs")
 *  - 찾는 범위(이마 위 ↔ 미간 거리 × searchMax) 안에 없으면 못 찾음 → MediaPipe 선 ("none")
 *  - 가는 한 가닥에 걸리지 않게 머리카락이 minRun 만큼 이어져야 머리선으로 본다
 * 맨얼굴 촬영(화면 1)이 이마 대부분이 머리카락이면 막으므로(flow.ts bangs) 여기 오는 건 대개 일부만 덮은 경우다.
 * 같은 방식: eval/faceshape/hairline.py (얼굴형 분류, Python · selfie_multiclass)
 */

import type { HairMask } from "./sampling";
import { SAMPLE } from "./sampling";
import type { Pt } from "./types";

/** MediaPipe 얼굴 윤곽의 이마 위 부분 — 사진 왼쪽(54) → 이마 위(10) → 사진 오른쪽(284) */
export const FOREHEAD_ARC: readonly number[] = [54, 103, 67, 109, 10, 338, 297, 332, 284];

/**
 * columns: 칸 수 · searchMax: 찾는 거리(이마 위 ↔ 미간 거리 배수) · bangsMargin: 출발점에서 이만큼 안에 머리카락이면 앞머리 ·
 * minRun: 머리카락이 이만큼 이어져야 머리선 (둘 다 이마 위 ↔ 미간 거리 배수). 눈대중 시작값 — 웹캠 · 폰에서 보고 맞춘다
 */
export const HAIRLINE = { columns: 11, searchMax: 1.0, bangsMargin: 0.05, minRun: 0.03 } as const;

export type HairlineKind = "hair" | "bangs" | "none";

export interface HairlinePoint {
  /** 머리선 점 (사진 좌표). bangs · none 이면 base 와 같다 */
  at: Pt;
  /** 출발점 — MediaPipe 이마 위 선 위의 점 */
  base: Pt;
  kind: HairlineKind;
}

/** 이마 위 선을 길이 기준으로 n 칸 나눈 점 (양 끝 포함) */
function alongArc(pts: readonly Pt[], n: number): Pt[] {
  const seg = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i]!.x, p.y - pts[i]!.y));
  const total = seg.reduce((a, b) => a + b, 0);
  return Array.from({ length: n }, (_, k) => {
    if (k === 0) return pts[0]!;
    if (k === n - 1) return pts[pts.length - 1]!;
    let d = (total * k) / (n - 1), i = 0;
    while (i < seg.length - 1 && d > seg[i]!) { d -= seg[i]!; i++; }
    const t = seg[i]! > 0 ? d / seg[i]! : 0, a = pts[i]!, b = pts[i + 1]!;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  });
}

/** 이 얼굴의 칸 출발점 · 얼굴 위쪽(미간 168 → 이마 위 10) · 그 거리(눈금) */
function foreheadFrame(lm: readonly Pt[], columns: number): { bases: Pt[]; up: Pt; unit: number } {
  const top = lm[10]!, mid = lm[168]!, unit = Math.hypot(top.x - mid.x, top.y - mid.y);
  const up = unit > 0 ? { x: (top.x - mid.x) / unit, y: (top.y - mid.y) / unit } : { x: 0, y: -1 };
  return { bases: alongArc(FOREHEAD_ARC.map((i) => lm[i]!), columns), up, unit };
}

/** lm: 얼굴 점(사진 px) · mask: 머리카락 확률(사진과 같은 구도, 크기는 달라도 됨) · img: 사진 크기 */
export function findHairline(lm: readonly Pt[], mask: HairMask, img: { w: number; h: number }, opts: typeof HAIRLINE = HAIRLINE): HairlinePoint[] {
  const { bases, up, unit } = foreheadFrame(lm, opts.columns);
  if (!(unit > 0)) return bases.map((b) => ({ at: b, base: b, kind: "none" }));
  const hairAt = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= img.w || y >= img.h) return false;
    const mx = Math.min(mask.w - 1, Math.floor((x * mask.w) / img.w)), my = Math.min(mask.h - 1, Math.floor((y * mask.h) / img.h));
    return (mask.data[my * mask.w + mx] ?? 0) >= SAMPLE.hairCut;
  };
  const step = 0.5, max = unit * opts.searchMax, margin = unit * opts.bangsMargin, run = Math.max(step, unit * opts.minRun);
  return bases.map((base): HairlinePoint => {
    let start = -1;
    for (let s = 0; s <= max; s += step) {
      const hair = hairAt(base.x + up.x * s, base.y + up.y * s);
      if (!hair) { start = -1; continue; }
      if (start < 0) start = s;
      if (s - start + step >= run) {
        if (start <= margin) return { at: base, base, kind: "bangs" };
        return { at: { x: base.x + up.x * start, y: base.y + up.y * start }, base, kind: "hair" };
      }
    }
    return { at: base, base, kind: "none" };
  });
}

/**
 * 영상에서 따라가기 (웹캠 2026-10-05: 마스크마다 새로 찾으면 랜드마크보다 늦고 많이 흔들렸다).
 * 머리선을 사진 자리가 아니라 **얼굴 기준**(칸마다 출발점에서 얼굴 위쪽으로 이마 위 ↔ 미간 거리의 몇 배)으로 들고 있다가
 * 매 장면 지금 랜드마크로 다시 놓는다 — 랜드마크만큼 빨리 따라간다. 분할은 가끔(간격마다)이라 새 마스크가 오면 그 값만
 * alpha 만큼 섞는다 (머리선은 얼굴에 붙어 있어 천천히 섞어도 된다). 칸 종류(찾음 · 앞머리 · 못 찾음)가 바뀌면 기다리지 않고 바로.
 * settle: 머리선이 정말 바뀌었을 때 1px 안으로 따라가는 데 드는 분할 횟수 (alpha 에서 나온 값 — 시험 T3)
 * 화면 4 에 넣을 때도 같다 — 맨얼굴에서 한 번 찾고(update) 매 장면 place.
 */
export const HAIRLINE_TRACK = { alpha: 0.35, settle: 7 } as const;

export function createHairlineTrack(opts: typeof HAIRLINE = HAIRLINE, alpha: number = HAIRLINE_TRACK.alpha): {
  update(lm: readonly Pt[], mask: HairMask, img: { w: number; h: number }): void;
  place(lm: readonly Pt[]): HairlinePoint[] | null;
  reset(): void;
} {
  let cols: { kind: HairlineKind; s: number }[] | null = null;
  return {
    update(lm, mask, img) {
      const { unit } = foreheadFrame(lm, opts.columns);
      if (!(unit > 0)) return;
      const next = findHairline(lm, mask, img, opts).map((p) => ({ kind: p.kind, s: p.kind === "hair" ? Math.hypot(p.at.x - p.base.x, p.at.y - p.base.y) / unit : 0 }));
      const prev = cols;
      cols = prev && prev.length === next.length
        ? next.map((n, i) => (n.kind === "hair" && prev[i]!.kind === "hair" ? { kind: n.kind, s: prev[i]!.s + alpha * (n.s - prev[i]!.s) } : n))
        : next;
    },
    place(lm) {
      if (!cols) return null;
      const { bases, up, unit } = foreheadFrame(lm, opts.columns), c = cols;
      return bases.map((base, i): HairlinePoint => {
        const col = c[i]!;
        return col.kind === "hair" ? { at: { x: base.x + up.x * col.s * unit, y: base.y + up.y * col.s * unit }, base, kind: "hair" } : { at: base, base, kind: col.kind };
      });
    },
    reset() { cols = null; },
  };
}
