/**
 * 부위 가이드 모양 (2026-10-07) — 부위별 화장 영역(makeup-extract PartMask)에서 숫자 몇 개만 읽고, 모양은 얼굴 점 위에 단순하게 그린다.
 * 화장 영역 테두리를 그대로 따면 울퉁불퉁하고 양쪽이 달라 믿음이 안 간다 (사용자 캡처 2026-10-07) →
 *  - 양쪽 같게: 좌우 숫자를 거울로 맞춰 평균 내고(한쪽만 잡히면 그쪽 숫자로), 같은 모양을 각자 눈 · 볼 자리에 놓는다.
 *    숫자는 그쪽 눈꼬리를 원점으로 한 눈 좌표(바깥 방향 s · 위 v, 눈 폭 단위) — 좌우가 거울처럼 맞는다
 *  - 단순하게:
 *    입술: 얼굴 점 입술선 그대로 (벌린 입이면 윗입술 · 아랫입술). 입술 화장이 잡혔을 때만
 *    눈썹: 원래 눈썹(얼굴 점)을 위 · 아래로 같은 두께만큼 넓힌다 (화장 영역이 눈썹선 밖으로 나간 정도의 중앙값 — 털 톱니는 무시).
 *      모양은 아치 — 얼굴 점을 지나는 닫힌 매끈한 곡선(캣멀-롬), 꼬리는 한 점으로 모이고 앞머리는 둥글게.
 *      AI 화장 사진(made)을 주면 두께는 실제 어두운 눈썹 털에 맞춰 줄이거나 넓힌다 (빈 살은 안 잡는다)
 *    라이너: 눈머리 → 눈꼬리 눈꺼풀 위 띠는 다 덮되 두께는 실제대로(칸마다 잰 두께의 2차 곡선), 꼬리 윗선도 실제 모양대로
 *      (눈꼬리 밖 칸마다 따라가며), 아랫선은 눈꼬리 → 꼬리 끝 곧게 (사용자 그림 2026-10-07 — 고정 띠 + 삼각 꼬리는 실제와 달랐다)
 *    섀도: 라이너 윗선 위에서 겹치지 않게, 눈머리부터 라이너 꼬리 끝까지 부채꼴 — 높이는 칸마다 보이는 대로 재고,
 *      그 바깥으로 더 번졌으면 칸마다 아래 · 위 끝을 따라 거기까지. 윗선은 그중 가장 높은 점들만 매끄럽게 잇는다 (사용자 2026-10-07)
 *    아래 섀도: 아랫눈꺼풀에서 내려간 높이를 매끈한 2차 곡선으로
 *    블러셔: 화장 영역 모멘트 타원
 *  - 쉐딩 · 하이라이트(참고)는 뺀다. clip 밖 픽셀(klein 이면 얼굴 윤곽 0.9 밖 — 원본에 되붙인 경계 차이)도 뺀다.
 */

import { pointInPoly, type RgbaImage } from "./color";
import { LM } from "./landmarks";
import { spreadMarks, type SpreadMarks } from "./spread-marks";
import type { ExtractPart, PartMask } from "./makeup-extract";
import { maskOutlines } from "./region-outline";
import type { Side } from "./score";
import type { Pt } from "./types";

/** 속입술 — 왼쪽 입꼬리(78) → 위(13) → 오른쪽(308) → 아래(14) */
export const LIPS_INNER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95] as const;

export interface PartGuide {
  part: ExtractPart;
  side: PartMask["side"];
  /** 닫힌 테두리들 */
  polys: Pt[][];
  /** 그쪽 화장 영역 픽셀 수 (반대쪽을 거울로 받았으면 0) */
  count: number;
  /** landmark: 얼굴 점 선 · mixed: 얼굴 점 + 화장 영역 숫자 · region: 화장 영역 숫자 */
  from: "landmark" | "mixed" | "region";
  /** 퍼지는 방향 표시 (블러셔: 가운데 점 + 사방 화살표) — 선과 점만 */
  marks?: SpreadMarks;
}

/**
 * mouthOpen: 속입술 위아래가 입 폭의 이 비율 넘게 벌어지면 벌린 입 · profileN: 섀도 높이를 잴 눈꺼풀 칸 수 ·
 * shadowMax · browMax: 높이 · 두께를 찾을 거리(눈 폭) · minH: 이보다 낮은 칸은 섀도 없음 ·
 * wingMin: 눈꼬리 밖으로 이만큼 넘어야 꼬리 ·
 * taper: 섀도 양 끝에서 이 비율 구간 동안 눈꺼풀로 내려온다 · linerStart · linerMax · linerMin: 라이너 띠는 눈꺼풀에서 이만큼 안에서
 * 시작하는 줄, 두께는 이 사이 · wingMax: 꼬리를 찾는 거리 · wingTrack: 앞 칸 윗선에서 이만큼 안의 줄만 잇는다 · wingN: 꼬리 윗선 칸 수 ·
 * waveSmooth: 꼬리 끝 → 띠 윗선을 이웃 3점 평균으로 다듬는 횟수 · wingTaper: 꼬리 끝에서 이 비율 구간은 끝으로 곧게 모인다 ·
 * lashOpen: 라이너 진한 픽셀에서 이 굵기(눈 폭 비율)보다 가는 가닥(마스카라 속눈썹)은 지운다 ·
 * shadowExtMax · shadowExtN: 섀도가 라이너 꼬리 끝 바깥으로 번진 곳을 찾는 거리(눈 폭) · 다시 잡는 칸 수 ·
 * shadowStep: 섀도 바깥 테두리를 다시 찍는 간격(눈 폭) ·
 * browGrow: 눈썹 위 · 아래 선을 원래 눈썹 두께(얼굴 점)의 이 비율까지만 넓히거나 줄인다 ·
 * shadowStart · shadowGap: 섀도 칸 높이는 라이너 윗선에서 shadowStart 안에 시작해 shadowGap 넘게 끊기지 않고 이어진 데까지 ·
 * browGap: 섀도 테두리는 눈썹 가이드에서 이만큼 떨어진다 ·
 * wingCurve: 라이너 꼬리 윗선 틀 — 눈꼬리에서 꼬리 끝까지 올라가는 곡선의 휨 (1 = 곧게, 클수록 처음엔 천천히 · 끝에서 빨리 올라가 물결이 깊다) ·
 * linerRamp: 라이너 두께가 구간 경계(눈 폭 1/3 · 2/3) 앞뒤 이만큼(눈꺼풀 길이 비율) 안에서 다음 구간 두께로 넘어간다 ·
 * browN · browTaper: 눈썹 털을 잴 칸 수 · 꼬리 쪽 뾰족하게 모으는 구간 (눈썹 길이 비율) ·
 * browContrast: 그 칸 살보다 이만큼(밝기 0~255) 넘게 어두운 곳이 없으면 털 없음
 * (browGrow 는 눈썹 두께 비율, 나머지는 눈 폭 비율). 눈대중 시작값
 */
export const PART_GUIDE = {
  mouthOpen: 0.06, profileN: 24, shadowMax: 1.0, browMax: 0.4, minH: 0.03,
  wingMin: 0.03, taper: 0.2, linerStart: 0.06, linerMax: 0.3, linerMin: 0.015, wingMax: 0.8, wingTrack: 0.06, wingN: 10, waveSmooth: 3, wingTaper: 0.3, shadowExtMax: 0.8, shadowExtN: 8, shadowStep: 0.04, lashOpen: 0.012,
  browGrow: 0.5, shadowStart: 0.08, shadowGap: 0.05, browGap: 0.03,
  wingCurve: 1.6, linerRamp: 0.08, browN: 25, browTaper: 0.3, browContrast: 8,
  // 섀도 돔 받침점 [s, k] — 사용자가 섀도 모양 잡기 화면에서 잡은 그대로 (2026-10-14 19:21). 눈꼬리 → 바깥 → 윗선 → 눈머리 순서
  shadowShape: [[0.1991, -0.0219], [0.3404, 0.0613], [0.4389, 0.4808], [0.2693, 0.8042], [-0.0215, 0.8809], [-0.2567, 0.8934], [-0.5053, 0.8763],
    [-0.6761, 0.8232], [-0.8292, 0.7012], [-0.9335, 0.5013], [-0.9697, 0.2688]],
  // 블러셔 받침점 [s, k] — 사용자가 블러셔 모양 잡기 화면에서 잡은 그대로 (2026-10-14 19:58). 닫힌 곡선, 바깥 → 아래 → 눈머리 쪽 → 위 순서.
  // s = 눈꼬리에서 바깥으로 눈 폭 몇 배, k = 아래 눈꺼풀(0) ~ 입꼬리 높이(1)
  cheekShape: [[0.517, 0.4409], [0.2879, 0.5524], [0.0293, 0.6213], [-0.2582, 0.6029], [-0.4853, 0.5363], [-0.5757, 0.4455], [-0.5869, 0.3327],
    [-0.4787, 0.2307], [-0.2355, 0.1628], [0.0903, 0.1699], [0.4406, 0.152], [0.6244, 0.2459]],
  shadowDotAt: [0.2, 0.5, 0.82], shadowArrowDeg: [75, 45, 15], shadowArrowMin: 0.08, shadowArrowGap: 0.02, shadowArrowStart: 0.25, shadowArrowSkip: 0.1,
} as const;

