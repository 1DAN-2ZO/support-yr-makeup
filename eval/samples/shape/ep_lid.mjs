// 얼굴 점의 윗눈꺼풀 선이 실제 눈꺼풀 가장자리와 얼마나 어긋나나 — EasyPortrait 의 사람이 그린 눈 마스크(클래스 5·6)와 비교
//   node eval/samples/shape/ep_lid.mjs
// 윗눈꺼풀 점(양 끝 제외)마다 수직 방향으로 눈 마스크의 위 경계까지 거리를 잰다 (눈 폭 %). + = 점이 눈 안쪽(눈알 위)에 있다, − = 점이 눈꺼풀 피부 위에 있다
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..").replaceAll("\\", "/");
if (!process.env.DHE_DATA_DIR) { console.error("DHE_DATA_DIR 를 정해 주세요 (사진은 저장소 밖에 둔다)"); process.exit(1); }
const W = join(process.env.DHE_DATA_DIR.replaceAll("\\", "/"), "easyportrait/work");
const require = createRequire(pathToFileURL(join(ROOT, "client/package.json")));
const { PNG } = require("pngjs");
const UPPER = { R: [33, 246, 161, 160, 159, 158, 157, 173, 133], L: [263, 466, 388, 387, 386, 385, 384, 398, 362] };
const q = (v, p) => v.slice().sort((a, b) => a - b)[Math.min(v.length - 1, Math.floor(v.length * p))];
const all = [], perFace = [], byPos = Array.from({ length: 9 }, () => []);
let faces = 0, closed = 0;
for (const id of readdirSync(W).filter((f) => f.endsWith(".lm.json")).map((f) => f.slice(0, -8)).sort()) {
  const mk = PNG.sync.read(readFileSync(join(W, `${id}.mask.png`))), lm = JSON.parse(readFileSync(join(W, `${id}.lm.json`), "utf8"));
  const isEye = (x, y) => { const X = Math.round(x), Y = Math.round(y); if (X < 0 || Y < 0 || X >= mk.width || Y >= mk.height) return false; const c = mk.data[(Y * mk.width + X) * 4]; return c === 5 || c === 6; };
  const mine = [];
  for (const s of ["R", "L"]) {
    const pts = UPPER[s].map((i) => lm[i]), e = Math.hypot(pts[0].x - pts[8].x, pts[0].y - pts[8].y);
    // 눈 마스크가 거의 없으면(감은 눈) 뺀다
    let area = 0; for (let t = 0.1; t < 1; t += 0.1) for (let d = -0.2; d <= 0.2; d += 0.02) if (isEye(pts[0].x + (pts[8].x - pts[0].x) * t, pts[0].y + (pts[8].y - pts[0].y) * t + d * e)) area++;
    if (area < 8) { closed++; continue; }
    for (let i = 1; i < 8; i++) {
      const a = pts[i - 1], b = pts[i + 1], len = Math.hypot(b.x - a.x, b.y - a.y) || 1; let n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len }; if (n.y > 0) n = { x: -n.x, y: -n.y };
      const at = (o) => isEye(pts[i].x + n.x * o * e, pts[i].y + n.y * o * e);
      let d = null;
      if (at(0)) { for (let o = 0; o <= 0.2; o += 0.0025) if (!at(o)) { d = o; break; } }   // 점이 눈 안: 위로 올라가 마스크를 벗어나는 자리
      else { for (let o = 0; o >= -0.2; o -= 0.0025) if (at(o)) { d = o; break; } }           // 점이 눈 밖: 아래로 내려가 마스크에 닿는 자리
      if (d === null) continue;
      all.push(d); mine.push(d); byPos[i].push(d);
    }
  }
  if (mine.length) { faces++; perFace.push(q(mine, 0.5)); }
}
const pc = (v) => (v * 100).toFixed(1);
console.log(`EasyPortrait ${faces}명 · 점 ${all.length}개 (감은 눈 ${closed}개 제외) — 윗눈꺼풀 점에서 눈 마스크 위 경계까지 (눈 폭 %, + = 점이 눈 안쪽)`);
console.log(`점 전체: 중앙 ${pc(q(all, 0.5))} · 하위 10% ${pc(q(all, 0.1))} · 상위 25% ${pc(q(all, 0.75))} · 상위 10% ${pc(q(all, 0.9))}`);
console.log(`눈 안쪽에 찍힌 점: ${pc(all.filter((d) => d > 0).length / all.length)}% · 2% 넘게 안쪽 ${pc(all.filter((d) => d > 0.02).length / all.length)}% · 4% 넘게 안쪽 ${pc(all.filter((d) => d > 0.04).length / all.length)}%`);
console.log(`사람별 중앙값: 중앙 ${pc(q(perFace, 0.5))} · 상위 10% ${pc(q(perFace, 0.9))} · 2% 넘는 사람 ${pc(perFace.filter((d) => d > 0.02).length / perFace.length)}% · 4% 넘는 사람 ${pc(perFace.filter((d) => d > 0.04).length / perFace.length)}%`);
console.log("자리별 중앙 (바깥 → 안쪽): " + byPos.slice(1, 8).map((v) => pc(q(v, 0.5))).join(" · "));
