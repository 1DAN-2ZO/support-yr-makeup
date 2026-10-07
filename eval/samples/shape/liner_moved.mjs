// 실제 화장을 모델로 옮긴 그림에서 라이너 꼬리 — 원본 크기(눈 폭 130px 쯤)에서 잰다 (실험 44). 줄어든 그림(눈 폭 52px)에서는 못 쟀다 (실험 43)
//   DHE_DATA_DIR=D:/nudy-data node eval/samples/shape/liner_moved.mjs <사람>
//   사진: work/trial/<사람>/hi — bare.png + bare.lm.json (얼굴만 자른 맨얼굴과 그 얼굴 점) · moved_<이름>.png (같은 크기의 부위 붙임 판). 저장소 밖
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..").replaceAll("\\", "/");
if (!process.env.DHE_DATA_DIR || !process.argv[2]) { console.error("DHE_DATA_DIR 와 사람 이름을 주세요 (사진은 저장소 밖에 둔다)"); process.exit(1); }
const DATA = process.env.DHE_DATA_DIR.replaceAll("\\", "/"), CLIENT = join(ROOT, "client"), H = process.env.DIR ? `${DATA}/work/${process.env.DIR}` : `${DATA}/work/trial/${process.argv[2]}/hi`;
// 다른 묶음에서 보기: DIR=<work 아래 폴더> BARE=<맨얼굴 파일 이름(확장자 빼고)> PAT=<볼 그림 이름의 정규식>
const BARE = process.env.BARE ?? "bare", PAT = new RegExp(process.env.PAT ?? "^moved_.+\.png$");
const require = createRequire(pathToFileURL(join(CLIENT, "package.json")));
const esbuild = require("esbuild"), { PNG } = require("pngjs");
const r = await esbuild.build({ stdin: { contents: 'export { frameOf } from "./src/core/sampling";\nexport { ridgeTail, TAIL_RIDGE } from "./src/core/feedback-measure";\nexport { LM, at } from "./src/core/landmarks";', resolveDir: CLIENT, loader: "ts" }, bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent" });
const OUT = join(DATA, "work/shape-out"); mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "liner-moved-core.mjs"), r.outputFiles[0].text);
const core = await import(pathToFileURL(join(OUT, "liner-moved-core.mjs")).href);
// 기준을 바꿔 보기: SIDE (양옆 폭, 눈 폭 비율) · MIN (선 값) · DARK (맨얼굴보다 어두워진 정도). 안 주면 코드의 값 그대로
for (const [env, key] of [["SIDE", "side"], ["MIN", "min"], ["DARK", "dark"]]) if (process.env[env]) core.TAIL_RIDGE[key] = Number(process.env[env]);
console.log(`기준 — 양옆 폭 ${core.TAIL_RIDGE.side} · 선 값 ${core.TAIL_RIDGE.min} · 어두워짐 ${core.TAIL_RIDGE.dark}`);
const png = (f) => { const p = PNG.sync.read(readFileSync(f)); return { data: p.data, w: p.width, h: p.height }; };
// BASE=<이름>: 맨얼굴 대신 그 판을 기준으로 (화장 없는 사진을 모델에 넣어 받은 판 — 모델이 눈 모양을 바꿔 생기는 선을 빼려고)
const bare = core.frameOf(png(process.env.BASE ? `${H}/moved_${process.env.BASE}.png` : `${H}/${BARE}.png`), JSON.parse(readFileSync(`${H}/${BARE}.lm.json`, "utf8")));
if (process.env.BASE) console.log(`기준 그림: ${process.env.BASE}`);
const o = core.at(bare.lm, core.LM.eyeA.outer), i = core.at(bare.lm, core.LM.eyeA.inner), f2 = (v) => (v == null ? "  없음" : v.toFixed(2).padStart(6));
console.log(`맨얼굴 ${bare.im.w} x ${bare.im.h} · 눈 폭 ${Math.hypot(o.x - i.x, o.y - i.y).toFixed(0)}px   (R = 본인 오른쪽 눈 = 사진 왼쪽)`);
for (const f of readdirSync(H).filter((n) => PAT.test(n)).sort()) {
  const im = png(`${H}/${f}`);
  console.log(`${f.replace(/^moved_|\.png$/g, "").padEnd(18)} 꼬리 R ${f2(core.ridgeTail(bare, im, "R"))} · L ${f2(core.ridgeTail(bare, im, "L"))}`);
}