type SV = { s: number; v: number };
interface EyeFrame { o: Pt; out: Pt; up: Pt; ew: number; from: (q: SV) => Pt; to: (p: Pt) => SV }

export function partGuides(parts: readonly PartMask[], lm: readonly Pt[], w: number, h: number, opts: { clip?: readonly Pt[]; made?: RgbaImage; face?: readonly Pt[] } = {}): PartGuide[] {
  const P = (i: number): Pt => lm[i]!;
  const masks = new Map<string, { m: Uint8Array; count: number; raw?: Uint8Array }>();
  for (const p of parts) {
    if (p.part === "contour" || p.part === "highlight" || !p.count) continue;
    let m = p.mask;
    if (opts.clip) {
      m = m.slice();
      for (let i = 0; i < m.length; i++) if (m[i] && !pointInPoly(i % w, Math.floor(i / w), opts.clip)) m[i] = 0;
    }
    masks.set(`${p.part}:${p.side ?? ""}`, { m, count: p.count });
  }
  const at = (m: Uint8Array) => (q: Pt) => {
    const x = Math.round(q.x), y = Math.round(q.y);
    return x >= 0 && y >= 0 && x < w && y < h && m[y * w + x] === 1;
  };
  const F = { R: eyeFrame(lm, "R"), L: eyeFrame(lm, "L") };
  const out: PartGuide[] = [];
  /** 좌우 숫자 읽기 → 거울 평균 (한쪽만이면 그쪽) → 각자 자리에 같은 모양 */
  function both<T>(part: ExtractPart, read: (inside: (q: Pt) => boolean, f: EyeFrame, side: Side, m: Uint8Array) => T | null, avg: (a: T, b: T) => T, draw: (v: T, f: EyeFrame, side: Side) => Pt[], from: PartGuide["from"]): void {
    const got = (["R", "L"] as const).map((s) => { const e = masks.get(`${part}:${s}`); return e ? read(at(e.m), F[s], s, e.m) : null; });
    const v = got[0] && got[1] ? avg(got[0], got[1]) : got[0] ?? got[1];
    if (!v) return;
    for (const s of ["R", "L"] as const) {
      const poly = draw(v, F[s], s);
      if (poly.length >= 3) out.push({ part, side: s, polys: [poly], count: masks.get(`${part}:${s}`)?.count ?? 0, from });
    }
  }

  const lip = masks.get("lip:");
  if (lip) out.push({ part: "lip", side: null, polys: lipShapes(lm), count: lip.count, from: "landmark" });

  // 눈썹 (사용자 2026-10-09: 딱 맞는 느낌이 없다) — 정답사진이 있으면 실제 털을 칸마다 따라 재서(위 · 아랫선 · 꼬리 끝) 매끄럽게 맞춘다.
  // 한 두께로 위아래를 넓혔더니 꼬리로 갈수록 가늘어지는 눈썹에서 꼬리가 뚱뚱했고(시험 BF1), 꼬리 끝을 얼굴 점 자리에 묶어
  // 길게 · 짧게 그린 눈썹과 어긋났다(시험 BF2). 정답사진이 없으면 얼굴 점 선을 화장 영역만큼 넓힌다
  const browLines = (s: Side) => { const b = s === "R" ? LM.browA : LM.browB; return { up: b.upper.map(P), lo: b.lower.map(P) }; };
  /**
   * 눈썹 가운데 선 위 t (0 = 꼬리 · 1 = 머리, 0 밑은 꼬리 너머로 곧게 늘림) 의 점과 그 자리 얼굴 점 윗선 · 아랫선까지 거리 (px).
   * 가운데 선은 얼굴 점 다섯 개에 맞춘 2차 곡선 — 꺾은선으로 이으니 점마다 꺾여 가이드 테두리가 구불구불했다 (사용자 2026-10-09, 시험 BS1)
   */
  const browAt = (s: Side, f: EyeFrame) => {
    const { up, lo } = browLines(s), C = up.map((u, k) => mid(u, lo[k]!)), n = C.length - 1;
    const seg = C.slice(1).map((c, k) => Math.hypot(c.x - C[k]!.x, c.y - C[k]!.y)), len = seg.reduce((a, v) => a + v, 0) || 1;
    const tk = C.map((_, k) => seg.slice(0, k).reduce((a, v) => a + v, 0) / len);
    const fx = quadFit(tk, C.map((c) => c.x)), fy = quadFit(tk, C.map((c) => c.y));
    const smooth = (t: number): Pt => {
      if (t >= 0) return { x: fx(t), y: fy(t) };
      const e = 1e-3, d = { x: (fx(e) - fx(0)) / e, y: (fy(e) - fy(0)) / e };   // 꼬리 너머는 꼬리 끝 방향으로 곧게
      return { x: fx(0) + d.x * t, y: fy(0) + d.y * t };
    };
    return (t: number) => {
      const c = smooth(t), tt = Math.min(1, Math.max(0, t));
      let r = tt * len, k = 0;
      while (k < n - 1 && r > seg[k]!) { r -= seg[k]!; k++; }
      const u = seg[k]! ? Math.min(1, r / seg[k]!) : 0, mix2 = (a: Pt, b2: Pt) => ({ x: a.x + (b2.x - a.x) * u, y: a.y + (b2.y - a.y) * u });
      return { c, up: dot(mix2(up[k]!, up[k + 1]!), c, f.up), lo: dot(c, mix2(lo[k]!, lo[k + 1]!), f.up) };
    };
  };
  const BT = Array.from({ length: PART_GUIDE.browN }, (_, i) => i / (PART_GUIDE.browN - 1));
  type BrowRead = { kind: "trace"; top: number[]; bot: number[] } | { kind: "offset"; dU: number; dL: number };
  both<BrowRead>("brow", (inside, f, s) => {
    const { up, lo } = browLines(s);
    // 원래 눈썹 두께의 browGrow 까지만 — 눈썹 위에 붙은 그늘 · 앞머리 그림자가 눈썹만큼 어두우면 이마까지 부풀었다 (실사진 2026-10-09 공효진, 시험 B4)
    const T = median(samples(up, 9).map((u, k) => dot(u, samples(lo, 9)[k]!, f.up))), g = PART_GUIDE.browGrow * T;
    // AI 화장 사진이 있으면 실제 털 — 원래 눈썹(얼굴 점)보다 얇게 그리면 윗부분 빈 살까지 잡았다 (실사진, 시험 B2).
    // 털은 칸마다 그 자리 눈썹 위 · 아래 살(얼굴 점 선에서 두께의 0.8 ~ 1.2 배 떨어진 곳)보다 어두운 곳 — 눈썹 전체를 한 밝기로 가르니
    // 머리 쪽 옅은 털을 놓쳐 가이드 머리가 바늘처럼 가늘었다 (실사진 2026-10-09 공효진, 시험 BF4). 살과 차이가 browContrast 밑이면 털 없음
    const im = opts.made;
    if (im) {
      const lum = (q: Pt) => {
        const x = Math.min(im.w - 1, Math.max(0, Math.round(q.x))), y = Math.min(im.h - 1, Math.max(0, Math.round(q.y))), i = (y * im.w + x) * 4;
        return 0.299 * im.data[i]! + 0.587 * im.data[i + 1]! + 0.114 * im.data[i + 2]!;
      };
      const at = browAt(s, f), R = T, top: number[] = [], bot: number[] = [];
      for (const t of BT) {
        const { c, up: uT, lo: lT } = at(t);
        const skinV: number[] = [];
        for (let k = 0.8; k <= 1.2; k += 0.1) skinV.push(lum(add(c, f.up, uT + k * T)), lum(add(c, f.up, -(lT + k * T))));
        const skin = median(skinV);
        let darkest = Infinity;
        for (let v = -(lT + 0.2 * T); v <= uT + 0.2 * T; v += 0.5) darkest = Math.min(darkest, lum(add(c, f.up, v)));
        if (skin - darkest < PART_GUIDE.browContrast) { top.push(NaN); bot.push(NaN); continue; }
        const th = skin - Math.max(5, 0.35 * (skin - darkest)), dark = (q: Pt) => lum(q) <= th;
        // 가운데 선 위아래 R 안에서 털이 이어진 줄들 — 가운데에 가장 가까운 줄 하나 (살로 1px 넘게 끊기면 다른 줄,
        // 떨어진 그늘 · 머리카락은 눈썹이 아니다 — 시험 B3)
        const runs: { a: number; b: number }[] = [];
        let cur: { a: number; b: number } | null = null, gap = 0;
        for (let v = -R; v <= R; v += 0.5) {
          if (dark(add(c, f.up, v))) { if (cur && gap <= 2) cur.b = v; else { cur = { a: v, b: v }; runs.push(cur); } gap = 0; }
          else gap++;
        }
        const off = (r: { a: number; b: number }) => (r.a <= 0 && r.b >= 0 ? 0 : Math.min(Math.abs(r.a), Math.abs(r.b)));   // 가운데 선에서 떨어진 거리
        const near = runs.sort((x, y) => off(x) - off(y))[0];
        if (!near || near.b - near.a < 1.5 || off(near) > 0.25 * T) { top.push(NaN); bot.push(NaN); continue; }
        top.push(Math.max(uT - g, Math.min(uT + g, near.b)) / f.ew);
        bot.push(Math.max(lT - g, Math.min(lT + g, -near.a)) / f.ew);
      }
      if (top.filter((v) => !Number.isNaN(v)).length >= 5) return { kind: "trace", top, bot };
    }
    const dU = median(samples(up, 9).map((p) => reach(inside, p, f.up, PART_GUIDE.browMax * f.ew)));
    const dL = median(samples(lo, 9).map((p) => reach(inside, p, neg(f.up), PART_GUIDE.browMax * f.ew)));
    return { kind: "offset", dU: Math.max(-g, Math.min(g, dU)) / f.ew, dL: Math.max(-g, Math.min(g, dL)) / f.ew };
  }, (a, b) => {
    if (a.kind === "trace" && b.kind === "trace") {
      const avg = (x: number[], y: number[]) => x.map((v, i) => (Number.isNaN(v) ? y[i]! : Number.isNaN(y[i]!) ? v : (v + y[i]!) / 2));
      return { kind: "trace", top: avg(a.top, b.top), bot: avg(a.bot, b.bot) };
    }
    if (a.kind === "offset" && b.kind === "offset") return { kind: "offset", dU: (a.dU + b.dU) / 2, dL: (a.dL + b.dL) / 2 };
    return a.kind === "trace" ? a : b;
  }, (r, f, s) => {
    // 아치: 꼬리는 위 · 아래 선이 한 점으로 모이고(그 점을 두 번 넣어 뾰족하게), 앞머리는 둥글게 — 닫힌 매끈한 곡선.
    // 위 · 아래 선을 따로 그려 이었더니 꼬리 · 앞머리가 뚝 잘린 사다리꼴이었다 (실사진, 시험 B1)
    if (r.kind === "offset") {
      const { up, lo } = browLines(s), U = up.map((p) => add(p, f.up, r.dU * f.ew)), L = lo.map((p) => add(p, f.up, -r.dL * f.ew));
      const n = U.length - 1, tail = mid(U[0]!, L[0]!), d = { x: U[n]!.x - U[n - 1]!.x, y: U[n]!.y - U[n - 1]!.y }, dl = Math.hypot(d.x, d.y) || 1;
      const head = add(mid(U[n]!, L[n]!), { x: d.x / dl, y: d.y / dl }, 0.25 * Math.hypot(U[n]!.x - L[n]!.x, U[n]!.y - L[n]!.y));
      return splineClosed([tail, tail, ...U.slice(1), head, ...L.slice(1).reverse()]);
    }
    // 실제 털: 위 · 아랫선을 각각 2차 곡선으로 매끄럽게 (털 끝 톱니 · 빈 칸은 눌린다).
    // 꼬리 끝은 얼굴 점 꼬리 끝(윗선 · 아랫선 끝의 가운데)에 두고, 꼬리 쪽 browTaper 구간에 걸쳐 창끝처럼 가늘어진다 —
    // 털 끝을 따라 짧게 모았더니 U 자로 둥글게 막혀 끝이 안 맞았다 (사용자 2026-10-09: 끝부분 점은 지켜줘, 시험 BF2 · BF3)
    const ok = BT.map((_, i) => !Number.isNaN(r.top[i]!) && !Number.isNaN(r.bot[i]!));
    const ts = BT.filter((_, i) => ok[i]), fTop = quadFit(ts, r.top.filter((_, i) => ok[i])), fBot = quadFit(ts, r.bot.filter((_, i) => ok[i]));
    const at = browAt(s, f), N = 40, { up: bu, lo: bl } = browLines(s), tip = mid(bu[0]!, bl[0]!), c0 = at(0).c;
    // 끝은 뾰족(기울기가 있는 채로 0 에서 시작) · 구간 끝에서는 매끈하게(기울기 0) 이어진다
    const ease = (u: number) => (u >= 1 ? 1 : u <= 0 ? 0 : Math.sin((Math.PI / 2) * u));
    const pts = Array.from({ length: N + 1 }, (_, k) => {
      const t = k / N, w = ease(t / PART_GUIDE.browTaper), tp = fTop(t) * f.ew, bt = fBot(t) * f.ew;
      // 꼬리 쪽에서는 가운데를 얼굴 점 꼬리 끝으로 끌어당긴다 (w 0 = 꼬리 끝 그대로)
      const c = add(at(t).c, { x: tip.x - c0.x, y: tip.y - c0.y }, 1 - w);
      return { c, m: ((tp - bt) / 2) * w, h: Math.max(0.5, (tp + bt) / 2) * w };
    });
    // 위 · 아랫선은 이미 매끈한 곡선이라 촘촘히 찍어 그대로 잇는다 — 뾰족한 꼬리 끝을 지나는 보간 곡선은 끝 옆에서 넘쳤다 돌아와 구불구불했다 (시험 BS1).
    // 머리는 둥근 반원(깊이는 두께의 절반)으로 닫는다
    const U = pts.map((q) => add(q.c, f.up, q.m + q.h)), L = pts.map((q) => add(q.c, f.up, q.m - q.h));
    const last = pts[N]!, prev = pts[N - 1]!.c, d = { x: last.c.x - prev.x, y: last.c.y - prev.y }, dl = Math.hypot(d.x, d.y) || 1;
    const centre = add(last.c, f.up, last.m), cap = Array.from({ length: 11 }, (_, k) => {
      const a2 = (Math.PI * (k + 1)) / 12;
      return add(add(centre, f.up, last.h * Math.cos(a2)), { x: d.x / dl, y: d.y / dl }, 0.5 * last.h * Math.sin(a2));
    });
    return [...U, ...cap, ...L.slice(1).reverse()];
  }, "mixed");

  // 눈꺼풀 선 (눈머리 → 눈꼬리) — 얼굴 점을 지나는 매끈한 곡선. 꺾은선 그대로 띄우면 꺾인 데가 섀도 윗선에 도드라졌다 (시험 S3)
  const lidOf = (s: Side, upper: boolean) => { const e = s === "R" ? LM.eyeA : LM.eyeB; return spline([...(upper ? e.upper : e.lower)].reverse().map(P)); };

  // 라이너 (사용자 그림 2026-10-07): 눈머리 → 눈꼬리 눈꺼풀 위 띠는 다 덮되 두께는 실제대로(칸마다 재서 2차 곡선 — 튀는 칸은 눌린다),
  // 꼬리 윗선도 실제 모양대로(눈꼬리 밖 칸마다 따라가며), 아랫선은 눈꼬리 → 꼬리 끝 곧게
  // AI 화장 사진이 있으면 라이너 영역은 그 사진에서 가장 진한 선 — 맨얼굴과의 차이에는 섀도 · 속눈썹 변화까지 섞여 띠가 부풀었다 (실사진, 시험 L9)
  if (opts.made) for (const sd of ["R", "L"] as const) {
    const e = masks.get(`liner:${sd}`);
    const dm = e ? linerDark(opts.made, lidOf(sd, true), F[sd]) : null;
    if (e && dm) masks.set(`liner:${sd}`, { m: dm.solid, count: e.count, raw: dm.raw });
  }
  const linerTop: Partial<Record<Side, Pt[]>> = {};   // 라이너 윗선 (눈머리 → 눈꼬리 · 꼬리가 있으면 꼬리 끝) — 섀도는 이 위에서 시작
  const linerPoly: Partial<Record<Side, Pt[]>> = {};
  both("liner", (inside, f, s) => {
    const base = samples(lidOf(s, true), PART_GUIDE.profileN + 1), nrm = normals(base, f.up);
    const th = base.map((p, i) => runFrom(inside, p, nrm[i]!, Math.max(2, PART_GUIDE.linerStart * f.ew), PART_GUIDE.linerMax * f.ew) / f.ew);
    const raw = masks.get(`liner:${s}`)?.raw;
    return { th, wing: wingOf(inside, f, th[th.length - 1]!, raw ? at(raw) : undefined) };
  }, (a, b) => ({ th: a.th.map((x, i) => (x + b.th[i]!) / 2), wing: a.wing && b.wing ? avgWing(a.wing, b.wing) : a.wing ?? b.wing }),
  ({ th, wing }, f, s) => {
    // 물결 틀 (사용자 2026-10-09: 모양은 틀, 길이 · 두께만 읽기) — 두께는 눈머리 · 가운데 · 눈꼬리 세 구간에서 하나씩 읽어 매끄럽게 잇는다.
    // 칸마다 보이는 두께를 이웃끼리만 다듬었더니 들쭉날쭉한 칸에서 띠가 출렁였다 (시험 LT1). 구간 절반 넘게 칠했으면 칠한 칸 평균,
    // 아니면 얇은 선 — 눈머리 쪽이 두꺼운 라이너 · 절반만 칠한 라이너도 그대로 (시험 L4 · L5). 양 끝 칸(눈머리 · 눈꼬리 점)은 늘 0 으로 재져서 뺀다
    const inner = th.slice(1, -1), n3 = inner.length / 3, ctrl = [0, 1, 2].map((k) => {
      const seg = inner.slice(Math.round(k * n3), Math.round((k + 1) * n3)), on = seg.filter((v) => v > 0);
      return on.length * 2 > seg.length ? on.reduce((a, b) => a + b, 0) / on.length : PART_GUIDE.linerMin;
    });
    // 구간 안은 그 두께, 구간 경계(1/3 · 2/3) 앞뒤 linerRamp 안에서만 매끄럽게 넘어간다 — 구간 가운데끼리 길게 이으니
    // 칠하기 시작한 곳보다 한참 앞에서부터 두꺼워졌다 (시험 L5)
    const ease = (u: number) => u * u * u * (u * (6 * u - 15) + 10);
    const prof = (i: number) => {
      const u = i / (th.length - 1), r = PART_GUIDE.linerRamp;
      let t = ctrl[0]!;
      for (const [k, at] of [[1, 1 / 3], [2, 2 / 3]] as const) {
        const x = Math.min(1, Math.max(0, (u - at + r) / (2 * r)));
        t += (ctrl[k]! - ctrl[k - 1]!) * ease(x);
      }
      return t;
    };
    const tAt = (i: number) => Math.min(PART_GUIDE.linerMax, Math.max(PART_GUIDE.linerMin, prof(i)));
    const base = samples(lidOf(s, true), PART_GUIDE.profileN + 1), nrm = normals(base, f.up);
    const top = base.map((p, i) => add(p, nrm[i]!, tAt(i) * f.ew));
    linerTop[s] = top;
    if (!wing) return (linerPoly[s] = [...base, ...[...top].reverse()]);
    // 꼬리 윗선은 틀 — 눈꼬리 띠 윗점에서 꼬리 끝까지 처음엔 천천히 · 끝에서 빨리 올라가는 곡선 (사진에서는 꼬리 끝 자리만 읽는다).
    // 사진의 꼬리 윗선을 칸마다 따라갔더니 혹 · 톱니까지 그대로 그렸다 (사용자 2026-10-09: 물결 틀에 길이 · 두께만, 시험 LT2).
    // 아랫선(눈꼬리 → 꼬리 끝 곧게)보다 아래로는 안 내려간다
    const tip = f.from({ s: wing.sTip, v: wing.vTip }), c = f.to(top[top.length - 1]!);
    const wingTop = Array.from({ length: PART_GUIDE.wingN - 1 }, (_, k) => {
      const u = (k + 1) / PART_GUIDE.wingN, s = c.s + (wing.sTip - c.s) * u, lower = wing.vTip * (s / wing.sTip);
      return f.from({ s, v: Math.max(lower, c.v + (wing.vTip - c.v) * u ** PART_GUIDE.wingCurve) });
    }).filter((p, k) => f.to(p).s > c.s && (k + 1) / PART_GUIDE.wingN <= 1 - PART_GUIDE.wingTaper);
    // 꼬리 끝 wingTaper 구간은 윗선을 빼서 끝으로 곧게 모이게 — 그대로 두니 끝 바로 앞까지 높다가 꺾여 뭉툭하게 잘렸다 (실사진, 시험 L10)
    // 윗선 = 꼬리 끝 → 꼬리 윗선 → 띠 윗선을 한 줄로 잇고 이웃 점끼리만 매끄럽게 (양 끝은 그대로) — 띠와 꼬리 사이 실제 물결
    // (눈꼬리 근처에서 살짝 내려갔다 꼬리로 올라감)은 남고 툭 꺾이는 곳만 부드러워진다 (사용자: 부채꼴 말고 뗀 화장처럼 물결, 시험 W1).
    // 위로 볼록하게 메웠더니 띠 꼭대기에서 꼬리 끝까지 곧은 선으로 건너가 부채꼴이 됐다
    const upper = smoothChain([tip, ...[...wingTop].reverse(), ...[...top].reverse()], PART_GUIDE.waveSmooth);
    linerTop[s] = [...upper].reverse();   // 눈머리 → 꼬리 끝 — 섀도가 이 선 위에 꼬리 끝까지 놓인다
    return (linerPoly[s] = [...base, ...upper]);
  }, "mixed");

  // 섀도 (사용자 그림 2026-10-14) — 경계 없이 펴 바르는 화장이라 정확한 영역은 따지 않는다 (뗀 영역이 다시 그린 자리 전체의 옅은
  // 변화까지 잡혀 흔들렸다). 테두리는 칠해도 되는 최대 범위인 돔: 라이너 윗선(없으면 눈꺼풀) 위로 눈머리에서 둥글게 올라가 눈썹 아래까지,
  // 눈꼬리 바깥으로 나가 눈꼬리 높이 조금 아래까지 감싸 내려온다. 화장 정도는 화살표로 — 라이너 윗선 위 점 셋(눈머리 쪽 · 가운데 ·
  // 눈꼬리 쪽)에서 위 → 대각선 → 바깥으로, 길이는 그쪽으로 섀도가 실제로 퍼진 만큼(테두리 안까지). 눈 밑 섀도 · 진하기는 뺀다
  const shadowBase = (s: Side) => samples(linerTop[s] ?? lidOf(s, true), PART_GUIDE.profileN + 1);
  /** 라이너 띠 밖으로 밀어 올린 섀도 아랫선 (눈머리 → 눈꼬리 · 꼬리 끝) */
  const shadowFloor = (s: Side) => {
    const all = shadowBase(s), nrm = normals(all, F[s].up), liner = linerPoly[s];
    return all.map((p, i) => (liner ? pushOut(p, nrm[i]!, liner) : p));
  };
  /** 점 셋 — 아랫선 중 눈 안쪽 폭(눈꼬리까지)에서 shadowDotAt 자리 */
  const shadowDots = (s: Side) => {
    const span = shadowFloor(s).filter((p) => F[s].to(p).s <= 0);
    return span.length < 3 ? [] : PART_GUIDE.shadowDotAt.map((t) => span[Math.round(t * (span.length - 1))]!);
  };
  /** k 번째 화살표 방향 — 바깥에서 위로 shadowArrowDeg 도 */
  const shadowDir = (f: EyeFrame, k: number): Pt => {
    const a = (PART_GUIDE.shadowArrowDeg[k]! * Math.PI) / 180;
    return { x: f.out.x * Math.cos(a) + f.up.x * Math.sin(a), y: f.out.y * Math.cos(a) + f.up.y * Math.sin(a) };
  };
  const shadowMarks: Partial<Record<Side, SpreadMarks>> = {};
  both("shadow", (inside, f, s) => {
    const base = shadowBase(s), nrm = normals(base, f.up);
    // 칸 높이는 라이너 윗선 쪽에서 이어진 섀도 끝까지 — 가장 먼 픽셀까지 재니 살을 두고 떨어진 위쪽 띠(다시 그린 눈썹 자리 · 얼룩)까지 올라가
    // 섀도가 눈썹 밑까지 꽉 찼다 (실사진 2026-10-09, 시험 SH6). 지금은 섀도가 있는지만 본다
    const run = (p: Pt, d: Pt) => runReach(inside, p, d, PART_GUIDE.shadowStart * f.ew, PART_GUIDE.shadowGap * f.ew, PART_GUIDE.shadowMax * f.ew);
    // 화살표 길이 — 점에서 그 방향으로 이어진 섀도 끝까지. 라이너 바로 위 띠는 라이너로 떼어 가서 섀도는 점에서 조금 떨어져 시작하고
    // (shadowArrowStart 안), 펴 바른 섀도는 군데군데 비어 shadowArrowSkip 까지는 끊겨도 잇는다 — 처음 값(0.08 · 0.05)으론 실사진 화살표가 거의 다 가장 짧았다
    const spread = shadowDots(s).map((d, k) => runReach(inside, d, shadowDir(f, k), PART_GUIDE.shadowArrowStart * f.ew, PART_GUIDE.shadowArrowSkip * f.ew, PART_GUIDE.shadowMax * f.ew) / f.ew);
    return { prof: base.map((p, i) => run(p, nrm[i]!) / f.ew), ext: shadowExt(inside, f, base[base.length - 1]!), spread };
  }, (a, b) => ({
    prof: a.prof.map((x, i) => (x + b.prof[i]!) / 2), ext: a.ext && b.ext ? avgExt(a.ext, b.ext) : a.ext ?? b.ext,
    spread: a.spread.map((x, i) => (x + (b.spread[i] ?? x)) / 2),
  }), ({ prof, ext, spread }, f, s) => {
    // 눈머리부터 라이너 꼬리 끝까지(라이너가 없으면 눈꼬리까지) 부채꼴 — 높이는 칸마다 보이는 대로 재서 이웃 칸끼리 다듬고
    // (5칸 중앙값 → 3칸 평균), 윗선은 그중 가장 높은 점들만 잇는다(아래). 눈머리 끝은 아랫선으로 내려와 닫힌다 (사용자 2026-10-07, 시험 SH1 · SH2).
    // 그 바깥으로 섀도가 더 번졌으면 칸마다 아래 · 위 끝을 따라 거기까지 (사용자: 뗀 섀도보다 범위가 모자라다, 시험 SH3)
    if (!prof.some((x) => x >= PART_GUIDE.minH) && !ext) return [];
    // 틀 (사용자 2026-10-09: 눈 위부터 눈썹 아래까지를 범위로, 부채꼴 · 사다리꼴) — 사진에서는 섀도가 있는지와 바깥 끝(라이너 꼬리 끝 ·
    // 더 번졌으면 거기)만 읽는다. 칸마다 보이는 높이로 그렸더니 다시 그린 자리 전체의 옅은 변화까지 섀도로 잡혀 들쭉날쭉했다
    // 아랫선 = 라이너 윗선(라이너 띠 밖으로 밀어 올림) 중 눈머리 → 눈꼬리. 라이너 꼬리는 돔 안에 든다
    const base = shadowFloor(s).filter((p) => f.to(p).s <= 0);
    if (base.length < 2) return [];
    // 돔 = 사용자가 섀도 모양 잡기 화면에서 잡은 받침점(shadowShape)을 지나는 매끈한 곡선 — 눈꼬리 → 바깥 → 윗선 → 눈머리.
    // 받침점 세로 k 는 그 자리 눈꺼풀(0) ~ 눈썹 아랫선 − browGap(1) 사이 비율이라 눈썹이 높거나 낮은 얼굴에도 같은 모양으로 맞는다.
    // 눈썹 끝보다 바깥은 눈썹 끝 높이, 눈꼬리보다 바깥은 눈꼬리 높이를 잇는다
    const lid = (s === "R" ? LM.eyeA : LM.eyeB).upper.map((i) => f.to(P(i))).sort((p, q) => p.s - q.s);
    const bl = (s === "R" ? LM.browA : LM.browB).lower.map((i) => f.to(P(i))).sort((p, q) => p.s - q.s);
    const at = ([x, k]: readonly [number, number]): SV => {
      const lv = lerpSV(lid, x);
      return { s: x, v: lv + k * (lerpSV(bl, x) - PART_GUIDE.browGap - lv) };
    };
    const ctrl: SV[] = [f.to(base[base.length - 1]!), ...PART_GUIDE.shadowShape.map(at), f.to(base[0]!)];
    const chain = resample(spline(ctrl.map((q) => f.from(q))), PART_GUIDE.shadowStep * f.ew);
    // 눈썹 가이드와 겹치지 않게 — 들어가거나 browGap 보다 붙은 점은 아래로 내린다 (실사진 2026-10-09: 섀도와 눈썹 가이드가 겹쳤다, 시험 SH7)
    const brow = out.find((g) => g.part === "brow" && g.side === s)?.polys[0], gap = Math.max(2, PART_GUIDE.browGap * f.ew);
    const clear = (q: Pt) => {
      if (!brow) return q;
      for (let k = 0; k <= PART_GUIDE.shadowMax * f.ew; k += 0.5) {
        const r = add(q, f.up, -k);
        if (!pointInPoly(r.x, r.y, brow) && polyDist(r, brow) >= gap) return r;
      }
      return q;
    };
    const poly = [...base, ...chain.slice(1, -1).map(clear)];
    // 화살표 — 점에서 그 방향으로 섀도가 퍼진 만큼 (짧아도 shadowArrowMin 은 보이게), 테두리 밖으로는 안 나간다
    const inPoly = (q: Pt) => pointInPoly(q.x, q.y, poly);
    const dots = shadowDots(s), arrows = dots.map((d, k) => {
      const dir = shadowDir(f, k);
      let edge = 0;
      while (edge < 3 * f.ew && inPoly(add(d, dir, edge + 0.5))) edge += 0.5;
      const L = Math.min(Math.max(PART_GUIDE.shadowArrowMin, spread[k] ?? 0) * f.ew, 0.92 * edge);
      return [add(d, dir, Math.min(L, PART_GUIDE.shadowArrowGap * f.ew)), add(d, dir, L)];
    });
    shadowMarks[s] = { dots, arrows };
    return poly;
  }, "mixed");
  for (const g of out) { const m = g.part === "shadow" && g.side ? shadowMarks[g.side] : undefined; if (m) g.marks = m; }

  // 아래 섀도는 가이드를 그리지 않는다 (사용자 2026-10-09: 일단 없애기, 시험 U1). 떼기는 그대로 — 그 자리 화장이 다른 부위로 안 잡히게

  // 블러셔 (사용자 2026-10-14) — 경계 없이 펴 바르는 그러데이션이라 영역을 따지 않는다. 뗀 볼 영역은 모델이 볼 피부 전체를 조금씩
  // 바꿔 네모 덩어리로 잡혔고, 그 덩어리로 잰 타원은 실제 블러셔보다 컸다 (실사진 17장). 테두리는 사용자가 블러셔 모양 잡기 화면에서
  // 잡은 범위(cheekShape)를 지나는 닫힌 매끈한 곡선 — 받침점 세로 k 는 그 자리 아래 눈꺼풀(0) ~ 입꼬리 높이(1) 비율이라 얼굴 길이가
  // 달라도 같은 자리에 맞는다. 실제 얼굴 윤곽(face) 밖으로 나간 점만 가운데 쪽으로 당긴다 — 화장 영역을 거르는 clip(윤곽 90%)으로
  // 자르면 사용자가 그 선 너머까지 잡은 바깥쪽이 줄었다 (블러셔 모양 잡기 화면과 21px 차이).
  // 볼에 화장이 잡혔을 때만 그린다 (가장 큰 덩어리가 있어야 — 흩어진 작은 점은 블러셔가 아니다)
  both<boolean>("cheek", (_inside, f, _s, m) => {
    const main = maskOutlines(m, w, h, { close: Math.max(1, Math.round(f.ew * 0.06)) })[0];
    return main && main.length >= 3 ? true : null;
  }, (a) => a, (_v, f, s) => {
    const low = (s === "R" ? LM.eyeA : LM.eyeB).lower.map((i) => f.to(P(i))).sort((p, q) => p.s - q.s);
    const mouthV = f.to(P(s === "R" ? 61 : 291)).v;   // 그쪽 입꼬리 (61 = 사진 왼쪽)
    const pts = PART_GUIDE.cheekShape.map(([x, k]) => { const lv = lerpSV(low, x); return f.from({ s: x, v: lv + k * (mouthV - lv) }); });
    const ring = resample([...splineClosed(pts), pts[0]!], PART_GUIDE.shadowStep * f.ew).slice(0, -1);
    const clip = opts.face;
    if (!clip) return ring;
    const c = ring.reduce((a, q) => ({ x: a.x + q.x / ring.length, y: a.y + q.y / ring.length }), { x: 0, y: 0 });
    return ring.map((q) => {
      for (let t = 0; t <= 1; t += 0.02) { const r = { x: q.x + (c.x - q.x) * t, y: q.y + (c.y - q.y) * t }; if (pointInPoly(r.x, r.y, clip)) return r; }
      return c;
    });
  }, "landmark");
  // 블러셔 안에 퍼지는 방향 — 가운데 점 + 사방 화살표 (사용자 2026-10-09, 시험 BL2). 그러데이션은 가운데에서 바깥으로
  for (const g of out) if (g.part === "cheek") g.marks = spreadMarks("cheek", g.polys);

  // 그 밖 부위 (있다면) — 화장 영역 테두리 그대로
  for (const [k, e] of masks) {
    const [part, side] = k.split(":") as [ExtractPart, string];
    if (["lip", "brow", "shadow", "underShadow", "liner", "cheek"].includes(part)) continue;
    const polys = maskOutlines(e.m, w, h);
    if (polys.length) out.push({ part, side: (side || null) as PartMask["side"], polys, count: e.count, from: "region" });
  }
  return out;
}

