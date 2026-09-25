// 표준 눈썹 (논문 기술 C-1, 장소쌍·최민령 2023 JKSC) 검증
// mm 기준값을 홍채 지름(11.3 mm)으로 px 로 바꿔 이 얼굴 위에 표준 눈썹을 세운다.
import { describe, expect, it } from "vitest";
import { unitScale } from "@core/baseline";
import { BROW_ARCH_MM, browStandard, STANDARD_BROW_MM } from "@core/guides";
import { LM } from "@core/landmarks";
import type { Pt } from "@core/types";
import { face, tiltHead } from "./helpers/measure-face";

const frame = (lm: Pt[]) => ({ lm, unit: unitScale(lm) });
/** 가짜 얼굴의 두 동공은 170px 떨어져 있다 → 1 mm = 170/62.2 px (동공 사이 거리 자) */
const S = 170 / 62.2;
const d = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

describe("표준 눈썹 — 기준값 (JKSC 2023)", () => {
  it("논문 표의 값을 그대로 쓰고, 두께만 전문가가 고른 +1 mm", () => {
    expect(STANDARD_BROW_MM).toEqual({ pupilToTop: 22.05, innerToTop: 22.85, outerToTop: 23.38, lidToBottom: 13.7, headThick: 10.8, glabella: 28.8 });
  });

  it("두 동공 점이 겹쳐 mm 를 모르면 만들지 않는다", () => {
    const lm = face();
    lm[LM.eyeA.iris[0]] = lm[LM.eyeB.iris[0]] = { x: 300, y: 300 };
    expect(browStandard(frame(lm))).toBeNull();
  });
});

describe("표준 눈썹 — 자리", () => {
  const b = browStandard(frame(face()))!;

  it("눈썹 가장 높은 곳은 동공 중심에서 22.05 mm 위", () => {
    expect(b.R.peak.top.x).toBeCloseTo(215, 6);
    expect(b.R.peak.top.y).toBeCloseTo(250 - 22.05 * S, 6);
  });

  it("그 아래 선은 윗눈꺼풀 꼭대기에서 13.7 mm 위", () => {
    expect(b.R.peak.bottom.x).toBeCloseTo(215, 6);
    expect(b.R.peak.bottom.y).toBeCloseTo(232 - 13.7 * S, 6);
  });

  it("앞머리 윗선은 안쪽 눈꼬리 높이에서 22.85 mm 위, 두께 10.8 mm", () => {
    expect(b.R.head.top.y).toBeCloseTo(250 - 22.85 * S, 6);
    expect(b.R.head.bottom.y - b.R.head.top.y).toBeCloseTo(10.8 * S, 6);
  });

  it("미간은 28.8 mm — 두 안쪽 눈꼬리 가운데를 기준으로 양쪽 14.4 mm", () => {
    expect(b.R.head.top.x).toBeCloseTo(300 - 14.4 * S, 6);
    expect(b.L.head.top.x).toBeCloseTo(300 + 14.4 * S, 6);
    expect(d(b.R.head.top, b.L.head.top)).toBeCloseTo(28.8 * S, 6);
  });

  it("바깥 눈꼬리 위 윗선은 23.38 mm, 두께는 가장 높은 곳과 같게 (가정)", () => {
    expect(b.R.outer.top.x).toBeCloseTo(170, 6);
    expect(b.R.outer.top.y).toBeCloseTo(250 - 23.38 * S, 6);
    expect(b.R.outer.bottom.y - b.R.outer.top.y).toBeCloseTo(b.R.peak.bottom.y - b.R.peak.top.y, 6);
  });

  it("꼬리 끝은 콧방울 → 바깥 눈꼬리 연장선 위, 앞머리 가운데 높이 (가정)", () => {
    const ala = { x: 270, y: 370 }, outer = { x: 170, y: 250 }, t = b.R.tail;
    const cross = (outer.x - ala.x) * (t.y - ala.y) - (outer.y - ala.y) * (t.x - ala.x);
    expect(cross).toBeCloseTo(0, 6);
    expect(t.y).toBeCloseTo((b.R.head.top.y + b.R.head.bottom.y) / 2, 6);
    expect(t.x).toBeLessThan(170);   // 눈꼬리보다 바깥
  });

  it("왼쪽은 오른쪽의 거울상", () => {
    expect(b.L.peak.top.x).toBeCloseTo(385, 6);
    expect(b.L.outer.top.x).toBeCloseTo(430, 6);
    expect(b.L.tail.x).toBeCloseTo(600 - b.R.tail.x, 6);
    expect(b.L.tail.y).toBeCloseTo(b.R.tail.y, 6);
  });

  it("윤곽은 윗선(앞머리 → 꼬리) 다음 아랫선(꼬리 → 앞머리)으로 닫힌다", () => {
    const r = b.R;
    expect(r.outline).toEqual([r.head.top, r.peak.top, r.outer.top, r.tail, r.outer.bottom, r.peak.bottom, r.head.bottom]);
  });
});

