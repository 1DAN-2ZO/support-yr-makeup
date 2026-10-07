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
 *    섀도: 라이너 윗선 위에서 겹치지 않게, 눈머리부터 라이너 꼬리 끝까지 부채꼴 — 높이는 칸마다 보이는 그대로(이웃끼리 다듬기),
 *      그 바깥으로 더 번졌으면 칸마다 아래 · 위 끝을 따라 거기까지 (사용자 2026-10-07)
 *    아래 섀도: 아랫눈꺼풀에서 내려간 높이를 매끈한 2차 곡선으로
 *    블러셔: 화장 영역 모멘트 타원
 *  - 쉐딩 · 하이라이트(참고)는 뺀다. clip 밖 픽셀(klein 이면 얼굴 윤곽 0.9 밖 — 원본에 되붙인 경계 차이)도 뺀다.
 */

import { pointInPoly, type RgbaImage } from "./color";
import { LM } from "./landmarks";
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
}

/**
 * mouthOpen: 속입술 위아래가 입 폭의 이 비율 넘게 벌어지면 벌린 입 · profileN: 섀도 높이를 잴 눈꺼풀 칸 수 ·
 * shadowMax · underMax · browMax: 높이 · 두께를 찾을 거리(눈 폭) · minH: 이보다 낮은 칸은 섀도 없음 ·
 * wingMin: 눈꼬리 밖으로 이만큼 넘어야 꼬리 ·
 * taper: 섀도 양 끝에서 이 비율 구간 동안 눈꺼풀로 내려온다 · linerStart · linerMax · linerMin: 라이너 띠는 눈꺼풀에서 이만큼 안에서
 * 시작하는 줄, 두께는 이 사이 · wingMax: 꼬리를 찾는 거리 · wingTrack: 앞 칸 윗선에서 이만큼 안의 줄만 잇는다 · wingN: 꼬리 윗선 칸 수 ·
 * waveSmooth: 꼬리 끝 → 띠 윗선을 이웃 3점 평균으로 다듬는 횟수 · wingTaper: 꼬리 끝에서 이 비율 구간은 끝으로 곧게 모인다 ·
 * lashOpen: 라이너 진한 픽셀에서 이 굵기(눈 폭 비율)보다 가는 가닥(마스카라 속눈썹)은 지운다 ·
 * shadowExtMax · shadowExtN: 섀도가 라이너 꼬리 끝 바깥으로 번진 곳을 찾는 거리(눈 폭) · 다시 잡는 칸 수
 * (전부 눈 폭 비율). 눈대중 시작값
 */
export const PART_GUIDE = {
  mouthOpen: 0.06, profileN: 24, shadowMax: 1.0, underMax: 0.6, browMax: 0.4, minH: 0.03,
  wingMin: 0.03, taper: 0.2, linerStart: 0.06, linerMax: 0.3, linerMin: 0.015, wingMax: 0.8, wingTrack: 0.06, wingN: 10, waveSmooth: 3, wingTaper: 0.3, shadowExtMax: 0.8, shadowExtN: 8, lashOpen: 0.012,
} as const;

type SV = { s: number; v: number };
interface EyeFrame { o: Pt; out: Pt; up: Pt; ew: number; from: (q: SV) => Pt; to: (p: Pt) => SV }

