// 흰자 보정 진단 — whiteBalanceGain 과 같은 판정을 따라가는지 합성 눈으로 맞대어 본다
import { describe, expect, it } from "vitest";
import type { RgbaImage } from "@core/color";
import { EYE_A, EYE_B, FOREHEAD_POLY } from "@core/color";
import { whiteBalanceGain } from "@core/ref-correct";
import { diagnoseWhiteBalance } from "@core/skin-wb-diagnose";
import type { Pt } from "@core/types";

const W = 400, H = 300;
type Rgb = [number, number, number];

interface Scene { skin: Rgb; sclera: Rgb; rx?: number; ry?: number; iris?: Rgb }

/** 양쪽 눈(타원 둘레 16점 + 홍채 5점)과 이마 다각형이 있는 합성 얼굴 */
function build(s: Scene): { im: RgbaImage; lm: Pt[] } {
  const lm: Pt[] = Array.from({ length: 478 }, () => ({ x: 200, y: 150 }));
  const rx = s.rx ?? 26, ry = s.ry ?? 9;
  const eyes: [typeof EYE_A | typeof EYE_B, number][] = [[EYE_A, 120], [EYE_B, 280]];
  for (const [eye, cx] of eyes) {
    eye.ring.forEach((id, k) => {
      const t = (2 * Math.PI * k) / eye.ring.length;
      lm[id] = { x: cx + rx * Math.cos(t), y: 150 + ry * Math.sin(t) };
    });
    const r = 6;
    const [c, a, b, d, e] = eye.iris;
    lm[c] = { x: cx, y: 150 };
    lm[a] = { x: cx + r, y: 150 }; lm[b] = { x: cx, y: 150 - r }; lm[d] = { x: cx - r, y: 150 }; lm[e] = { x: cx, y: 150 + r };
  }
  // 이마: 눈 위 넓은 사각형 둘레
  const fp: Pt[] = [{ x: 90, y: 40 }, { x: 150, y: 35 }, { x: 200, y: 35 }, { x: 250, y: 35 }, { x: 310, y: 40 }, { x: 320, y: 70 }, { x: 320, y: 100 }, { x: 80, y: 100 }, { x: 80, y: 70 }, { x: 85, y: 55 }, { x: 88, y: 45 }];
  FOREHEAD_POLY.forEach((id, k) => { lm[id] = fp[k]!; });

  const data = new Uint8ClampedArray(W * H * 4);
  const iris = s.iris ?? [40, 30, 25];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let c: Rgb = s.skin;
    for (const [, cx] of eyes) {
      const inEye = ((x - cx) / rx) ** 2 + ((y - 150) / ry) ** 2 <= 1;
      if (inEye) c = Math.hypot(x - cx, y - 150) <= 6.5 ? (iris as Rgb) : s.sclera;
    }
    const i = (y * W + x) * 4;
    data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
  }
  return { im: { data, w: W, h: H }, lm };
}

