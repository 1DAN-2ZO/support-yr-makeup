// 머리선 점 (2026-10-05 사용자) — MediaPipe 얼굴 점은 이마 중간(10번)까지라, 머리카락 분할로 이마 위 끝(머리선)을 찾는다.
// 478점은 그대로 두고 점을 따로 더한다. 앞머리가 이마를 덮은 칸은 MediaPipe 이마 위 선으로 되돌아간다
import { describe, expect, it } from "vitest";
import { FOREHEAD_ARC, HAIRLINE, HAIRLINE_TRACK, createHairlineTrack, findHairline } from "@core/hairline";
import type { HairMask } from "@core/sampling";
import type { Pt } from "@core/types";
import { H, LMS, W } from "./helpers/synth-face";

/** 머리카락 확률 마스크 — hair(x, y) 가 참인 곳만 1 (사진 좌표, 크기 mw × mh) */
function mask(hair: (x: number, y: number) => boolean, mw = W, mh = H): HairMask {
  const data = new Float32Array(mw * mh);
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) if (hair(((x + 0.5) * W) / mw, ((y + 0.5) * H) / mh)) data[y * mw + x] = 1;
  return { w: mw, h: mh, data };
}
const IMG = { w: W, h: H };
const unit = Math.hypot(LMS[10]!.x - LMS[168]!.x, LMS[10]!.y - LMS[168]!.y);   // 이마 위(10) ↔ 미간(168) = 160px

describe("머리선 (findHairline)", () => {
  it("H1 이마가 다 보이면 칸마다 머리카락이 시작하는 자리 — MediaPipe 이마 위 선보다 위", () => {
    const pts = findHairline(LMS, mask((_x, y) => y < 60), IMG);
    expect(pts).toHaveLength(HAIRLINE.columns);
    for (const p of pts) {
      expect(p.kind).toBe("hair");
      expect(Math.abs(p.at.y - 60), `x ${p.at.x.toFixed(0)}`).toBeLessThan(2);
      expect(p.at.y).toBeLessThan(p.base.y);
    }
    // 칸은 MediaPipe 이마 위 선(54 → 284)을 따라 왼쪽 → 오른쪽
    expect(pts[0]!.base).toEqual(LMS[FOREHEAD_ARC[0]!]);
    expect(pts.at(-1)!.base).toEqual(LMS[FOREHEAD_ARC.at(-1)!]);
  });

  it("H2 앞머리가 이마 한쪽을 덮으면 그 칸만 MediaPipe 이마 위 선으로 되돌아간다", () => {
    // 오른쪽(x > 320)은 앞머리가 눈썹 근처(y < 180)까지 내려옴 · 왼쪽은 머리선 y 60
    const pts = findHairline(LMS, mask((x, y) => y < 60 || (x > 320 && y < 180)), IMG);
    const right = pts.filter((p) => p.base.x > 330), left = pts.filter((p) => p.base.x < 290);
    expect(right.length).toBeGreaterThan(0);
    expect(left.length).toBeGreaterThan(0);
    for (const p of right) { expect(p.kind).toBe("bangs"); expect(p.at).toEqual(p.base); }
    for (const p of left) { expect(p.kind).toBe("hair"); expect(Math.abs(p.at.y - 60)).toBeLessThan(2); }
  });

  it("H3 위로 한참 올라가도 머리카락이 없으면 못 찾음 — MediaPipe 이마 위 선 그대로", () => {
    const pts = findHairline(LMS, mask(() => false), IMG);
    for (const p of pts) { expect(p.kind).toBe("none"); expect(p.at).toEqual(p.base); }
    // 찾는 범위: 이마 위 ↔ 미간 거리 × searchMax 까지만 — 얼굴을 아래로 내려 그 바로 위·바로 아래에 머리카락을 둔다
    const low = LMS.map((q) => ({ x: q.x, y: q.y + 250 })), top = low[10]!.y - unit * HAIRLINE.searchMax;
    const mid = (pts: ReturnType<typeof findHairline>) => pts[Math.floor(pts.length / 2)]!;
    expect(mid(findHairline(low, mask((_x, y) => y < top - 5), IMG)).kind).toBe("none");
    expect(mid(findHairline(low, mask((_x, y) => y < top + 5), IMG)).kind).toBe("hair");
  });

  it("H4 이마를 가로지르는 가는 머리카락 한 가닥은 머리선으로 안 본다", () => {
    const pts = findHairline(LMS, mask((_x, y) => y < 60 || (y >= 80 && y < 81.5)), IMG);
    for (const p of pts) { expect(p.kind).toBe("hair"); expect(Math.abs(p.at.y - 60)).toBeLessThan(2); }
  });

  it("H5 마스크가 사진보다 작아도(분할 모델 256) 같은 자리 — 가로 · 세로 둘 다 비율로", () => {
    // 왼쪽 반은 머리선 y 60, 오른쪽 반은 y 80 — 가로 비율을 잘못 맞추면 엉뚱한 쪽 머리선을 잡는다
    const want = (x: number) => (x < 300 ? 60 : 80);
    const pts = findHairline(LMS, mask((x, y) => y < want(x), 256, 256), IMG);
    for (const p of pts.filter((q) => Math.abs(q.base.x - 300) > 10)) {
      expect(p.kind).toBe("hair");
      expect(Math.abs(p.at.y - want(p.at.x)), `x ${p.at.x.toFixed(0)}`).toBeLessThan(W / 256 + 1);
    }
  });

  it("H6 고개가 기울어도 얼굴 위쪽(미간 → 이마 위) 방향으로 찾는다", () => {
    const a = (15 * Math.PI) / 180, c = { x: 300, y: 300 };
    const rot = (p: Pt): Pt => ({ x: c.x + (p.x - c.x) * Math.cos(a) - (p.y - c.y) * Math.sin(a), y: c.y + (p.x - c.x) * Math.sin(a) + (p.y - c.y) * Math.cos(a) });
    const back = (p: Pt): Pt => ({ x: c.x + (p.x - c.x) * Math.cos(-a) - (p.y - c.y) * Math.sin(-a), y: c.y + (p.x - c.x) * Math.sin(-a) + (p.y - c.y) * Math.cos(-a) });
    // 기울인 얼굴 + 같이 기울인 머리선(원래 y 60)
    const pts = findHairline(LMS.map(rot), mask((x, y) => back({ x, y }).y < 60), IMG);
    for (const p of pts) {
      expect(p.kind).toBe("hair");
      expect(Math.abs(back(p.at).y - 60)).toBeLessThan(2.5);
      // 출발점에서 얼굴 위쪽으로 곧장 — 얼굴 기준 가로 자리가 그대로 (화면 위쪽으로 찾으면 옆으로 밀린다)
      expect(Math.abs(back(p.at).x - back(p.base).x), `x ${back(p.base).x.toFixed(0)}`).toBeLessThan(1);
    }
  });
});

