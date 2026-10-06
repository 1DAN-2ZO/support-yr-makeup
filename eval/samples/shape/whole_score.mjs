// 마지막 전체 사진 한 장을 정답 그림과 비교 — scoreWhole(score-shape.ts)을 실사진에 돌린다 (실험 21)
//   DHE_DATA_DIR=D:/nudy-data node eval/samples/shape/whole_score.mjs        (LOOK=edgy — 섀도우 영역을 가져올 화장)
//   사진: $DHE_DATA_DIR/work/final-whole/ (저장소 밖 · final_whole.py 가 만들어 둔다)
//     _bare · _made            맨얼굴과 그 위에 화장을 입힌 생성 그림 (겹친다 — 정답 그림은 맨얼굴의 얼굴 점을 쓴다)
//     cN_bare                  다시 찍은 진짜 맨얼굴 (4 같은 자리 가로 · 2 집 낮 · 1 학원)
//     cN_1..5                  그 위에 생성 그림의 화장을 얹은 것: 그대로 · 입술 빼먹음 · 섀도우 색 다름 · 볼 옅음 · 볼 아래로
//   확인 사진의 얼굴 점은 두 가지로: 앱처럼 맨얼굴 점을 맞춘 것(alignedFrame) / 그 사진에서 뽑은 점 그대로
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..").replaceAll("\\", "/");
if (!process.env.DHE_DATA_DIR) { console.error("DHE_DATA_DIR 를 정해 주세요 (사진은 저장소 밖에 둔다)"); process.exit(1); }
const DATA = process.env.DHE_DATA_DIR.replaceAll("\\", "/"), CLIENT = join(ROOT, "client"), T = join(DATA, "work/final-whole").replaceAll("\\", "/");
const LOOK = process.env.LOOK ?? "edgy";
const require = createRequire(pathToFileURL(join(CLIENT, "package.json")));
const esbuild = require("esbuild"), { PNG } = require("pngjs");
const r = await esbuild.build({ stdin: { contents: [
  'export { frameOf } from "./src/core/sampling";',
  'export { planGuide } from "./src/core/personal-guide";',
  'export { resolvePlan } from "./src/core/personalize";',
  'export { measureFace } from "./src/core/face-measure";',
  'export { alignedFrame } from "./src/core/score-part";',
  'export { scoreWhole, WHOLE } from "./src/core/score-shape";',
  'export { LOOKS } from "./src/core/looks";',
  'export { LM } from "./src/core/landmarks";',
].join("\n"), resolveDir: CLIENT, loader: "ts" }, bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent" });
const OUT = join(DATA, "work/shape-out"); mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "whole-core.mjs"), r.outputFiles[0].text);
const core = await import(pathToFileURL(join(OUT, "whole-core.mjs")).href);

const LM = core.LM, png = (f) => { const p = PNG.sync.read(readFileSync(f)); return { data: p.data, w: p.width, h: p.height }; };
const load = (n) => ({ im: png(`${T}/${n}.png`), lm: JSON.parse(readFileSync(`${T}/${n}.lm.json`, "utf8")) });
const pts = (f, ids) => ids.map((i) => f.lm[i]);
const eyePolys = (f) => [LM.eyeA, LM.eyeB].map((e) => [...pts(f, e.upper), ...pts(f, e.lower).reverse()]);
const browPolys = (f) => [LM.browA, LM.browB].map((b) => [...pts(f, b.upper), ...pts(f, b.lower).reverse()]);
const guideOf = (lm) => core.planGuide(core.LOOKS.find((l) => l.id === LOOK).parts, core.resolvePlan(core.measureFace(lm)));
const PARTS = {
  "입술": () => (f) => ({ polys: [pts(f, LM.lipsOuter)] }),
  "섀도우": (g) => (f) => { const reg = g("shadow", f).regions; return { polys: [reg.R, reg.L], avoid: [...eyePolys(f), ...browPolys(f)] }; },
  "눈썹": () => (f) => ({ polys: browPolys(f), avoid: eyePolys(f) }),
};
const WORD = { similar: "비슷", none: "안 그림", weak: "옅음", strong: "진함", color: "색 다름", check_only: "확인만" };
const cell = (w) => (w.amount == null ? `   -      ${WORD[w.verdict]}` : `${w.amount.toFixed(2).padStart(5)} ${w.cos.toFixed(2).padStart(5)} ${WORD[w.verdict]}`).padEnd(20);

const b = load("_bare"), bare = core.frameOf(b.im, b.lm), target = core.frameOf(png(`${T}/_made.png`), b.lm), g = guideOf(b.lm);
console.log(`정답 변화의 크기 (채점은 ${core.WHOLE.minTarget} 이상만): ` + Object.entries(PARTS).map(([k, mk]) => `${k} ${core.scoreWhole(bare, target, target, mk(g)).target.toFixed(1)}`).join(" · "));
const CASES = ["bare", "1", "2", "3", "4", "5"], NAMES = ["맨얼굴(진짜)", "그대로 얹음", "입술 빼먹음", "섀도우 색 다름", "볼 옅음", "볼 아래로"];
for (const [mode, frameFor] of [["앱처럼 맨얼굴 점을 맞춤 (alignedFrame)", (m) => core.alignedFrame(bare, m.im, m.lm).frame], ["그 사진에서 뽑은 얼굴 점 그대로", (m) => core.frameOf(m.im, m.lm)]]) {
  console.log(`\n===== ${mode} — 부위별 양 · 색 · 판정`);
  console.log("".padEnd(20) + Object.keys(PARTS).map((k) => k.padEnd(20)).join(""));
  for (const n of ["4", "2", "1"]) {
    CASES.forEach((c, i) => {
      if (!existsSync(`${T}/c${n}_${c}.png`)) return;
      const cur = frameFor(load(`c${n}_${c}`));
      console.log(`사진${n} ${NAMES[i]}`.padEnd(18) + Object.values(PARTS).map((mk) => cell(core.scoreWhole(bare, target, cur, mk(g)))).join(""));
    });
  }
}
