// 얼굴 그물에 점 붙이기 — 기준 얼굴(맨얼굴 정면)에서 그린 모양을 지금 얼굴로 옮긴다.
// 점마다 "몇 번 삼각형의 어디쯤(무게)" 을 적어 두고, 지금 얼굴의 같은 삼각형에 같은 무게로 놓는다 (2-b AR 화장과 같은 방식)
import { describe, expect, it } from "vitest";
import { FACE_TRIANGLES } from "@core/face-mesh";
import { pinOutline, pinPoints, placeOutline, placePins } from "@core/mesh-pin";
import type { Pt } from "@core/types";
import { LMS } from "./helpers/synth-face";

const close = (a: readonly Pt[], b: readonly Pt[], eps = 1e-6): void => {
  expect(a).toHaveLength(b.length);
  a.forEach((p, i) => {
    expect(Math.abs(p.x - b[i]!.x), `x ${i}`).toBeLessThan(eps);
    expect(Math.abs(p.y - b[i]!.y), `y ${i}`).toBeLessThan(eps);
  });
};

/** 그물 안 점 몇 개 + 그물 밖(얼굴 옆) 점 */
const SAMPLE: Pt[] = [
  { x: 300, y: 300 }, { x: 250, y: 260 }, { x: 360, y: 340 }, LMS[33]!, LMS[263]!,
  { x: 40, y: 300 },   // 얼굴 밖
];

describe("mesh pin", () => {
  it("M1 같은 얼굴에 놓으면 그대로 — 그물 밖 점도", () => {
    close(placePins(LMS, pinPoints(LMS, SAMPLE)), SAMPLE);
  });

  it("M2 얼굴을 옮기고·키우고·돌리면 점도 똑같이 옮겨진다", () => {
    const t = (p: Pt): Pt => {
      const a = (12 * Math.PI) / 180, s = 1.3;
      return { x: 40 + s * (p.x * Math.cos(a) - p.y * Math.sin(a)), y: -25 + s * (p.x * Math.sin(a) + p.y * Math.cos(a)) };
    };
    close(placePins(LMS.map(t), pinPoints(LMS, SAMPLE)), SAMPLE.map(t));
  });

  it("M3 그물 꼭짓점 위의 점은 그 꼭짓점을 그대로 따라간다", () => {
    const pins = pinPoints(LMS, [LMS[33]!, LMS[61]!]);
    const moved = LMS.map((p, i) => ({ x: p.x + (i % 7) * 3, y: p.y - (i % 5) * 2 }));
    close(placePins(moved, pins), [moved[33]!, moved[61]!]);
  });

  it("M4 고개를 돌린 것처럼 한쪽이 좁아지면 그쪽에 붙인 모양도 좁아진다 — 원근", () => {
    const cx = 300;
    // 화면 왼쪽 절반만 가로로 0.7 배 (먼 쪽 얼굴이 좁아 보이는 것)
    const turned = LMS.map((p) => (p.x < cx ? { x: cx + (p.x - cx) * 0.7, y: p.y } : p));
    // 양쪽 볼에 같은 크기 가로 막대
    const left = [{ x: 180, y: 380 }, { x: 240, y: 380 }], right = [{ x: 360, y: 380 }, { x: 420, y: 380 }];
    const w = (s: readonly Pt[]) => s[1]!.x - s[0]!.x;
    const L = placePins(turned, pinPoints(LMS, left)), R = placePins(turned, pinPoints(LMS, right));
    expect(w(L) / w(left)).toBeCloseTo(0.7, 2);
    expect(w(R) / w(right)).toBeCloseTo(1, 2);
  });

  it("M5 테두리(다각형·선)는 모양 그대로 붙였다 옮긴다", () => {
    const o = { polys: [SAMPLE.slice(0, 3), SAMPLE.slice(3)], lines: [[SAMPLE[0]!, SAMPLE[4]!]] };
    const p = placeOutline(pinOutline(o, LMS), LMS);
    expect(p.polys).toHaveLength(2);
    close(p.polys[0]!, o.polys[0]!);
    close(p.polys[1]!, o.polys[1]!);
    close(p.lines[0]!, o.lines[0]!);
  });

  it("M7 얼굴 점과 같은 자리의 점은 그 얼굴 점에 붙는다 — 이웃 삼각형 변 위에 걸쳐 있어도 (라이너 아래 선 = 눈꺼풀 점 그대로)", () => {
    const ids = [362, 133, 33, 263];
    const pins = pinPoints(LMS, ids.map((i) => LMS[i]!));
    for (const [k, i] of ids.entries()) {
      const moved = LMS.map((p, j) => (j === i ? { x: p.x - 20, y: p.y + 7 } : p));
      close([placePins(moved, pins)[k]!], [moved[i]!]);
    }
  });

  it("M6 그물은 MediaPipe 삼각형 852개", () => {
    expect(FACE_TRIANGLES).toHaveLength(852);
  });
});
