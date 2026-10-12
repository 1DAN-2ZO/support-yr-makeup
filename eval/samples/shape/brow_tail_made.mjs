// 서버가 만든 정답사진(② 의 방식)에서 눈썹 꼬리가 늘어나 읽히는가 (실험 62) — browTail (client/src/core/feedback-measure.ts) 그대로
//   DHE_DATA_DIR=D:/nudy-data node eval/samples/shape/brow_tail_made.mjs <work 아래 폴더> ...
//   폴더: bare.png · bare.lm.json · bare.hair.png (머리카락 분할, 흰 칸 = 머리카락) · t_<이름>.png (맨얼굴과 겹친 정답사진). 사진은 저장소 밖
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..").replaceAll("\\", "/");
if (!process.env.DHE_DATA_DIR || !process.argv[2]) { console.error("DHE_DATA_DIR 와 폴더를 주세요 (사진은 저장소 밖에 둔다)"); process.exit(1); }
const DATA = process.env.DHE_DATA_DIR.replaceAll("\\", "/"), CLIENT = join(ROOT, "client");
const require = createRequire(pathToFileURL(join(CLIENT, "package.json")));
const esbuild = require("esbuild"), { PNG } = require("pngjs");
const r = await esbuild.build({ stdin: { contents: 'export { frameOf } from "./src/core/sampling";\nexport { browTail } from "./src/core/feedback-measure";', resolveDir: CLIENT, loader: "ts" }, bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent" });
const OUT = join(DATA, "work/shape-out"); mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "brow-tail-made-core.mjs"), r.outputFiles[0].text);
const core = await import(pathToFileURL(join(OUT, "brow-tail-made-core.mjs")).href);
const png = (f) => { const p = PNG.sync.read(readFileSync(f)); return { data: p.data, w: p.width, h: p.height }; };
const f2 = (v) => (v == null ? " 없음" : v.toFixed(2).padStart(5)), pc = (a, b) => (a == null || b == null ? "   -" : `${a - b >= 0 ? "+" : ""}${((a - b) * 100).toFixed(0)}%`.padStart(5));
for (const d of process.argv.slice(2)) {
  const D = `${DATA}/work/${d}`, lm = JSON.parse(readFileSync(`${D}/bare.lm.json`, "utf8"));
  const hp = PNG.sync.read(readFileSync(`${D}/bare.hair.png`)), hair = { w: hp.width, h: hp.height, data: Float32Array.from({ length: hp.width * hp.height }, (_, i) => hp.data[i * 4] / 255) };
  const bare = core.frameOf(png(`${D}/bare.png`), lm, hair), bR = core.browTail(bare, "R"), bL = core.browTail(bare, "L");
  console.log(`\n[${d}] 맨얼굴의 눈썹 끝 R ${f2(bR)} · L ${f2(bL)}   (얼굴 점의 꼬리 = 1)`);
  for (const f of readdirSync(D).filter((n) => /^t_.+\.png$/.test(n)).sort()) {
    const t = core.frameOf(png(`${D}/${f}`), lm, hair), R = core.browTail(t, "R"), L = core.browTail(t, "L");
    console.log(`  ${f.replace(/^t_|\.png$/g, "").padEnd(8)} 끝 ${f2(R)} · ${f2(L)}   늘린 양 ${pc(R, bR)} · ${pc(L, bL)}`);
  }
}