/** 입술선 — 다문 입이면 바깥선 하나, 벌린 입이면 [윗입술, 아랫입술] */
export function lipShapes(lm: readonly Pt[]): Pt[][] {
  const outer = LM.lipsOuter.map((i) => lm[i]!), inner = LIPS_INNER.map((i) => lm[i]!);
  const width = Math.hypot(outer[0]!.x - outer[10]!.x, outer[0]!.y - outer[10]!.y);
  const gap = Math.hypot(inner[5]!.x - inner[15]!.x, inner[5]!.y - inner[15]!.y);
  if (gap < PART_GUIDE.mouthOpen * width) return [outer];
  // 위: 바깥선 왼쪽 입꼬리 → 위 → 오른쪽, 속선 오른쪽 → 위 → 왼쪽 / 아래: 바깥선 오른쪽 → 아래 → 왼쪽, 속선 왼쪽 → 아래 → 오른쪽
  const upper = [...outer.slice(0, 11), ...inner.slice(0, 11).reverse()];
  const lower = [...outer.slice(10), outer[0]!, inner[0]!, ...inner.slice(10).reverse()];
  return [upper, lower];
}

/** 그쪽 눈꼬리 원점 · 바깥 방향 s · 위 v (눈 폭 단위). 위 방향은 두 눈꼬리 선에 수직 — 좌우가 거울로 맞는다 */
function eyeFrame(lm: readonly Pt[], side: Side): EyeFrame {
  const A = lm[LM.eyeA.outer]!, B = lm[LM.eyeB.outer]!, L = Math.hypot(B.x - A.x, B.y - A.y) || 1;
  const e = { x: (B.x - A.x) / L, y: (B.y - A.y) / L };
  let up = { x: e.y, y: -e.x };
  if (up.y > 0) up = neg(up);
  const ew = (Math.hypot(lm[33]!.x - lm[133]!.x, lm[33]!.y - lm[133]!.y) + Math.hypot(lm[263]!.x - lm[362]!.x, lm[263]!.y - lm[362]!.y)) / 2 || 1;
  const o = side === "R" ? A : B, out = side === "R" ? neg(e) : e;
  return {
    o, out, up, ew,
    from: (q) => ({ x: o.x + (out.x * q.s + up.x * q.v) * ew, y: o.y + (out.y * q.s + up.y * q.v) * ew }),
    to: (p) => ({ s: ((p.x - o.x) * out.x + (p.y - o.y) * out.y) / ew, v: ((p.x - o.x) * up.x + (p.y - o.y) * up.y) / ew }),
  };
}

