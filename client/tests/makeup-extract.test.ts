// 0단계 검증 — 합성 얼굴(살색판)에 알려진 자리·크기로 "화장"을 칠해 놓고, extractGuide 가 그 자리·크기를
// ray-walk 로 되찾는지 확인한다. 정렬·조명보정 없이 두 이미지가 같은 구도라는 전제(0단계 범위)로 시험.
import { describe, expect, it } from "vitest";
import type { RgbaImage } from "@core/color";
import { pointInPoly } from "@core/color";
import { LM, dist } from "@core/landmarks";
import { extractGuide, extractGuideSingle } from "@core/makeup-extract";
import type { Pt } from "@core/types";
import { BARE, LMS, P, SKIN, eyeOf, image } from "./helpers/synth-face";

const centroid = (pts: readonly Pt[]): Pt => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });
const scaleAround = (pts: readonly Pt[], c: Pt, k: number): Pt[] => pts.map((p) => ({ x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k }));
const bare: RgbaImage = image();

describe("extractGuide (0단계: 전처리 없음)", () => {
  it("E1 화장 없음 — 라이너 꼬리·입술 오프셋·섀도/볼 반지름이 전부 0에 가깝다", () => {
    const g = extractGuide(bare, image(), LMS, BARE.unit);
    const liner = g("liner", BARE).liner!, lip = g("lip", BARE).lip!;
    for (const s of ["R", "L"] as const) expect(dist(liner.wing[s][0], liner.wing[s][1])).toBeLessThan(3);
    expect(lip.offset).toBeLessThan(0.05);
    const shadow = g("shadow", BARE).regions!;
    const c = centroid([...eyeOf("R").upper.map(P), ...LM.browA.lower.map(P)]);
    for (const p of shadow.R) expect(dist(p, c)).toBeLessThan(10);
  });

  it("E2 입술 — 입술선보다 10% 넓게 칠하면 offset 이 그 비율에 가깝게 나온다", () => {
    const lipPoly = LM.lipsOuter.map(P), c = centroid(lipPoly), big = scaleAround(lipPoly, c, 1.1);
    const madeup = image((x, y) => (pointInPoly(x, y, big) ? [180, 60, 80] : null));
    const { lip } = extractGuide(bare, madeup, LMS, BARE.unit)("lip", BARE);
    expect(lip!.offset).toBeGreaterThanOrEqual(0.03);
    expect(lip!.offset).toBeLessThan(0.2);
  });

  it("E3 라이너 — 꼬리를 바깥쪽으로 길게 그리면 wing 끝점이 그만큼 멀어진다", () => {
    const tailLen = 20;   // px
    const madeup = image((x, y) => {
      for (const s of ["R", "L"] as const) {
        const outer = P(eyeOf(s).outer), end = { x: outer.x + (s === "R" ? -tailLen : tailLen), y: outer.y - 6 };
        const dx = end.x - outer.x, dy = end.y - outer.y, len = Math.hypot(dx, dy) || 1;
        const t = Math.max(0, Math.min(1, ((x - outer.x) * dx + (y - outer.y) * dy) / (len * len)));
        const px = outer.x + t * dx, py = outer.y + t * dy;
        if (Math.hypot(x - px, y - py) <= 2) return [30, 25, 28] as const;
      }
      return null;
    });
    const { liner } = extractGuide(bare, madeup, LMS, BARE.unit)("liner", BARE);
    for (const s of ["R", "L"] as const) {
      const got = dist(liner!.wing[s][0], liner!.wing[s][1]);
      expect(got).toBeGreaterThan(tailLen * 0.5);
    }
  });

  it("E4 볼터치 — 알려진 반지름의 원을 칠하면 ray-walk 점들이 그 반지름 근처에서 멈춘다", () => {
    const r = 25;
    const madeup = image((x, y) => {
      for (const s of ["R", "L"] as const) {
        const c = P(s === "R" ? LM.cheekA : LM.cheekB);
        if (Math.hypot(x - c.x, y - c.y) <= r) return [226, 158, 140] as const;
      }
      return null;
    });
    const regions = extractGuide(bare, madeup, LMS, BARE.unit)("cheek", BARE).regions!;
    for (const s of ["R", "L"] as const) {
      const c = P(s === "R" ? LM.cheekA : LM.cheekB);
      for (const p of regions[s]) {
        const got = dist(p, c);
        expect(got).toBeGreaterThan(r * 0.5);
        expect(got).toBeLessThan(r * 1.5);
      }
    }
  });

  it("E5 쉐딩·하이라이트 — 볼 자리를 어둡게 칠하면 shading 쪽만 잡히고 highlight 는 안 잡힌다(반대도)", () => {
    const r = 20;
    const darker = image((x, y) => {
      const c = P(LM.cheekA);
      return Math.hypot(x - c.x, y - c.y) <= r ? [SKIN[0] - 40, SKIN[1] - 40, SKIN[2] - 40] : null;
    });
    const { contour } = extractGuide(bare, darker, LMS, BARE.unit)("contour", BARE);
    const c = P(LM.cheekA);
    const shadingSpread = contour!.shading[0]!.reduce((s, p) => s + dist(p, c), 0) / contour!.shading[0]!.length;
    const highlightSpread = contour!.highlight[0]!.reduce((s, p) => s + dist(p, c), 0) / contour!.highlight[0]!.length;
    expect(shadingSpread).toBeGreaterThan(r * 0.5);
    expect(highlightSpread).toBeLessThan(5);
  });

  it("E6 맨얼굴 사진 없이(extractGuideSingle) — 이마 피부색 하나로도 볼터치 자리를 비슷하게 찾는다", () => {
    const r = 25;
    const madeup = image((x, y) => {
      for (const s of ["R", "L"] as const) {
        const c = P(s === "R" ? LM.cheekA : LM.cheekB);
        if (Math.hypot(x - c.x, y - c.y) <= r) return [226, 158, 140] as const;
      }
      return null;
    });
    const g = extractGuideSingle(madeup, LMS, BARE.unit);
    expect(g).not.toBeNull();
    const regions = g!("cheek", BARE).regions!;
    for (const s of ["R", "L"] as const) {
      const c = P(s === "R" ? LM.cheekA : LM.cheekB);
      for (const p of regions[s]) {
        const got = dist(p, c);
        expect(got).toBeGreaterThan(r * 0.5);
        expect(got).toBeLessThan(r * 1.5);
      }
    }
  });
});
