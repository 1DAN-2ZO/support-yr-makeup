import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import { affine, eyeOpenness, LASH_RULES, lashState, lidStrip, resampleLid, texPx, type LashMeta } from "@core/lash";
import type { Pt } from "@core/types";

const STYLES = ["natural", "deep"] as const;
const metaOf = (style: (typeof STYLES)[number]): LashMeta =>
  JSON.parse(readFileSync(new URL(`../public/lashes/${style}/lashes.json`, import.meta.url), "utf8")) as LashMeta;
/** 아래 띠·텍스처 좌표 시험은 natural 하나로 충분하다 — 수학(core/lash.ts)은 스타일과 무관하다 */
const meta = metaOf("natural");

/** 눈 폭 100px, 안쪽(0,0) → 바깥(100,0) 윗눈꺼풀 아치. y 는 화면 좌표(아래가 +) */
const arch = (h: number): Pt[] => Array.from({ length: 9 }, (_, i) => ({ x: (i / 8) * 100, y: -h * Math.sin((i / 8) * Math.PI) }));
const flat = (): Pt[] => Array.from({ length: 9 }, (_, i) => ({ x: (i / 8) * 100, y: 0 }));

describe("눈 뜸 비율", () => {
  it("윗·아랫눈꺼풀 가운데 거리 ÷ 눈 폭", () => {
    expect(eyeOpenness(arch(30), flat(), 100)).toBeGreaterThan(0.28);
    expect(eyeOpenness(flat(), flat(), 100)).toBe(0);
  });
  it("점 수가 다르거나 눈 폭이 0 이면 0 (던지지 않는다)", () => {
    expect(eyeOpenness(arch(30), flat().slice(1), 100)).toBe(0);
    expect(eyeOpenness(arch(30), flat(), 0)).toBe(0);
  });
});

describe("3단계 상태 — 섞지 않고 하나만, 문턱 근처에서 안 깜빡인다", () => {
  const { upAbove, downBelow, hysteresis: h } = LASH_RULES;
  it("처음엔 문턱 그대로", () => {
    expect(lashState(0.3, null)).toBe("up");
    expect(lashState((upAbove + downBelow) / 2, null)).toBe("mid");
    expect(lashState(0.02, null)).toBe("down");
  });
  it("up 에서 문턱 바로 아래로 조금 내려가도 up 유지, hysteresis 를 넘으면 mid", () => {
    expect(lashState(upAbove - h / 2, "up")).toBe("up");
    expect(lashState(upAbove - h * 1.5, "up")).toBe("mid");
  });
  it("mid 에서 up 으로 가려면 문턱 + hysteresis 를 넘어야 한다", () => {
    expect(lashState(upAbove + h / 2, "mid")).toBe("mid");
    expect(lashState(upAbove + h * 1.5, "mid")).toBe("up");
    expect(lashState(downBelow - h * 1.5, "mid")).toBe("down");
  });
  it("눈을 빨리 감으면 mid 를 건너뛰고 바로 down", () => {
    expect(lashState(0.01, "up")).toBe("down");
    expect(lashState(0.4, "down")).toBe("up");
  });
});

describe("눈꺼풀 띠", () => {
  it("다시 뽑은 점은 양끝을 지키고 비율은 0→1", () => {
    const { p, t } = resampleLid(arch(20), 24);
    expect(p).toHaveLength(25);
    expect(p[0]!.x).toBeCloseTo(0, 6);
    expect(p[24]!.x).toBeCloseTo(100, 6);
    expect(t[0]).toBe(0);
    expect(t[24]).toBe(1);
  });

  it("세로줄마다 [vMin, 0, vMax] 세 점, u 는 실제 눈꺼풀 범위(0~1) 밖으로 안 늘어난다(2026-09-30 결정 — 윙은 아이라인 몫)", () => {
    const tex = meta.textures.up;
    const cols = lidStrip(arch(20), { x: 0, y: -1 }, 100, tex);
    expect(cols).toHaveLength(LASH_RULES.segments + 1);
    for (const c of cols) expect(c.map((q) => q.v)).toEqual([tex.vMin, 0, tex.vMax]);
    expect(cols[0]![0]!.u).toBe(0);
    expect(cols.at(-1)![0]!.u).toBe(1);
    // 양끝 다 실제 눈꺼풀 점(0~100) 범위 안 — 바깥으로 뻗은 줄이 없다
    expect(cols[0]![1]!.at.x).toBeCloseTo(0, 6);
    expect(cols.at(-1)![1]!.at.x).toBeCloseTo(100, 6);
  });

  it("+v 는 outward 쪽 — 윗눈꺼풀은 눈썹 쪽(화면 위), 아랫눈꺼풀은 볼 쪽(화면 아래)", () => {
    const up = lidStrip(arch(20), { x: 0, y: -1 }, 100, meta.textures.up);
    const mid = up[Math.floor(up.length / 2)]!;
    expect(mid[2]!.at.y).toBeLessThan(mid[1]!.at.y);
    const low = lidStrip(flat(), { x: 0, y: 1 }, 100, meta.textures.lower);
    const lm = low[Math.floor(low.length / 2)]!;
    expect(lm[2]!.at.y).toBeGreaterThan(lm[1]!.at.y);
  });

  it("고개를 기울이면 띠도 같이 돈다 — 화면 세로축에 묶이지 않는다", () => {
    const rot = (p: Pt): Pt => ({ x: p.x * Math.cos(0.5) - p.y * Math.sin(0.5), y: p.x * Math.sin(0.5) + p.y * Math.cos(0.5) });
    const a = lidStrip(arch(20), { x: 0, y: -1 }, 100, meta.textures.up);
    const b = lidStrip(arch(20).map(rot), rot({ x: 0, y: -1 }), 100, meta.textures.up);
    a.forEach((col, i) => col.forEach((q, r) => {
      const e = rot(q.at), g = b[i]![r]!.at;
      expect(g.x).toBeCloseTo(e.x, 6);
      expect(g.y).toBeCloseTo(e.y, 6);
    }));
  });

  it("눈 폭에 비례해 커진다", () => {
    const small = lidStrip(arch(20), { x: 0, y: -1 }, 100, meta.textures.down);
    const big = lidStrip(arch(20).map((p) => ({ x: p.x * 2, y: p.y * 2 })), { x: 0, y: -1 }, 200, meta.textures.down);
    const len = (c: typeof small[number]): number => Math.hypot(c[0]!.at.x - c[2]!.at.x, c[0]!.at.y - c[2]!.at.y);
    expect(len(big[10]!)).toBeCloseTo(len(small[10]!) * 2, 6);
  });
});