type Wing = { sTip: number; vTip: number; top: number[] };
/** 섀도가 아랫선 끝(라이너 꼬리 끝) 바깥으로 번진 곳 — 끝에서 바깥으로 ds 만큼, 칸마다(눈 좌표) 아래 · 위 끝 */
type Ext = { ds: number; low: number[]; high: number[] };

/**
 * 아랫선 끝 바깥으로 눈 폭 2% 칸씩 가며 그 칸의 섀도 아래 · 위 끝을 잰다 (2칸 비면 끝). 칸 수 shadowExtN 으로 다시 잡아
 * 3칸 평균으로 다듬고, 마지막 칸은 아래 · 위가 가운데로 모이게 한다
 */
function shadowExt(inside: (q: Pt) => boolean, f: EyeFrame, end: Pt): Ext | null {
  const e = f.to(end), dv = 0.5 / f.ew, cols: { s: number; low: number; high: number }[] = [];
  let gap = 0;
  for (let s = e.s + 0.02; s <= e.s + PART_GUIDE.shadowExtMax; s += 0.02) {
    let low = Infinity, high = -Infinity;
    for (let v = e.v - 0.3; v <= e.v + PART_GUIDE.shadowMax; v += dv) if (inside(f.from({ s, v }))) { low = Math.min(low, v); high = Math.max(high, v); }
    if (high < low) { if (++gap > 2) break; continue; }
    gap = 0; cols.push({ s, low, high });
  }
  const last = cols[cols.length - 1];
  if (!last || last.s - e.s < 0.04) return null;
  const ds = last.s - e.s, K = PART_GUIDE.shadowExtN;
  const at = (s: number, key: "low" | "high") => {
    if (s <= cols[0]!.s) return key === "low" ? Math.min(e.v, cols[0]![key]) : cols[0]![key];
    let i = 0;
    while (i < cols.length - 1 && cols[i + 1]!.s < s) i++;
    const a = cols[i]!, b = cols[Math.min(cols.length - 1, i + 1)]!, k = b.s > a.s ? Math.min(1, (s - a.s) / (b.s - a.s)) : 0;
    return a[key] + (b[key] - a[key]) * k;
  };
  const grid = (key: "low" | "high") => {
    const r = Array.from({ length: K + 1 }, (_, k) => at(e.s + (ds * k) / K, key));
    return r.map((v, k) => (k === 0 || k === K ? v : (r[k - 1]! + v + r[k + 1]!) / 3));
  };
  const low = grid("low"), high = grid("high"), m = (low[K]! + high[K]!) / 2;
  low[K] = m; high[K] = m;
  return { ds, low, high };
}