describe("머리선 따라가기 (createHairlineTrack)", () => {
  const hairAt = (y0: number) => mask((_x, y) => y < y0);
  const midY = (pts: readonly { at: Pt }[]) => pts[Math.floor(pts.length / 2)]!.at.y;

  it("T1 마스크가 없는 장면에서도 지금 랜드마크로 바로 다시 놓는다 — 얼굴이 옮겨지고 커지면 머리선도 그만큼", () => {
    const t = createHairlineTrack();
    expect(t.place(LMS)).toBeNull();   // 마스크가 오기 전엔 없음
    t.update(LMS, hairAt(60), IMG);
    const a = t.place(LMS)!;
    const move = (p: Pt): Pt => ({ x: 40 + 1.2 * p.x, y: 30 + 1.2 * p.y });
    const b = t.place(LMS.map(move))!;
    b.forEach((p, i) => {
      expect(Math.abs(p.at.x - move(a[i]!.at).x)).toBeLessThan(1e-6);
      expect(Math.abs(p.at.y - move(a[i]!.at).y)).toBeLessThan(1e-6);
    });
  });

  it("T2 분할 경계가 매번 몇 px 씩 흔들려도 머리선은 덜 흔들린다", () => {
    const t = createHairlineTrack();
    const ys: number[] = [];
    for (let k = 0; k < 20; k++) { t.update(LMS, hairAt(k % 2 ? 56 : 64), IMG); ys.push(midY(t.place(LMS)!)); }
    const late = ys.slice(10), swing = Math.max(...late) - Math.min(...late);
    expect(swing, "흔들림 폭").toBeLessThan(0.5 * 8);   // 원래 8px 흔들림의 절반 아래
    expect(Math.abs(late.reduce((a, b) => a + b, 0) / late.length - 60)).toBeLessThan(1.5);
  });

  it("T3 머리선이 정말 바뀌면(머리를 넘김) 몇 번 안에 따라간다", () => {
    const t = createHairlineTrack();
    for (let k = 0; k < 5; k++) t.update(LMS, hairAt(60), IMG);
    let n = 0;
    while (Math.abs(midY(t.place(LMS)!) - 40) > 1 && n < 30) { t.update(LMS, hairAt(40), IMG); n++; }
    expect(n, "바뀐 머리선까지 걸린 분할 횟수").toBeLessThanOrEqual(HAIRLINE_TRACK.settle);
  });

  it("T4 앞머리로 바뀌면 기다리지 않고 바로 MediaPipe 선으로 (그 반대도)", () => {
    const t = createHairlineTrack();
    for (let k = 0; k < 5; k++) t.update(LMS, hairAt(60), IMG);
    t.update(LMS, mask((_x, y) => y < 180), IMG);   // 앞머리가 눈썹 근처까지
    for (const p of t.place(LMS)!) { expect(p.kind).toBe("bangs"); expect(p.at).toEqual(p.base); }
    t.update(LMS, hairAt(60), IMG);   // 다시 넘김
    for (const p of t.place(LMS)!) { expect(p.kind).toBe("hair"); expect(Math.abs(p.at.y - 60)).toBeLessThan(2); }
  });
});