describe("텍스처 좌표·아핀", () => {
  it("uMin/vMax → 그림 왼쪽 위, uMax/vMin → 오른쪽 아래", () => {
    const t = meta.textures.up;
    expect(texPx(meta.uMin, t.vMax, meta, t, 768, 300)).toEqual({ x: 0, y: 0 });
    const br = texPx(meta.uMax, t.vMin, meta, t, 768, 300);
    expect(br.x).toBeCloseTo(768, 6);
    expect(br.y).toBeCloseTo(300, 6);
  });
  it("세 점을 정확히 옮긴다, 한 줄 위의 점이면 null", () => {
    const s = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }];
    const d = [{ x: 5, y: 5 }, { x: 5, y: 25 }, { x: -15, y: 5 }];
    const m = affine(s[0]!, s[1]!, s[2]!, d[0]!, d[1]!, d[2]!)!;
    const ap = (p: Pt): Pt => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });
    s.forEach((p, i) => { expect(ap(p).x).toBeCloseTo(d[i]!.x, 9); expect(ap(p).y).toBeCloseTo(d[i]!.y, 9); });
    expect(affine(s[0]!, s[1]!, { x: 20, y: 0 }, d[0]!, d[1]!, d[2]!)).toBeNull();
  });
});

describe.each(STYLES)("PNG 규격(%s) — 그림을 갈아 끼워도 지켜야 할 것", (style) => {
  const m = metaOf(style);
  for (const [key, t] of Object.entries(m.textures)) {
    it(`${key}: 파일이 있고, 세로 픽셀 비율이 v 범위와 맞고, 뿌리 선(v=0)이 그림 안에 있다`, () => {
      const png = PNG.sync.read(readFileSync(new URL(`../public/lashes/${style}/${t.file}`, import.meta.url)));
      const ppuX = png.width / (m.uMax - m.uMin);
      const ppuY = png.height / (t.vMax - t.vMin);
      // 실사 참고 사진(natural/deep)은 절차 생성보다 가로로 좀 더 납작할 수 있어 아래쪽 여유를 조금 더 뒀다(2026-10-01)
      expect(ppuY / ppuX).toBeGreaterThan(0.55);
      expect(ppuY / ppuX).toBeLessThan(1.6);
      expect(t.vMin).toBeLessThan(0);
      expect(t.vMax).toBeGreaterThan(0);
      // 뭔가 그려져 있다 (알파 > 0 인 픽셀이 1% 이상)
      let n = 0;
      for (let i = 3; i < png.data.length; i += 4) if (png.data[i]! > 0) n++;
      expect(n / (png.width * png.height)).toBeGreaterThan(0.01);
    });
  }
  it("up 은 뿌리 선 위(+v)에, down 은 아래(-v)에 가닥이 몰려 있다", () => {
    const mass = (key: "up" | "down"): number => {
      const t = m.textures[key];
      const png = PNG.sync.read(readFileSync(new URL(`../public/lashes/${style}/${t.file}`, import.meta.url)));
      const rootY = (t.vMax / (t.vMax - t.vMin)) * png.height;
      let above = 0, below = 0;
      for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
        const a = png.data[(y * png.width + x) * 4 + 3]!;
        if (y < rootY - 4) above += a; else if (y > rootY + 4) below += a;
      }
      return above / (above + below);
    };
    expect(mass("up")).toBeGreaterThan(0.8);
    expect(mass("down")).toBeLessThan(0.2);
  });
});