function avgExt(a: Ext, b: Ext): Ext {
  return { ds: (a.ds + b.ds) / 2, low: a.low.map((v, i) => (v + b.low[i]!) / 2), high: a.high.map((v, i) => (v + b.high[i]!) / 2) };
}

/**
 * 꼬리 — 끝을 먼저 찾고(눈꼬리 밖 화장 영역에서 가장 먼 자리 + 그 둘레 높이 평균), 눈꼬리 띠 윗점 → 끝 직선을 기준으로 칸마다
 * 그 근처 줄의 윗선을 잰다 (없으면 직선). 눈꼬리부터 칸마다 이어 가며 찾았더니, 눈꼬리에 속눈썹이 뭉쳐 띠가 두껍게 재지거나
 * 꼬리가 살짝 끊기면 꼬리를 통째로 놓쳤다 (실사진, 시험 L6). 윗선은 3칸 평균으로 다듬는다
 */
function wingOf(inside: (q: Pt) => boolean, f: EyeFrame, th0: number, thin?: (q: Pt) => boolean): Wing | null {
  const R = Math.ceil(f.ew), cand: SV[] = [], dv = 0.5 / f.ew;
  for (let y = Math.floor(f.o.y - R); y <= f.o.y + R; y++) for (let x = Math.floor(f.o.x - R); x <= f.o.x + R; x++) {
    if (!inside({ x, y })) continue;
    const q = f.to({ x, y });
    if (q.s >= PART_GUIDE.wingMin && q.s <= PART_GUIDE.wingMax && Math.abs(q.v) < 0.5) cand.push(q);
  }
  let sTip = 0, vTip = th0 / 2;
  if (cand.length) {
    sTip = Math.max(...cand.map((q) => q.s));
    const nearTip = cand.filter((q) => q.s >= sTip - 0.03);
    vTip = nearTip.reduce((a, q) => a + q.v, 0) / nearTip.length;
  }
  // 가는 꼬리 끝: 속눈썹을 지운 영역(inside)의 끝에서, 지우기 전 영역(thin)으로 같은 방향 줄만 따라 더 간다 — 가는 꼬리는
  // 속눈썹과 함께 지워졌고, 위로 뻗은 속눈썹은 앞 칸 높이에서 멀어져 안 따라간다 (실사진, 시험 L12)
  if (thin) {
    let gap = 0;
    for (let s = sTip + 0.01; s <= PART_GUIDE.wingMax; s += 0.01) {
      let best: number | null = null, cur: { top: number; bot: number } | null = null;
      const consider = (r: { top: number; bot: number }) => { const c = (r.top + r.bot) / 2; if (Math.abs(c - vTip) <= PART_GUIDE.wingTrack && (best === null || Math.abs(c - vTip) < Math.abs(best - vTip))) best = c; };
      for (let v = -0.2; v <= 0.6; v += dv) {
        if (thin(f.from({ s, v }))) { if (cur) cur.top = v; else cur = { top: v, bot: v }; }
        else if (cur) { consider(cur); cur = null; }
      }
      if (cur) consider(cur);
      if (best === null) { if (++gap > 3) break; continue; }
      gap = 0; sTip = s; vTip = best;
    }
  }
  if (sTip < PART_GUIDE.wingMin) return null;
  const raw = Array.from({ length: PART_GUIDE.wingN + 1 }, (_, k) => {
    const u = k / PART_GUIDE.wingN, s = u * sTip, want = th0 + (vTip - th0) * u, runs: { top: number; bot: number }[] = [];
    let cur: { top: number; bot: number } | null = null;
    for (let v = -0.2; v <= 0.6; v += dv) {
      if (inside(f.from({ s, v }))) { if (cur) cur.top = v; else cur = { top: v, bot: v }; }
      else if (cur) { runs.push(cur); cur = null; }
    }
    if (cur) runs.push(cur);
    const gap = (r: { top: number; bot: number }) => (want > r.top ? want - r.top : want < r.bot ? r.bot - want : 0);
    const best = runs.sort((a, b) => gap(a) - gap(b))[0];
    return best && gap(best) <= PART_GUIDE.wingTrack ? best.top : want;
  });
  const top = raw.map((v, k) => (k === 0 || k === raw.length - 1 ? v : (raw[k - 1]! + v + raw[k + 1]!) / 3));
  return { sTip, vTip, top };
}