export function partGuides(parts: readonly PartMask[], lm: readonly Pt[], w: number, h: number, opts: { clip?: readonly Pt[]; made?: RgbaImage } = {}): PartGuide[] {
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

  // 눈썹: 위 · 아래 넓힐 두께
  const browLines = (s: Side) => { const b = s === "R" ? LM.browA : LM.browB; return { up: b.upper.map(P), lo: b.lower.map(P) }; };
  both("brow", (inside, f, s) => {
    const { up, lo } = browLines(s);
    // AI 화장 사진이 있으면 실제 어두운 눈썹 털에 맞춰 줄이거나 넓힌다 — 원래 눈썹(얼굴 점)보다 얇게 그리면 윗부분 빈 살까지 잡았다 (실사진, 시험 B2)
    const dark = opts.made ? darkIn(opts.made, [...up, ...[...lo].reverse()], PART_GUIDE.browMax * f.ew * 0.5) : null;
    if (dark) {
      // 눈썹 가운데 선에서 위 · 아래로 이어진 어두운 부분만 (살로 끊기면 멈춤) — 가장 먼 어두운 픽셀까지 재니
      // 옅은 눈썹에서 위쪽 그늘 · 머리카락까지 잡혀 커졌다 (실사진, 시험 B3)
      const U9 = samples(up, 9), L9 = samples(lo, 9), dUs: number[] = [], dLs: number[] = [];
      for (let k = 0; k < 9; k++) {
        const c = mid(U9[k]!, L9[k]!);
        if (!dark(c)) continue;
        const t = runOut(dark, c, f.up, PART_GUIDE.browMax * f.ew), b2 = runOut(dark, c, neg(f.up), PART_GUIDE.browMax * f.ew);
        dUs.push(dot(add(c, f.up, t), U9[k]!, f.up)); dLs.push(dot(L9[k]!, add(c, f.up, -b2), f.up));
      }
      if (dUs.length >= 3) return { dU: median(dUs) / f.ew, dL: median(dLs) / f.ew };
    }
    const dU = median(samples(up, 9).map((p) => reach(inside, p, f.up, PART_GUIDE.browMax * f.ew))) / f.ew;
    const dL = median(samples(lo, 9).map((p) => reach(inside, p, neg(f.up), PART_GUIDE.browMax * f.ew))) / f.ew;
    return { dU, dL };
  }, (a, b) => ({ dU: (a.dU + b.dU) / 2, dL: (a.dL + b.dL) / 2 }), ({ dU, dL }, f, s) => {
    // 아치: 꼬리는 위 · 아래 선이 한 점으로 모이고(그 점을 두 번 넣어 뾰족하게), 앞머리는 둥글게 — 닫힌 매끈한 곡선.
    // 위 · 아래 선을 따로 그려 이었더니 꼬리 · 앞머리가 뚝 잘린 사다리꼴이었다 (실사진, 시험 B1)
    const { up, lo } = browLines(s), U = up.map((p) => add(p, f.up, dU * f.ew)), L = lo.map((p) => add(p, f.up, -dL * f.ew));
    const n = U.length - 1, tail = mid(U[0]!, L[0]!), d = { x: U[n]!.x - U[n - 1]!.x, y: U[n]!.y - U[n - 1]!.y }, dl = Math.hypot(d.x, d.y) || 1;
    const head = add(mid(U[n]!, L[n]!), { x: d.x / dl, y: d.y / dl }, 0.25 * Math.hypot(U[n]!.x - L[n]!.x, U[n]!.y - L[n]!.y));
    return splineClosed([tail, tail, ...U.slice(1), head, ...L.slice(1).reverse()]);
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
    // 두께는 이웃 칸끼리만 다듬는다 (5칸 중앙값 → 3칸 평균) — 보이는 그대로. 눈꺼풀 전체에 2차 곡선 하나로 맞추니
    // 절반만 칠한 라이너는 뭉개지고 눈꼬리에 꼬리 픽셀이 섞인 칸에 안쪽 띠까지 끌려갔다 (시험 L5 · L8). 칠하지 않은 칸은 얇은 선
    const raw = th.map((x) => (x > 0 ? x : PART_GUIDE.linerMin)), med = raw.map((_, i) => median(raw.slice(Math.max(0, i - 2), i + 3)));
    const sm = med.map((_, i) => { const w = med.slice(Math.max(0, i - 1), i + 2); return w.reduce((a, b) => a + b, 0) / w.length; });
    const tAt = (i: number) => Math.min(PART_GUIDE.linerMax, Math.max(PART_GUIDE.linerMin, sm[i]!));
    const base = samples(lidOf(s, true), PART_GUIDE.profileN + 1), nrm = normals(base, f.up);
    const top = base.map((p, i) => add(p, nrm[i]!, tAt(i) * f.ew));
    linerTop[s] = top;
    if (!wing) return (linerPoly[s] = [...base, ...[...top].reverse()]);
    // 꼬리 윗선: 눈꼬리 띠 윗점과 꼬리 끝 사이 — 둘 중 낮은 쪽보다 아래로는 안 내려간다 (갈고리 · 홈 방지)
    const tip = f.from({ s: wing.sTip, v: wing.vTip }), c = f.to(top[top.length - 1]!);
    const wingTop = wing.top.slice(1, -1).map((v, k) => {
      const u = (k + 1) / PART_GUIDE.wingN, q = { s: c.s + (wing.sTip - c.s) * u, v: Math.max(v, Math.min(c.v, wing.vTip)) };
      return f.from(q);
    }).filter((p, k) => f.to(p).s > c.s && (k + 1) / PART_GUIDE.wingN <= 1 - PART_GUIDE.wingTaper);
    // 꼬리 끝 wingTaper 구간은 윗선을 빼서 끝으로 곧게 모이게 — 그대로 두니 끝 바로 앞까지 높다가 꺾여 뭉툭하게 잘렸다 (실사진, 시험 L10)
    // 윗선 = 꼬리 끝 → 꼬리 윗선 → 띠 윗선을 한 줄로 잇고 이웃 점끼리만 매끄럽게 (양 끝은 그대로) — 띠와 꼬리 사이 실제 물결
    // (눈꼬리 근처에서 살짝 내려갔다 꼬리로 올라감)은 남고 툭 꺾이는 곳만 부드러워진다 (사용자: 부채꼴 말고 뗀 화장처럼 물결, 시험 W1).
    // 위로 볼록하게 메웠더니 띠 꼭대기에서 꼬리 끝까지 곧은 선으로 건너가 부채꼴이 됐다
    const upper = smoothChain([tip, ...[...wingTop].reverse(), ...[...top].reverse()], PART_GUIDE.waveSmooth);
    linerTop[s] = [...upper].reverse();   // 눈머리 → 꼬리 끝 — 섀도가 이 선 위에 꼬리 끝까지 놓인다
    return (linerPoly[s] = [...base, ...upper]);
  }, "mixed");

  // 섀도: 라이너 윗선(라이너가 없으면 눈꺼풀)에서 올라간 높이 하나
  const shadowBase = (s: Side) => samples(linerTop[s] ?? lidOf(s, true), PART_GUIDE.profileN + 1);
  both("shadow", (inside, f, s) => {
    const base = shadowBase(s), nrm = normals(base, f.up);
    return { prof: base.map((p, i) => reach(inside, p, nrm[i]!, PART_GUIDE.shadowMax * f.ew) / f.ew), ext: shadowExt(inside, f, base[base.length - 1]!) };
  }, (a, b) => ({ prof: a.prof.map((x, i) => (x + b.prof[i]!) / 2), ext: a.ext && b.ext ? avgExt(a.ext, b.ext) : a.ext ?? b.ext }), ({ prof, ext }, f, s) => {
    // 눈머리부터 라이너 꼬리 끝까지(라이너가 없으면 눈꼬리까지) 부채꼴 — 높이는 칸마다 보이는 그대로, 이웃 칸끼리만 다듬는다
    // (5칸 중앙값 → 3칸 평균). 눈머리 끝은 아랫선으로 내려와 닫힌다 (사용자 2026-10-07, 시험 SH1 · SH2).
    // 그 바깥으로 섀도가 더 번졌으면 칸마다 아래 · 위 끝을 따라 거기까지 (사용자: 뗀 섀도보다 범위가 모자라다, 시험 SH3)
    if (!prof.some((x) => x >= PART_GUIDE.minH) && !ext) return [];
    const med = prof.map((_, i) => median(prof.slice(Math.max(0, i - 2), i + 3)));
    const sm = med.map((_, i) => { const w = med.slice(Math.max(0, i - 1), i + 2); return w.reduce((a, b) => a + b, 0) / w.length; });
    const n = sm.length - 1, smooth = (u: number) => (u >= 1 ? 1 : u <= 0 ? 0 : u * u * (3 - 2 * u));
    const taper = (i: number) => smooth((ext ? i : Math.min(i, n - i)) / (PART_GUIDE.taper * n));
    const all = shadowBase(s), nrm = normals(all, f.up), liner = linerPoly[s];
    // 라이너 안에 든 아랫선 점은 라이너 밖으로 밀어 올린다 (겹치지 않게)
    const base = all.map((p, i) => (liner ? pushOut(p, nrm[i]!, liner) : p));
    const top = base.map((p, i) => add(p, nrm[i]!, Math.max(0, sm[i]!) * taper(i) * f.ew));
    if (!ext) return [...base, ...[...top].reverse()];
    const e = f.to(base[base.length - 1]!), K = ext.low.length - 1;
    const lo = ext.low.slice(1).map((v, k) => f.from({ s: e.s + (ext.ds * (k + 1)) / K, v }));
    const hi = ext.high.slice(1).map((v, k) => f.from({ s: e.s + (ext.ds * (k + 1)) / K, v }));
    return [...base, ...lo, ...[...hi].reverse(), ...[...top].reverse()];
  }, "mixed");

  // 아래 섀도: 아랫눈꺼풀에서 내려간 높이 → 2차 곡선
  for (const [part, upper, maxH] of [["underShadow", false, PART_GUIDE.underMax]] as const) {
    both(part, (inside, f, s) => {
      const dir = upper ? f.up : neg(f.up);
      return samples(lidOf(s, upper), PART_GUIDE.profileN + 1).map((p) => reach(inside, p, dir, maxH * f.ew) / f.ew);
    }, (a, b) => a.map((x, i) => (x + b[i]!) / 2), (prof, f, s) => {
      const ts = prof.map((_, i) => i / PART_GUIDE.profileN), on = prof.map((x) => x >= PART_GUIDE.minH);
      const i0 = on.indexOf(true), i1 = on.lastIndexOf(true);
      if (i0 < 0 || i1 <= i0) return [];
      const t = ts.slice(i0, i1 + 1), fit = quadFit(t, prof.slice(i0, i1 + 1));
      // 양 끝은 눈꺼풀로 부드럽게 내려와 닫힌다 (초승달) — 그대로 두면 양 끝이 세로로 끊긴 네모였다 (실사진)
      const span = t[t.length - 1]! - t[0]!, taper = (x: number) => { const u = Math.min(x - t[0]!, t[t.length - 1]! - x) / (PART_GUIDE.taper * span); return u >= 1 ? 1 : u <= 0 ? 0 : u * u * (3 - 2 * u); };
      const dir = upper ? f.up : neg(f.up), lid = samples(lidOf(s, upper), PART_GUIDE.profileN + 1).slice(i0, i1 + 1);
      return [...lid, ...lid.map((p, i) => add(p, dir, Math.max(0, fit(t[i]!)) * taper(t[i]!) * f.ew)).reverse()];
    }, "mixed");
  }

  // 블러셔: 모멘트 타원 (눈 좌표)
  // 가장 큰 덩어리만 — 흩어진 작은 점(반짝이)까지 넣으니 눈부터 입까지 긴 타원이 됐다 (실사진)
  both("cheek", (_inside, f, _s, m) => {
    const main = maskOutlines(m, w, h, { close: Math.max(1, Math.round(f.ew * 0.06)) })[0];
    if (!main) return null;
    const xs = main.map((p) => p.x), ys = main.map((p) => p.y), pts: SV[] = [];
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
      if (pointInPoly(x, y, main)) pts.push(f.to({ x, y }));
    }
    return pts.length >= 10 ? ellipseOf(pts) : null;
  }, (a, b) => ({ cs: (a.cs + b.cs) / 2, cv: (a.cv + b.cv) / 2, rx: (a.rx + b.rx) / 2, ry: (a.ry + b.ry) / 2, ang: (a.ang + b.ang) / 2 }), (e, f) =>
    Array.from({ length: 64 }, (_, k) => {
      const t = (2 * Math.PI * k) / 64, x = e.rx * Math.cos(t), y = e.ry * Math.sin(t);
      return f.from({ s: e.cs + x * Math.cos(e.ang) - y * Math.sin(e.ang), v: e.cv + x * Math.sin(e.ang) + y * Math.cos(e.ang) });
    }), "region");

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
function erode(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
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
function dilate(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
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

/** 다각형 둘레(margin px 안)에서 어두운 픽셀 — 밝기 오츠 문턱. 어두운 쪽 · 밝은 쪽이 갈리지 않으면 null */
function darkIn(im: RgbaImage, poly: readonly Pt[], margin: number): ((q: Pt) => boolean) | null {
  const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
  const x0 = Math.max(0, Math.floor(Math.min(...xs) - margin)), x1 = Math.min(im.w - 1, Math.ceil(Math.max(...xs) + margin));
  const y0 = Math.max(0, Math.floor(Math.min(...ys) - margin)), y1 = Math.min(im.h - 1, Math.ceil(Math.max(...ys) + margin));
  const zone = (x: number, y: number) => pointInPoly(x, y, poly) || polyDist({ x, y }, poly) <= margin;
  const lum = (x: number, y: number) => { const i = (y * im.w + x) * 4; return 0.299 * im.data[i]! + 0.587 * im.data[i + 1]! + 0.114 * im.data[i + 2]!; };
  const hist = new Array<number>(256).fill(0);
  let n = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (zone(x, y)) { hist[Math.round(lum(x, y))]!++; n++; }
  if (n < 20) return null;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i]!;
  let wB = 0, sB = 0, best = -1, thr = 0;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]!; if (!wB || wB === n) continue;
    sB += t * hist[t]!;
    const mB = sB / wB, mF = (sum - sB) / (n - wB), between = wB * (n - wB) * (mB - mF) ** 2;
    if (between > best) { best = between; thr = t; }
  }
  return (q) => {
    const x = Math.round(q.x), y = Math.round(q.y);
    return x >= x0 && x <= x1 && y >= y0 && y <= y1 && zone(x, y) && lum(x, y) <= thr;
  };
}