describe("흰자 보정 진단", () => {
  it("W1 흰자가 이마보다 밝고 색이 약하게 돌았으면 성공 — 기존 함수와 같은 배수", () => {
    const { im, lm } = build({ skin: [200, 160, 140], sclera: [235, 225, 210] });
    const d = diagnoseWhiteBalance(im, lm);
    expect(d.reason).toBe("ok");
    expect(d.gain).not.toBeNull();
    expect(d.gain).toEqual(whiteBalanceGain(im, lm, 2));
  });

  it("W2 흰자 후보가 이마 피부보다 어두우면 darker-than-skin — 기존 함수도 null, 건너뛰면 나왔을 배수는 따로 준다", () => {
    const { im, lm } = build({ skin: [225, 185, 165], sclera: [185, 170, 160] });
    const d = diagnoseWhiteBalance(im, lm);
    expect(d.reason).toBe("darker-than-skin");
    expect(d.gain).toBeNull();
    expect(whiteBalanceGain(im, lm, 2)).toBeNull();
    expect(d.gainIgnoringSkin).not.toBeNull();
    expect(d.scleraLum!).toBeLessThan(d.skinLum!);
  });

  it("W3 눈이 너무 작으면 few-pixels", () => {
    const { im, lm } = build({ skin: [200, 160, 140], sclera: [235, 225, 210], rx: 3, ry: 1.2 });
    const d = diagnoseWhiteBalance(im, lm);
    expect(d.reason).toBe("few-pixels");
    expect(whiteBalanceGain(im, lm, 2)).toBeNull();
  });

  it("W4 흰자가 아주 강하게 물들었으면 gain-range — 건너뛴 배수도 범위 밖이라 null", () => {
    const { im, lm } = build({ skin: [120, 90, 80], sclera: [250, 140, 60] });
    const d = diagnoseWhiteBalance(im, lm);
    expect(d.reason).toBe("gain-range");
    expect(d.gainIgnoringSkin).toBeNull();
    expect(whiteBalanceGain(im, lm, 2)).toBeNull();
  });

  it("W5 어느 경우든 diagnose.gain 은 기존 whiteBalanceGain 과 같다 (성공이면 같은 값, 실패면 둘 다 null)", () => {
    const scenes: Scene[] = [
      { skin: [200, 160, 140], sclera: [235, 225, 210] },
      { skin: [200, 160, 140], sclera: [210, 215, 235] },
      { skin: [225, 185, 165], sclera: [185, 170, 160] },
      { skin: [120, 90, 80], sclera: [250, 140, 60] },
      { skin: [200, 160, 140], sclera: [235, 225, 210], rx: 4, ry: 1.5 },
      { skin: [200, 160, 140], sclera: [0, 0, 0], iris: [0, 0, 0] },
    ];
    for (const s of scenes) {
      const { im, lm } = build(s);
      expect(diagnoseWhiteBalance(im, lm).gain, JSON.stringify(s)).toEqual(whiteBalanceGain(im, lm, 2));
    }
  });

  it("W6 밝은 30% 표본 좌표를 돌려준다 (눈 안에만 있다)", () => {
    const { im, lm } = build({ skin: [200, 160, 140], sclera: [235, 225, 210] });
    const d = diagnoseWhiteBalance(im, lm);
    expect(d.brightXY.length / 2).toBe(d.nBright);
    for (let i = 0; i < d.brightXY.length; i += 2) {
      expect(Math.abs(d.brightXY[i + 1]! - 150)).toBeLessThanOrEqual(10);
    }
  });

  describe("상대 기준 (relative)", () => {
    const R = { mode: "relative" as const };
    const tint = (c: [number, number, number], t: [number, number, number]): [number, number, number] => [c[0] * t[0], c[1] * t[1], c[2] * t[2]];

    it("R1 흰자가 이마보다 어두워도(눈 그늘) 색이 이마와 다르면 성공 — 기존 방식은 실패하는 같은 사진", () => {
      const { im, lm } = build({ skin: [225, 185, 165], sclera: [180, 176, 172] });
      expect(diagnoseWhiteBalance(im, lm).reason).toBe("darker-than-skin");
      const d = diagnoseWhiteBalance(im, lm, 2, R);
      expect(d.reason).toBe("ok");
      expect(d.gain).not.toBeNull();
    });

    it("R2 눈 안이 전부 이마 피부색(흰자가 안 보임)이면 no-neutral — 피부를 회색으로 만들지 않는다", () => {
      const { im, lm } = build({ skin: [225, 185, 165], sclera: [205, 168, 148] });
      const d = diagnoseWhiteBalance(im, lm, 2, R);
      expect(d.reason).toBe("no-neutral");
      expect(d.gain).toBeNull();
    });

    it("R3 조명이 물들어도(따뜻 · 차가움) 같은 장면은 똑같이 성공한다 — 채도 상한 같은 절대 기준이 아니라서", () => {
      const skin: [number, number, number] = [225, 185, 165], sclera: [number, number, number] = [180, 176, 172];
      for (const t of [[1.12, 1.0, 0.82], [0.88, 1.0, 1.15]] as [number, number, number][]) {
        const { im, lm } = build({ skin: tint(skin, t), sclera: tint(sclera, t) });
        expect(diagnoseWhiteBalance(im, lm, 2, R).reason, String(t)).toBe("ok");
      }
    });

    it("R4 조명이 물든 만큼을 되돌린다 — 따뜻한 조명이면 빨강을 내리고 파랑을 올린다", () => {
      const { im, lm } = build({ skin: tint([225, 185, 165], [1.12, 1, 0.82]), sclera: tint([180, 176, 172], [1.12, 1, 0.82]) });
      const g = diagnoseWhiteBalance(im, lm, 2, R).gain!;
      expect(g[0]).toBeLessThan(1);
      expect(g[2]).toBeGreaterThan(1);
    });

    it("R5 조명을 바꿔도 보정 후 흰자는 같은 무채색으로 간다 (조명 불변)", () => {
      const skin: [number, number, number] = [225, 185, 165], sclera: [number, number, number] = [180, 176, 172];
      const corrected = [[1, 1, 1], [1.12, 1, 0.82], [0.88, 1, 1.15]].map((t) => {
        const { im, lm } = build({ skin: tint(skin, t as [number, number, number]), sclera: tint(sclera, t as [number, number, number]) });
        const d = diagnoseWhiteBalance(im, lm, 2, R);
        return d.sclera!.map((v, k) => v * d.gain![k]!);
      });
      for (const c of corrected) {
        expect(Math.max(...c) - Math.min(...c)).toBeLessThan(2);   // 세 채널이 같다 = 회색
      }
    });

    it("R6 이마 피부를 못 쟀으면(앞머리로 덮임) 기준이 없어 실패", () => {
      const { im, lm } = build({ skin: [225, 185, 165], sclera: [180, 176, 172] });
      for (const id of FOREHEAD_POLY) lm[id] = { x: 5, y: 5 };   // 이마 다각형을 한 점으로 — 표본 0
      expect(diagnoseWhiteBalance(im, lm, 2, R).reason).toBe("no-neutral");
    });

    it("R7 홍채(어두움)는 후보에 안 들어간다 — 후보 좌표가 홍채 원 밖이다", () => {
      const { im, lm } = build({ skin: [225, 185, 165], sclera: [180, 176, 172] });
      const d = diagnoseWhiteBalance(im, lm, 2, R);
      expect(d.reason).toBe("ok");
      for (let i = 0; i < d.brightXY.length; i += 2) {
        const x = d.brightXY[i]!, y = d.brightXY[i + 1]!;
        for (const cx of [120, 280]) if (Math.abs(x - cx) < 30) expect(Math.hypot(x - cx, y - 150) > 6).toBe(true);
      }
    });

    it("R8 눈이 너무 작으면 few-pixels", () => {
      const { im, lm } = build({ skin: [225, 185, 165], sclera: [180, 176, 172], rx: 3, ry: 1.2 });
      expect(diagnoseWhiteBalance(im, lm, 2, R).reason).toBe("few-pixels");
    });
  });
});