function avgWing(a: Wing, b: Wing): Wing {
  return { sTip: (a.sTip + b.sTip) / 2, vTip: (a.vTip + b.vTip) / 2, top: a.top.map((v, i) => (v + b.top[i]!) / 2) };
}

/** 열린 꺾은선을 step 간격으로 다시 찍는다 (양 끝 포함) */
function resample(line: readonly Pt[], step: number): Pt[] {
  const len = line.slice(1).reduce((a, b, i) => a + Math.hypot(b.x - line[i]!.x, b.y - line[i]!.y), 0);
  return samples(line, Math.max(2, Math.round(len / Math.max(step, 0.5)) + 1));
}

/** 열린 꺾은선을 이웃 3점 평균으로 n 번 다듬는다 (양 끝 점은 그대로) */
function smoothChain(chain: readonly Pt[], n: number): Pt[] {
  let c = [...chain];
  for (let k = 0; k < n; k++) c = c.map((p, i) => (i === 0 || i === c.length - 1 ? p : { x: (c[i - 1]!.x + p.x + c[i + 1]!.x) / 3, y: (c[i - 1]!.y + p.y + c[i + 1]!.y) / 3 }));
  return c;
}

/**
 * 라이너 자리(윗눈꺼풀 위 눈 폭 0.3 · 눈꼬리 밖 꼬리 자리)에서 가장 진한 픽셀 — 밝기 오츠로 살 / 어두운 쪽을 나누고, 어두운 쪽을
 * 한 번 더 나눠 섀도(갈색)와 라이너(검정)를 가른다. 두 번째로 나눈 두 쪽 밝기가 25 넘게 차이 날 때만 (섀도가 없으면 라이너 테두리만 잘려서).
 * 눈꺼풀 띠 쪽에서 이어진 것만 남긴다
 */