describe("표준 눈썹 — 고개 기울기·크기와 무관", () => {
  it("고개를 10° 기울여도 눈썹은 얼굴에 붙어 같이 돈다", () => {
    const lm = tiltHead(face(), 10);
    const b = browStandard(frame(lm))!;
    const pupil = lm[LM.eyeA.iris[0]]!;
    expect(d(b.R.peak.top, pupil)).toBeCloseTo(22.05 * S, 6);
    // 동공 → 가장 높은 곳 방향은 눈동자 선에 수직
    const axis = { x: lm[LM.eyeB.iris[0]]!.x - pupil.x, y: lm[LM.eyeB.iris[0]]!.y - pupil.y };
    expect((b.R.peak.top.x - pupil.x) * axis.x + (b.R.peak.top.y - pupil.y) * axis.y).toBeCloseTo(0, 4);
    expect(d(b.R.head.top, b.L.head.top)).toBeCloseTo(28.8 * S, 6);
  });

  it("얼굴이 크게 찍히면(가까이) 같은 mm 가 더 많은 px", () => {
    const big = face().map((p) => ({ x: p.x * 2, y: p.y * 2 }));
    const b = browStandard(frame(big))!;
    expect(b.R.peak.top.y).toBeCloseTo(500 - 22.05 * 2 * S, 6);
  });
});

describe("표준 눈썹 — 개인화 조정 (C-2: 얼굴형 → 높이·미간·굽기)", () => {
  const base = browStandard(frame(face()))!;

  it("조정이 없으면 표준 그대로", () => {
    expect(browStandard(frame(face()), { heightMm: 0, glabellaMm: 0, arch: "standard" })).toEqual(base);
  });

  it("높이 +2 mm → 윗선·아랫선이 모두 2 mm 위로, 꼬리 끝은 콧방울 선을 따라 올라간다", () => {
    const b = browStandard(frame(face()), { heightMm: 2, glabellaMm: 0, arch: "standard" })!;
    for (const k of ["head", "peak", "outer"] as const) {
      expect(b.R[k].top.y).toBeCloseTo(base.R[k].top.y - 2 * S, 6);
      expect(b.R[k].bottom.y).toBeCloseTo(base.R[k].bottom.y - 2 * S, 6);
    }
    expect(b.R.tail.y).toBeCloseTo(base.R.tail.y - 2 * S, 6);
    const ala = { x: 270, y: 370 }, outer = { x: 170, y: 250 }, t = b.R.tail;
    expect((outer.x - ala.x) * (t.y - ala.y) - (outer.y - ala.y) * (t.x - ala.x)).toBeCloseTo(0, 6);
  });

  it("미간 −2 mm → 두 앞머리가 1 mm 씩 가운데로", () => {
    const b = browStandard(frame(face()), { heightMm: 0, glabellaMm: -2, arch: "standard" })!;
    expect(d(b.R.head.top, b.L.head.top)).toBeCloseTo((28.8 - 2) * S, 6);
    expect(b.R.head.top.x).toBeCloseTo(base.R.head.top.x + 1 * S, 6);
  });

  it("굽기: arched 는 가장 높은 곳을 1 mm 올리고, flatter 는 1 mm 내린다 (가정)", () => {
    expect(BROW_ARCH_MM).toBe(1);
    const up = browStandard(frame(face()), { heightMm: 0, glabellaMm: 0, arch: "arched" })!;
    const dn = browStandard(frame(face()), { heightMm: 0, glabellaMm: 0, arch: "flatter" })!;
    expect(up.R.peak.top.y).toBeCloseTo(base.R.peak.top.y - S, 6);
    expect(up.R.peak.bottom.y).toBeCloseTo(base.R.peak.bottom.y - S, 6);
    expect(dn.R.peak.top.y).toBeCloseTo(base.R.peak.top.y + S, 6);
    expect(up.R.head).toEqual(base.R.head);
    expect(up.R.outer).toEqual(base.R.outer);
  });
});