/** 점 p 에서 방향 d 로 — p 부터 이어진 칠한 픽셀 끝까지 거리 (1px 끊김은 잇는다) */
function runOut(inside: (q: Pt) => boolean, p: Pt, d: Pt, maxPx: number): number {
  let last = 0, gap = 0;
  for (let k = 0.5; k <= maxPx; k += 0.5) {
    if (inside(add(p, d, k))) { last = k; gap = 0; } else if (++gap > 2) break;
  }
  return last;
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

/** 점들의 모멘트 타원 — 가운데 · 반지름(고르게 찬 타원이면 축 방향 분산 = 반지름² / 4) · 기울기 */
function ellipseOf(pts: readonly SV[]): { cs: number; cv: number; rx: number; ry: number; ang: number } {
  const n = pts.length, cs = pts.reduce((a, p) => a + p.s, 0) / n, cv = pts.reduce((a, p) => a + p.v, 0) / n;
  let xx = 0, yy = 0, xy = 0;
  for (const p of pts) { const dx = p.s - cs, dy = p.v - cv; xx += dx * dx; yy += dy * dy; xy += dx * dy; }
  xx /= n; yy /= n; xy /= n;
  const tr = (xx + yy) / 2, d = Math.sqrt(Math.max(0, ((xx - yy) / 2) ** 2 + xy * xy));
  return { cs, cv, rx: 2 * Math.sqrt(tr + d), ry: 2 * Math.sqrt(Math.max(0, tr - d)), ang: 0.5 * Math.atan2(2 * xy, xx - yy) };
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