function linerDark(im: RgbaImage, lid: readonly Pt[], f: EyeFrame): { solid: Uint8Array; raw: Uint8Array } | null {
  const sv = lid.map((p) => f.to(p)).sort((a, b) => a.s - b.s);
  const lidV = (s: number) => {
    let i = 0;
    while (i < sv.length - 2 && sv[i + 1]!.s < s) i++;
    const a = sv[i]!, b = sv[i + 1]!, k = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
    return a.v + (b.v - a.v) * k;
  };
  const zone = (q: SV) => (q.s >= sv[0]!.s && q.s <= 0 ? q.v >= lidV(q.s) - 0.03 && q.v <= lidV(q.s) + 0.3 : q.s > 0 && q.s <= 0.6 && q.v >= -0.15 && q.v <= 0.4);
  const R = Math.ceil(1.3 * f.ew), pix: number[] = [], L: number[] = [];
  for (let y = Math.max(0, Math.floor(f.o.y - R)); y <= Math.min(im.h - 1, f.o.y + R); y++) {
    for (let x = Math.max(0, Math.floor(f.o.x - R)); x <= Math.min(im.w - 1, f.o.x + R); x++) {
      if (!zone(f.to({ x, y }))) continue;
      const i = (y * im.w + x) * 4;
      pix.push(y * im.w + x); L.push(0.299 * im.data[i]! + 0.587 * im.data[i + 1]! + 0.114 * im.data[i + 2]!);
    }
  }
  if (pix.length < 20) return null;
  const t1 = otsu(L), darkL = L.filter((v) => v <= t1);
  let thr = t1;
  if (darkL.length >= 10) {
    const t2 = otsu(darkL), lo = darkL.filter((v) => v <= t2), hi = darkL.filter((v) => v > t2);
    const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / (v.length || 1);
    if (lo.length && hi.length && mean(hi) - mean(lo) > 25) thr = t2;
  }
  const dark = new Uint8Array(im.w * im.h);
  pix.forEach((i, k) => { if (L[k]! <= thr) dark[i] = 1; });
  // 눈꺼풀 띠 쪽(눈꼬리 안) 진한 픽셀에서 이어진 것만 — 꼬리 자리 끝 관자놀이 머리카락까지 꼬리로 잡혔다 (실사진, 시험 L11)
  const connected = (src: Uint8Array) => {
    const m = new Uint8Array(im.w * im.h), stack: number[] = [];
    for (const i of pix) if (src[i] && f.to({ x: i % im.w, y: Math.floor(i / im.w) }).s <= 0) { m[i] = 1; stack.push(i); }
    while (stack.length) {
      const i = stack.pop()!, x = i % im.w, y = (i - x) / im.w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, j = ny * im.w + nx;
        if (nx >= 0 && ny >= 0 && nx < im.w && ny < im.h && src[j] && !m[j]) { m[j] = 1; stack.push(j); }
      }
    }
    return m;
  };
  // 가는 가닥(마스카라 속눈썹)은 깎았다 다시 붙이기로 지운 것(solid)으로 띠 두께 · 꼬리 윗선을 잰다 — 속눈썹까지 라이너로 잡혀
  // 띠가 두꺼워지고 꼬리와 뭉쳤다 (실사진, 시험 L12). 지우기 전(raw)은 가는 꼬리 끝을 따라갈 때만
  const r = Math.max(1, Math.round(PART_GUIDE.lashOpen * f.ew));
  return { solid: connected(dilate(erode(dark, im.w, im.h, r), im.w, im.h, r)), raw: connected(dark) };
}

/** 깎기 — 둘레 (2r+1)² 가 다 칠해진 곳만 남는다 */
export function erode(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = r; y < h - r; y++) for (let x = r; x < w - r; x++) {
    if (!m[y * w + x]) continue;
    let all = true;
    for (let dy = -r; dy <= r && all; dy++) for (let dx = -r; dx <= r; dx++) if (!m[(y + dy) * w + x + dx]) { all = false; break; }
    if (all) out[y * w + x] = 1;
  }
  return out;
}

