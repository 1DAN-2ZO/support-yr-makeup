#!/usr/bin/env node
/**
 * 합성 화장 세트 — 실제 맨얼굴 위에 화장 템플릿 색을 네 단계로 칠하고, 앱과 같은 채점 코드로 판정한다.
 *
 *   덜 채움(under) · 적당함(ok) · 조금 번짐(slight) · 많이 번짐(heavy)   → 기대 판정 slight · ok · slight · off
 *
 * 골든 세트(사람 라벨)가 오기 전에 채점 **논리**를 본다: 단계 순서대로 점수가 나오는지, 화장·부위별 구멍이 있는지.
 * 정답을 우리가 정해 칠한 것이라 라벨이 필요 없다. 대신
 *   - '적당함' 은 채점과 같은 가이드로 칠하니 높게 나오는 게 당연하다 (스스로 모순이 없는지만 본다)
 *   - 화장이 고른 색이라 실제보다 쉽다 — 여기 일치율은 "합성 기준"이고 기준값 확정·발표 숫자로 쓰지 않는다
 *
 *   stdin   {"bare_dir": "<PNG·lm.json 폴더>", "out_dir": "<결과 폴더>", "looks": ["edgy", …] | null, "limit": 사람 수 | null}
 *   out     <out_dir>/results.json  [{person, look, part, level, expect, pred, score, status, check_reason, codes, crop}]
 *           <out_dir>/crops/<person>/<look>/<part>_<level>.png   부위만 잘라 낸 그림 (bare = 맨얼굴)
 *
 * 사진은 저장소에 넣지 않는다 — bare_dir · out_dir 은 $DHE_DATA_DIR 아래. 묶어 돌리기: eval/samples/painted.py
 * 판정은 eval/score/score_cli.mjs 의 judge 를 그대로 쓴다 (평가마다 판정이 달라지면 안 된다).
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { foldLabel, judge, loadCore, lookParts } from "../score/score_cli.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const require = createRequire(pathToFileURL(join(ROOT, "client", "package.json")));

export const PARTS = ["brow", "liner", "shadow", "lip", "cheek"];
export const LEVELS = ["under", "ok", "slight", "heavy"];
/** 단계 → 사람 판정 3단계 (골든 세트와 같은 말) */
export const EXPECT = { under: "slight", ok: "ok", slight: "slight", heavy: "off" };
/** 형태 부위(눈썹·라이너·입술)를 덮는 비율 — 채점의 subtleCover 와 같은 가정. 섀도우·볼은 템플릿 진하기 */
const COVER = 0.7;
const LIP_INNER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95];

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const centroid = (ps) => ({ x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length });
const scaled = (ps, k) => { const c = centroid(ps); return ps.map((p) => mix(c, p, k)); };

function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
function distToPath(x, y, path, closed = false) {
  let best = Infinity;
  const n = closed ? path.length + 1 : path.length;
  for (let i = 1; i < n; i++) {
    const a = path[i - 1], b = path[i % path.length], dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(x - a.x - t * dx, y - a.y - t * dy));
  }
  return best;
}
/** 다각형 안이거나 가장자리에서 grow px 안 */
const near = (poly, grow) => (x, y) => inPoly(x, y, poly) || (grow > 0 && distToPath(x, y, poly, true) <= grow);

/**
 * 부위·단계 → 칠할 자리 판정기 목록 (좌우 하나씩 또는 하나). bbox 는 칠할 범위.
 * 치수는 눈 폭(eyeW)·입술 폭 비율 — 채점 허용 한계(rules/score.json tol)보다 조금 넘게 = slight, 크게 넘게 = heavy
 */
