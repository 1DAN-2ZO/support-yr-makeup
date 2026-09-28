/**
 * 화면 4 확대 창 떨림 1차 (#23, 정의서 3-5 "확대 화면이 흔들림"). 순수 함수, 영상 px.
 *
 *   위치: 부위와 같이 움직이는 기준점(앵커)이 얼굴 폭 3% 넘게 벗어날 때만 새 목표로 잡고(데드존),
 *         목표까지 0.2~0.3초에 미끄러져 간다. 그 안의 떨림에는 창이 한 픽셀도 안 움직인다
 *   크기: 첫 프레임에 잠근다. 눈 사이 거리가 20% 넘게 변할 때(실제로 다가가거나 멀어짐)만 새 크기로 미끄러진다
 *
 * poc/full/app.js stabilizeCrop 을 옮기고 위치 EMA 를 데드존 + 시간 기반 미끄러짐으로 바꿨다 (프레임 간격이 달라도 같은 속도).
 * 테두리 선 자체의 떨림은 One-Euro(④ smoothing.ts)가 맡는다 — live-run.
 */

import { cropSpec, type Rect } from "./crop";
import { LM, at, dist } from "./landmarks";
import type { PartId, Pt } from "./types";

export const CROP_FOLLOW = {
  /** 앵커가 이만큼(얼굴 폭 비율) 넘게 벗어나야 창을 옮긴다 */
  deadzone: 0.03,
  /** 미끄러짐 시간 상수(초). 0.3초에 97% (정의서 "0.2~0.3초") */
  tau: 0.08,
  /** 눈 사이 거리가 이만큼 넘게 변해야 크기를 바꾼다 */
  rescale: 0.2,
} as const;

const mean = (lm: readonly Pt[], ids: readonly number[]): Pt => {
  let x = 0, y = 0;
  for (const i of ids) { const p = at(lm, i); x += p.x; y += p.y; }
  return { x: x / ids.length, y: y / ids.length };
};

/** 부위와 같이 움직이는 점 — 고개를 돌려도 부위가 창 가운데에 남게 (POC partAnchor) */
function anchorOf(partId: PartId, lm: readonly Pt[]): Pt {
  switch (partId) {
    case "lip": return mean(lm, [61, 291]);                                             // 입꼬리 중점: 입을 벌려도 거의 안 움직임
    case "cheek": return mean(lm, [LM.cheekA, LM.cheekB]);
    case "contour": return mean(lm, [LM.glabella, LM.cheekA, LM.cheekB, 61, 291]);   // 턱 제외
    default: return mean(lm, [LM.eyeA.outer, LM.eyeB.outer]);                          // 눈 단계: 양 눈꼬리
  }
}

interface Hold {
  w0: number;
  eyeD0: number;
  targetEyeD: number;
  curEyeD: number;
  /** 첫 프레임의 (창 가운데 − 앵커) */
  off: Pt;
  target: Pt;
  cur: Pt;
  t: number;
}

export function createCropFollow(partId: PartId, aspect: number, opt = CROP_FOLLOW): { step(lm: readonly Pt[], tMs: number): Rect; reset(): void } {
  let h: Hold | null = null;
  return {
    step(lm, tMs) {
      const an = anchorOf(partId, lm);
      const eyeD = dist(at(lm, LM.eyeA.outer), at(lm, LM.eyeB.outer));
      if (!h) {
        const raw = cropSpec(partId, lm, aspect);
        h = { w0: raw.w, eyeD0: eyeD, targetEyeD: eyeD, curEyeD: eyeD, off: { x: raw.x + raw.w / 2 - an.x, y: raw.y + raw.h / 2 - an.y }, target: an, cur: an, t: tMs };
        return raw;
      }
      const faceW = dist(at(lm, LM.faceL), at(lm, LM.faceR));
      if (dist(an, h.target) > faceW * opt.deadzone) h.target = an;
      if (Math.abs(eyeD / h.targetEyeD - 1) > opt.rescale) h.targetEyeD = eyeD;
      const dt = Math.max(0, (tMs - h.t) / 1000);
      h.t = tMs;
      const a = 1 - Math.exp(-dt / opt.tau);
      h.cur = { x: h.cur.x + (h.target.x - h.cur.x) * a, y: h.cur.y + (h.target.y - h.cur.y) * a };
      h.curEyeD += (h.targetEyeD - h.curEyeD) * a;
      const k = h.curEyeD / h.eyeD0, w = h.w0 * k, hh = w / aspect;
      return { x: h.cur.x + h.off.x * k - w / 2, y: h.cur.y + h.off.y * k - hh / 2, w, h: hh };
    },
    /** 얼굴을 잃었다 다시 잡혔을 때 — 옛 자리에서 미끄러져 오지 않고 새로 시작 */
    reset() {
      h = null;
    },
  };
}

/** 영상 밖으로 나간 창을 안으로 민다. 영상보다 크면 가운데 기준으로 영상 크기까지 (비율은 깨질 수 있다 → 그리기에서 맞춘다) */
export function clampRect(r: Rect, W: number, H: number): Rect {
  const w = Math.min(r.w, W), h = Math.min(r.h, H);
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  return { x: Math.min(Math.max(0, cx - w / 2), W - w), y: Math.min(Math.max(0, cy - h / 2), H - h), w, h };
}

/**
 * 떨림 재기 (#23 산출물 "적용 전후 비교"). 같은 점들을 프레임마다 넣으면 **프레임 사이에 튄 거리의 평균(px)** 을 낸다.
 * 위치의 표준편차가 아니라 프레임 간 이동을 보는 이유: 30초 동안 몸이 천천히 흔들린 것까지 떨림으로 세지 않게
 * (첫 측정에서 보정을 켠 쪽이 더 떨린다고 거꾸로 나왔다 — 데드존 안에서 천천히 움직인 얼굴을 떨림으로 셌다)
 */
export function jitterMeter(): { push(pts: readonly Pt[]): void; perFrame(): number; count(): number; reset(): void } {
  let prev: readonly Pt[] | null = null;
  let frames = 0, steps = 0, total = 0;
  return {
    push(pts) {
      if (prev && prev.length !== pts.length) { prev = null; frames = 0; steps = 0; total = 0; }
      if (prev && pts.length) {
        let d = 0;
        pts.forEach((p, i) => { const q = prev![i]!; d += Math.hypot(p.x - q.x, p.y - q.y); });
        total += d / pts.length;
        steps++;
      }
      prev = pts.map((p) => ({ x: p.x, y: p.y }));
      frames++;
    },
    perFrame: () => (steps ? total / steps : 0),
    count: () => frames,
    reset() { prev = null; frames = 0; steps = 0; total = 0; },
  };
}