/** 붙이기 — 칠한 곳 둘레 (2r+1)² 를 칠한다 */
export function dilate(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!m[y * w + x]) continue;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h) out[ny * w + nx] = 1;
    }
  }
  return out;
}

/** 오츠 문턱 (0~255 밝기) — 두 무리 사이 분산이 가장 큰 자리 */
function otsu(vals: readonly number[]): number {
  const hist = new Array<number>(256).fill(0);
  for (const v of vals) hist[Math.max(0, Math.min(255, Math.round(v)))]!++;
  const n = vals.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i]!;
  let wB = 0, sB = 0, best = -1, thr = 0;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]!; if (!wB || wB === n) continue;
    sB += t * hist[t]!;
    const mB = sB / wB, mF = (sum - sB) / (n - wB), between = wB * (n - wB) * (mB - mF) ** 2;
    if (between > best) { best = between; thr = t; }
  }
  return thr;
}



/** a 가 b 보다 방향 d 쪽으로 얼마나 더 나갔나 */
const dot = (a: Pt, b: Pt, d: Pt): number => (a.x - b.x) * d.x + (a.y - b.y) * d.y;

function polyDist(q: Pt, poly: readonly Pt[]): number {
  return Math.min(...poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length]!, dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / L)) : 0;
    return Math.hypot(q.x - a.x - t * dx, q.y - a.y - t * dy);
  }));
}

/** 점 p 에서 방향 d 로 최대 maxPx 까지 — 화장 영역의 가장 먼 픽셀 거리 (없으면 0, 사이가 비어도 더 간다) */
function reach(inside: (q: Pt) => boolean, p: Pt, d: Pt, maxPx: number): number {
  let last = 0;
  for (let k = 0; k <= maxPx; k += 0.5) if (inside(add(p, d, k))) last = k;
  return last;
}

/** 점 p 에서 방향 d 로 — startMax px 안에서 시작해 gapPx 넘게 끊기지 않고 이어진 화장 영역의 끝까지 거리 (없으면 0) */
function runReach(inside: (q: Pt) => boolean, p: Pt, d: Pt, startMax: number, gapPx: number, maxPx: number): number {
  let start = -1, end = 0, gap = 0;
  for (let k = 0; k <= maxPx; k += 0.5) {
    if (inside(add(p, d, k))) { if (start < 0) { if (k > startMax) break; start = k; } end = k; gap = 0; }
    else if (start >= 0 && (gap += 0.5) > gapPx) break;
  }
  return start >= 0 ? end : 0;
}

/** 점 p 에서 방향 d 로 — startMax px 안에서 시작하는 화장 띠 두께 (1px 끊김은 잇는다). 없으면 0 */
function runFrom(inside: (q: Pt) => boolean, p: Pt, d: Pt, startMax: number, maxPx: number): number {
  let start = -1, end = -1, gap = 0;
  for (let k = 0; k <= maxPx; k += 0.5) {
    if (inside(add(p, d, k))) { if (start < 0) { if (k > startMax) break; start = k; } end = k; gap = 0; }
    else if (start >= 0 && ++gap > 2) break;
  }
  return start >= 0 ? end - start + 0.5 : 0;
}

/** 꺾은선 점마다 선에 수직인 방향 (up 쪽) */
function normals(line: readonly Pt[], up: Pt): Pt[] {
  return line.map((_, i) => {
    const a = line[Math.max(0, i - 1)]!, b = line[Math.min(line.length - 1, i + 1)]!, L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const n = { x: -(b.y - a.y) / L, y: (b.x - a.x) / L };
    return n.x * up.x + n.y * up.y < 0 ? neg(n) : n;
  });
}

/** 다각형 안에 든 점을 방향 n 으로 밀어 밖으로 (0.25px 씩, 최대 100px) */
function pushOut(p: Pt, n: Pt, poly: readonly Pt[]): Pt {
  let q = p;
  for (let k = 0; k < 400 && pointInPoly(q.x, q.y, poly); k++) q = add(q, n, 0.25);
  return q;
}

/** 꺾은선을 길이 따라 n 점으로 */
function samples(line: readonly Pt[], n: number): Pt[] {
  const seg = line.slice(1).map((b, i) => Math.hypot(b.x - line[i]!.x, b.y - line[i]!.y)), total = seg.reduce((a, b) => a + b, 0) || 1;
  return Array.from({ length: n }, (_, k) => {
    let d = (total * k) / (n - 1), i = 0;
    while (i < seg.length - 1 && d > seg[i]!) { d -= seg[i]!; i++; }
    const a = line[i]!, b = line[i + 1] ?? a, t = seg[i] ? Math.min(1, d / seg[i]!) : 0;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  });
}

/** 2차 곡선 맞추기 (최소제곱) — 점이 셋 못 되면 평균 */
function quadFit(t: readonly number[], y: readonly number[]): (x: number) => number {
  const n = t.length;
  const mean = y.reduce((a, b) => a + b, 0) / (n || 1);
  if (n < 3) return () => mean;
  const S = (f: (i: number) => number) => t.reduce((a, _, i) => a + f(i), 0);
  const M = [[n, S((i) => t[i]!), S((i) => t[i]! ** 2)], [0, 0, S((i) => t[i]! ** 3)], [0, 0, S((i) => t[i]! ** 4)]];
  M[1]![0] = M[0]![1]!; M[1]![1] = M[0]![2]!; M[2]![0] = M[0]![2]!; M[2]![1] = M[1]![2]!;
  const B = [S((i) => y[i]!), S((i) => t[i]! * y[i]!), S((i) => t[i]! ** 2 * y[i]!)];
  const det = (m: number[][]) => m[0]![0]! * (m[1]![1]! * m[2]![2]! - m[1]![2]! * m[2]![1]!) - m[0]![1]! * (m[1]![0]! * m[2]![2]! - m[1]![2]! * m[2]![0]!) + m[0]![2]! * (m[1]![0]! * m[2]![1]! - m[1]![1]! * m[2]![0]!);
  const D = det(M);
  if (Math.abs(D) < 1e-12) return () => mean;
  const c = [0, 1, 2].map((j) => det(M.map((row, r) => row.map((v, k) => (k === j ? B[r]! : v)))) / D);
  return (x) => c[0]! + c[1]! * x + c[2]! * x * x;
}


const neg = (p: Pt): Pt => ({ x: -p.x, y: -p.y });
const add = (a: Pt, d: Pt, k: number): Pt => ({ x: a.x + d.x * k, y: a.y + d.y * k });
const median = (v: readonly number[]): number => { const s = [...v].sort((a, b) => a - b); return s.length ? s[s.length >> 1]! : 0; };

const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** 점들을 그대로 지나는 매끈한 닫힌 곡선 (캣멀-롬, 구간마다 k 칸) */
function splineClosed(p: readonly Pt[], k = 8): Pt[] {
  const n = p.length, q = (i: number) => p[((i % n) + n) % n]!, out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = q(i - 1), p1 = q(i), p2 = q(i + 1), p3 = q(i + 2);
    for (let j = 0; j < k; j++) {
      const t = j / k, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  return out.filter((pt, i) => i === 0 || Math.hypot(pt.x - out[i - 1]!.x, pt.y - out[i - 1]!.y) > 1e-6);
}

/** 점들을 그대로 지나는 매끈한 열린 곡선 (캣멀-롬, 구간마다 k 칸) */
/** 눈 좌표 꺾은선(s 순서)에서 s 자리의 v — 양 끝 밖은 끝 값 그대로 */
function lerpSV(arr: readonly SV[], x: number): number {
  if (x <= arr[0]!.s) return arr[0]!.v;
  for (let k = 1; k < arr.length; k++) if (x <= arr[k]!.s) { const p = arr[k - 1]!, q = arr[k]!; return p.v + ((q.v - p.v) * (x - p.s)) / (q.s - p.s || 1); }
  return arr[arr.length - 1]!.v;
}

function spline(p: readonly Pt[], k = 8): Pt[] {
  if (p.length < 3) return [...p];
  const q = (i: number) => p[Math.max(0, Math.min(p.length - 1, i))]!, out: Pt[] = [];
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = q(i - 1), p1 = q(i), p2 = q(i + 1), p3 = q(i + 2);
    for (let j = 0; j < k; j++) {
      const t = j / k, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  out.push(p[p.length - 1]!);
  return out;
}