export function shapes(core, part, level, lm, lookPartsOf, guideGeom, unit) {
  const P = (i) => lm[i], LM = core.LM;
  const sides = [{ eye: LM.eyeA, brow: LM.browA }, { eye: LM.eyeB, brow: LM.browB }];
  const eyeW = unit.eye;
  if (part === "brow") {
    return sides.map(({ brow }, i) => {
      // 가이드가 눈썹 테두리를 주면(개인화 가이드) 화면에 보이는 그 테두리대로 칠한다. 없으면 얼굴 점의 눈썹 자리
      const poly = guideGeom?.regions?.[i === 0 ? "R" : "L"] ?? [...brow.upper.map(P), ...[...brow.lower].reverse().map(P)];
      // 꼬리 = 얼굴 가운데(미간 168)에서 먼 끝. 덜 채움은 꼬리 쪽 35% 를 비운다
      const far = poly.slice().sort((a, b) => dist(a, P(168)) - dist(b, P(168)));
      const head = far[0], tail = far[far.length - 1], len2 = (tail.x - head.x) ** 2 + (tail.y - head.y) ** 2 || 1;
      const along = (x, y) => ((x - head.x) * (tail.x - head.x) + (y - head.y) * (tail.y - head.y)) / len2;
      const grow = level === "slight" ? 0.04 * eyeW : level === "heavy" ? 0.12 * eyeW : 0;
      const inside = near(poly, grow);
      return { poly, grow, test: level === "under" ? (x, y) => inside(x, y) && along(x, y) <= 0.65 : inside };
    });
  }
  if (part === "liner") {
    const g = guideGeom.liner;
    return ["R", "L"].map((s, i) => {
      const { eye } = sides[i];
      const lid = [...eye.upper.map(P)].reverse();   // 안쪽 → 바깥
      const t = g.thick * eyeW * (level === "heavy" ? 2.5 : 1) + (level === "slight" ? 0.025 * eyeW : 0);
      const tip = g.wing[s][1], outer = g.wing[s][0];
      const wingEnd = level === "heavy" ? mix(outer, tip, 1.8) : tip;
      const up = (p) => ({ x: p.x, y: p.y - t / 2 });   // 속눈썹 선 위쪽으로만 두꺼워진다
      const full = [...lid.map(up), up(wingEnd)];
      const path = level === "under" ? full.slice(0, Math.max(2, Math.round(lid.length * 0.65))) : full;   // 꼬리 쪽을 비운다
      return { poly: path, grow: t / 2, test: (x, y) => distToPath(x, y, path) <= t / 2 };
    });
  }
  if (part === "lip") {
    const outer = LM.lipsOuter.map(P), inner = LIP_INNER.map(P), lipW = dist(P(61), P(291));
    const poly = level === "under" ? scaled(outer, 0.8) : outer;
    const grow = level === "slight" ? 0.03 * lipW : level === "heavy" ? 0.09 * lipW : 0;
    const inside = near(poly, grow);
    return [{ poly, grow, test: (x, y) => inside(x, y) && !inPoly(x, y, inner) }];
  }
  if (part === "shadow") {
    // 가이드 = [속눈썹 선 n점, 위 경계 n점(거꾸로)]. 위 경계를 눈썹 쪽으로 당기거나 늘린다
    const k = { under: 0.45, ok: 1, slight: 1.35, heavy: 1.9 }[level];
    return ["R", "L"].map((s) => {
      const reg = guideGeom.regions[s], n = reg.length / 2, lid = reg.slice(0, n), top = reg.slice(n).reverse();
      const poly = [...lid, ...top.map((q, i) => mix(lid[i], q, k)).reverse()];
      return { poly, grow: 0, test: (x, y) => inPoly(x, y, poly) };
    });
  }
  // cheek: 가이드 타원을 가운데 기준으로 줄이거나 키운다
  const k = { under: 0.65, ok: 1, slight: 1.3, heavy: 1.7 }[level];
  return ["R", "L"].map((s) => { const poly = scaled(guideGeom.regions[s], k); return { poly, grow: 0, test: (x, y) => inPoly(x, y, poly) }; });
}

/** 맨얼굴 사본에 칠한다. 칠한 픽셀 수를 돌려준다 */
export function paint(im, shapeList, color, cover) {
  const data = new Uint8ClampedArray(im.data);
  let n = 0;
  for (const sh of shapeList) {
    const xs = sh.poly.map((p) => p.x), ys = sh.poly.map((p) => p.y), pad = Math.ceil(sh.grow) + 1;
    const x0 = Math.max(0, Math.floor(Math.min(...xs)) - pad), x1 = Math.min(im.w - 1, Math.ceil(Math.max(...xs)) + pad);
    const y0 = Math.max(0, Math.floor(Math.min(...ys)) - pad), y1 = Math.min(im.h - 1, Math.ceil(Math.max(...ys)) + pad);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!sh.test(x + 0.5, y + 0.5)) continue;
      const o = (y * im.w + x) * 4;
      for (let c = 0; c < 3; c++) data[o + c] = data[o + c] * (1 - cover) + color[c] * cover;
      n++;
    }
  }
  return { im: { data, w: im.w, h: im.h }, painted: n };
}

