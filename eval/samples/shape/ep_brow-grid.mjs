// 눈썹 채움 기준값 찾기 — 정답 마스크와 가장 잘 맞는 (최소 어두움, 눈썹 진하기 비율, 진하기 지점)
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { dirname as _dn, resolve as _rs } from "node:path";
import { fileURLToPath as _fu } from "node:url";
const ROOT = _rs(_dn(_fu(import.meta.url)), "..", "..", "..").replaceAll("\\", "/");
if (!process.env.DHE_DATA_DIR) { console.error("DHE_DATA_DIR 를 정해 주세요 (사진은 저장소 밖에 둔다)"); process.exit(1); }
const DATA = process.env.DHE_DATA_DIR.replaceAll("\\", "/");
const CLIENT = join(ROOT, "client"), W = join(DATA, "easyportrait/work"), OUT = join(DATA, "work/shape-out");
const require = createRequire(pathToFileURL(join(CLIENT, "package.json")));
const { PNG } = require("pngjs");
const core = await import(pathToFileURL(join(OUT, "core.mjs")).href);
const inPoly = (x, y, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c; } return c; };
const dEdge = (x, y, poly) => { let best = Infinity; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], dx = b.x - a.x, dy = b.y - a.y; const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1))); best = Math.min(best, Math.hypot(x - a.x - t * dx, y - a.y - t * dy)); } return best; };
const med = (v) => v.slice().sort((a, b) => a - b)[Math.floor(v.length / 2)];
const look = core.LOOKS.find((l) => l.id === "chic");
const ids = readdirSync(W).filter((f) => f.endsWith(".lm.json")).map((f) => f.slice(0, -8)).sort();
const data = [];   // {truth, inside:[L], skinL, split}
ids.forEach((id, k) => {
  const p = PNG.sync.read(readFileSync(join(W, `${id}.png`))), im = { data: p.data, w: p.width, h: p.height };
  const mk = PNG.sync.read(readFileSync(join(W, `${id}.mask.png`)));
  const cls = (x, y) => mk.data[(Math.round(y) * mk.width + Math.round(x)) * 4];
  const lm = JSON.parse(readFileSync(join(W, `${id}.lm.json`), "utf8"));
  const f = core.frameOf(im, lm), reg = core.planGuide(look.parts, core.resolvePlan(core.measureFace(lm)))("brow", f).regions;
  if (!reg) return;
  const box = core.boxOf(f.unit.eye), e = f.unit.eye, near = 0.1 * e, far = 0.28 * e;
  for (const s of ["R", "L"]) {
    const poly = reg[s], xs = poly.map((q) => q.x), ys = poly.map((q) => q.y);
    const inside = [], ring = [], gt = [], pos = []; let n = 0, brow = 0, other = 0; const c168 = lm[168]; const dd = poly.map((q) => Math.hypot(q.x - c168.x, q.y - c168.y)), lo = Math.min(...dd), hi = Math.max(...dd);
    for (let y = Math.max(0, Math.floor(Math.min(...ys) - far)); y <= Math.min(im.h - 1, Math.ceil(Math.max(...ys) + far)); y += box) for (let x = Math.max(0, Math.floor(Math.min(...xs) - far)); x <= Math.min(im.w - 1, Math.ceil(Math.max(...xs) + far)); x += box) {
      if (inPoly(x, y, poly)) { n++; const c = cls(x, y); if (c === 3 || c === 4) brow++; else if (c !== 2) other++; inside.push(core.labBox(im, x, y, box).L); gt.push(c === 3 || c === 4); pos.push((Math.hypot(x - c168.x, y - c168.y) - lo) / (hi - lo)); continue; }
      const d = dEdge(x, y, poly); if (d >= near && d <= far) ring.push(core.labBox(im, x, y, box).L);
    }
    if (n < 20 || other / n >= 0.1 || !ring.length) continue;
    data.push({ truth: brow / n, inside, gt, pos, skinL: med(ring), split: k % 2 });   // 사람 단위로 반 나눔 (맞추기 / 확인)
  }
});
const evalP = (xs, minDark, frac, pct) => {
  let ae = 0, sx = 0, sy = 0, sxy = 0, mx = 0, my = 0, bias = 0; const est = [];
  for (const r of xs) { const srt = r.inside.slice().sort((a, b) => a - b), dark = srt[Math.floor(srt.length * pct)]; const need = Math.max(minDark, (r.skinL - dark) * frac); est.push(r.inside.filter((L) => r.skinL - L >= need).length / r.inside.length); }
  xs.forEach((r, i) => { ae += Math.abs(est[i] - r.truth); bias += est[i] - r.truth; mx += r.truth; my += est[i]; });
  mx /= xs.length; my /= xs.length; xs.forEach((r, i) => { sxy += (r.truth - mx) * (est[i] - my); sx += (r.truth - mx) ** 2; sy += (est[i] - my) ** 2; });
  return { mae: ae / xs.length, bias: bias / xs.length, corr: sxy / Math.sqrt(sx * sy) };
};
const fit = data.filter((r) => r.split === 0), test = data.filter((r) => r.split === 1);
const out = [];
for (const minDark of [2, 3, 4, 5, 6]) for (const frac of [0, 0.15, 0.25, 0.35, 0.5]) for (const pct of [0.1, 0.25]) out.push({ minDark, frac, pct, ...evalP(fit, minDark, frac, pct) });
out.sort((a, b) => a.mae - b.mae);
console.log(`눈썹 ${data.length}개 (맞추기 ${fit.length} · 확인 ${test.length})`);
console.log("맞추기 쪽 상위 5:"); for (const o of out.slice(0, 5)) console.log(`  최소 ${o.minDark} · 비율 ${o.frac} · 지점 ${o.pct} → 평균 오차 ${(o.mae * 100).toFixed(1)}%p · 치우침 ${(o.bias * 100).toFixed(1)}%p · 상관 ${o.corr.toFixed(2)}`);
const b = out[0], t = evalP(test, b.minDark, b.frac, b.pct), cur = evalP(test, 5, 0.5, 0.1);
console.log(`확인 쪽(안 쓴 사람): 고른 값 → 평균 오차 ${(t.mae * 100).toFixed(1)}%p · 치우침 ${(t.bias * 100).toFixed(1)}%p · 상관 ${t.corr.toFixed(2)}  |  지금 값(5·0.5·0.1) → ${(cur.mae * 100).toFixed(1)}%p · ${(cur.bias * 100).toFixed(1)}%p · ${cur.corr.toFixed(2)}`);
// 칸 단위 — 확인 쪽에서, 고른 값으로
const cell = (xs, minDark, frac, pct, keep = () => true) => { let tp = 0, fp = 0, fn = 0, tn = 0; for (const r of xs) { const srt = r.inside.slice().sort((a, b) => a - b), need = Math.max(minDark, (r.skinL - srt[Math.floor(srt.length * pct)]) * frac); r.inside.forEach((L, i) => { if (!keep(r.pos[i])) return; const p = r.skinL - L >= need, g = r.gt[i]; if (p && g) tp++; else if (p) fp++; else if (g) fn++; else tn++; }); } return { acc: (tp + tn) / (tp + fp + fn + tn), prec: tp / (tp + fp), rec: tp / (tp + fn), iou: tp / (tp + fp + fn), base: (tp + fn) / (tp + fp + fn + tn) }; };
const show = (nm, c) => console.log(`${nm}: 정확도 ${(c.acc * 100).toFixed(0)}% (전부 눈썹이라 답하면 ${(c.base * 100).toFixed(0)}%) · 눈썹이라 한 칸 중 맞은 비율 ${(c.prec * 100).toFixed(0)}% · 실제 눈썹 칸 중 찾은 비율 ${(c.rec * 100).toFixed(0)}% · IoU ${c.iou.toFixed(2)}`);
show("칸 단위 전체", cell(test, b.minDark, b.frac, b.pct));
show("칸 단위 꼬리 쪽 40%", cell(test, b.minDark, b.frac, b.pct, (t) => t >= 0.6));
// 꼬리 쪽 채움: 사람마다 차이가 큰 구간에서 추정이 정답을 따라가나
{ const tr = [], es = []; for (const r of test) { const srt = r.inside.slice().sort((a, b) => a - b), need = Math.max(b.minDark, (r.skinL - srt[Math.floor(srt.length * b.pct)]) * b.frac); let n = 0, g = 0, p = 0; r.inside.forEach((L, i) => { if (r.pos[i] < 0.6) return; n++; if (r.gt[i]) g++; if (r.skinL - L >= need) p++; }); if (n >= 5) { tr.push(g / n); es.push(p / n); } }
  const mx = tr.reduce((a, v) => a + v, 0) / tr.length, my = es.reduce((a, v) => a + v, 0) / es.length; let sxy = 0, sx = 0, sy = 0; tr.forEach((v, i) => { sxy += (v - mx) * (es[i] - my); sx += (v - mx) ** 2; sy += (es[i] - my) ** 2; });
  const mae = tr.reduce((a, v, i) => a + Math.abs(v - es[i]), 0) / tr.length, mm = med(tr), base = tr.reduce((a, v) => a + Math.abs(v - mm), 0) / tr.length;
  console.log(`꼬리 쪽 채움 (${tr.length}개): 정답 중앙 ${(mm * 100).toFixed(0)}% · 평균 오차 ${(mae * 100).toFixed(1)}%p (같은 값만 답하면 ${(base * 100).toFixed(1)}%p) · 상관 ${(sxy / Math.sqrt(sx * sy)).toFixed(2)}`); }
// 기준선: 항상 정답 중앙값을 찍는 경우
const m = med(fit.map((r) => r.truth)); console.log(`참고 — 누구에게나 ${(m * 100).toFixed(0)}% 라고 답하면 평균 오차 ${(test.reduce((a, r) => a + Math.abs(m - r.truth), 0) / test.length * 100).toFixed(1)}%p`);