/** 부위를 보기 좋게 자를 범위 */
function cropBox(core, part, lm, unit, im) {
  const P = (i) => lm[i], LM = core.LM, e = unit.eye;
  const eyePts = [...LM.eyeA.upper, ...LM.eyeA.lower, ...LM.eyeB.upper, ...LM.eyeB.lower, ...LM.browA.upper, ...LM.browB.upper].map(P);
  let pts, pad;
  if (part === "lip") { pts = LM.lipsOuter.map(P); pad = 0.5 * e; }
  else if (part === "cheek") { pts = [P(LM.faceL), P(LM.faceR), P(LM.cheekA), P(LM.cheekB), ...LM.eyeA.lower.map(P), P(0)]; pad = 0.15 * e; }
  else { pts = eyePts; pad = 0.45 * e; }
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x0 = Math.max(0, Math.floor(Math.min(...xs) - pad)), y0 = Math.max(0, Math.floor(Math.min(...ys) - pad));
  return { x0, y0, w: Math.min(im.w, Math.ceil(Math.max(...xs) + pad)) - x0, h: Math.min(im.h, Math.ceil(Math.max(...ys) + pad)) - y0 };
}
function writeCrop(path, im, box) {
  const { PNG } = require("pngjs");
  const png = new PNG({ width: box.w, height: box.h });
  for (let y = 0; y < box.h; y++) png.data.set(im.data.subarray(((box.y0 + y) * im.w + box.x0) * 4, ((box.y0 + y) * im.w + box.x0 + box.w) * 4), y * box.w * 4);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, PNG.sync.write(png));
}

async function main() {
  const input = JSON.parse(readFileSync(0, "utf8") || "{}");
  const bareDir = resolve(String(input.bare_dir)), outDir = resolve(String(input.out_dir));
  const { PNG } = require("pngjs");
  const core = await loadCore();
  const allLooks = JSON.parse(readFileSync(join(ROOT, "rules", "looks.json"), "utf8")).looks.map((l) => l.id);
  const looks = Array.isArray(input.looks) && input.looks.length ? input.looks : allLooks;
  let persons = readdirSync(bareDir).filter((f) => f.endsWith(".lm.json")).map((f) => f.slice(0, -8)).sort();
  if (input.limit) persons = persons.slice(0, input.limit);
  const rows = [];
  for (const [pi, person] of persons.entries()) {
    const raw = PNG.sync.read(readFileSync(join(bareDir, `${person}.png`)));
    const bare = { data: raw.data, w: raw.width, h: raw.height };
    const lm = JSON.parse(readFileSync(join(bareDir, `${person}.lm.json`), "utf8")).map((p) => ({ x: +p.x, y: +p.y }));
    const base = core.frameOf(bare, lm);
    for (const part of PARTS) writeCrop(join(outDir, "crops", person, `bare_${part}.png`), bare, cropBox(core, part, lm, base.unit, bare));
    for (const look of looks) {
      const parts = lookParts(look), guide = core.lookGuide(parts);
      for (const part of PARTS) {
        const lp = parts[part], color = lp?.color;
        if (!color) continue;
        const cover = part === "shadow" || part === "cheek" ? (lp.alphaR ?? lp.alpha ?? COVER) : COVER;
        const geom = guide(part, base), box = cropBox(core, part, lm, base.unit, bare);
        for (const level of LEVELS) {
          const { im, painted } = paint(bare, shapes(core, part, level, lm, parts, geom, base.unit), color, cover);
          const j = judge(core, guide, part, look, base, im, lm);
          const crop = join("crops", person, look, `${part}_${level}.png`);
          writeCrop(join(outDir, crop), im, box);
          rows.push({ person, look, part, level, expect: EXPECT[level], pred: j.pred, score: j.score, status: j.status, check_reason: j.check_reason, codes: j.codes, painted, crop: crop.replaceAll("\\", "/") });
        }
      }
    }
    process.stderr.write(`paint_levels: ${pi + 1}/${persons.length} ${person}\n`);
  }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "results.json"), JSON.stringify(rows));
  process.stdout.write(JSON.stringify({ rows: rows.length, persons: persons.length, looks }) + "\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((e) => { process.stderr.write(`paint_levels 실패: ${e?.stack ?? e}\n`); process.exit(1); });
}
// foldLabel 은 판정 3단계 기준(점수 80·50)을 보고 싶은 쪽이 가져다 쓴다
export { foldLabel };
