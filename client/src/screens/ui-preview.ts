/**
 * [dev 전용] 화면 미리보기 (ui-preview.html) — ⑥·③ 화면을 가짜 데이터로 폰 크기에 띄운다.
 * POC(poc/full) 디자인에 맞추는 작업을 눈으로 비교하려고 만들었다. 사람 사진은 쓰지 않는다.
 */

import "../app.css";
import type { RgbaImage } from "../core/color";
import { createLogger } from "../core/log";
import { mutableJobSource } from "../core/look-jobs";
import { LOOKS } from "../core/looks";
import type { CaptureBundle, JobStatus, LookJob, PartId, PartResult, Versions } from "../core/types";
import { doneScreen } from "./done";
import { fullRenderScreen } from "./fullrender";
import { looksScreen } from "./looks";
import { processingScreen } from "./processing";
import { resultScreen } from "./result";
import { reviewScreen } from "./review";
import type { Screen, ScreenContext } from "./shell";
import { BARE, LMS, guide, image, linerPaint } from "../../tests/helpers/synth-face";

const BARE_IMAGE = BARE.im;

const ver: Versions = { app: "preview", score: "score-v0.1", look: "look-v0.1", faceshape: "faceshape-rule-v1", transfer: "preview" };

/** 단색 자리표시 그림 (룩 결과 대신) — 룩마다 색만 다르게 */
function swatch(label: string, hue: number): string {
  const c = document.createElement("canvas");
  c.width = 300; c.height = 400;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 400);
  grad.addColorStop(0, `hsl(${hue} 30% 82%)`);
  grad.addColorStop(1, `hsl(${hue} 35% 68%)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 300, 400);
  g.fillStyle = "rgba(0,0,0,.35)";
  g.font = "bold 28px sans-serif";
  g.textAlign = "center";
  g.fillText(label, 150, 210);
  return c.toDataURL("image/png");
}

const job = (lookId: string, status: JobStatus, i: number): LookJob => ({
  job_id: `j-${lookId}`, look_id: lookId, status, result_url: status === "done" ? swatch(LOOKS[i]!.name, (i * 37) % 360) : null,
  layer: null, identity: { cos: 0.9 }, ms: 1200, queue_ms: 30, error: null, ver,
});

const part = (partId: PartId, over: Partial<PartResult> = {}): PartResult => ({
  partId, status: "passed", score: 80, diagnosisCodes: [], diagnosis: "", checkReason: null, lrIndex: null, metrics: {}, attempts: 1, updatedAt: 0, ...over,
});

async function bitmapOf(im: RgbaImage): Promise<ImageBitmap> {
  return createImageBitmap(new ImageData(Uint8ClampedArray.from(im.data), im.w, im.h));
}

const root = document.getElementById("root") as HTMLElement;
let cleanup: void | (() => void);
const ctx = (screen: string): ScreenContext<null> => ({
  root, session: null,
  go: (to) => console.log("go", to),
  goPart: (p) => console.log("goPart", p),
  log: createLogger({ sid: "preview", screen: screen as never, part: null, ver }, () => {}),
});

let lookId: string | null = "smoky";
const jobs = mutableJobSource(LOOKS.map((l, i) => job(l.id, i === 7 ? "running" : "done", i)));

const SCREENS: Record<string, () => Promise<Screen<null>>> = {
  "서버 처리": async () => processingScreen<null>({ jobs: mutableJobSource(LOOKS.map((l) => ({ ...job(l.id, "running", 0) }))) }),
  "2 룩": async () => looksScreen<null>({ jobs, getLookId: () => lookId, setLookId: (id) => { lookId = id; } }),
  "2-b 완성 예상": async () => fullRenderScreen<null>({ jobs, getLookId: () => lookId }),
  "5 결과 (라이너)": async () => {
    const bare = await bitmapOf(BARE_IMAGE), made = image(linerPaint());
    const frame = await bitmapOf(made);
    const bundle: CaptureBundle = { frames: [frame], pts: [LMS], handOverlap: [null], foreheadL: [70] };
    const baseline = { lm: LMS, unit: { eye: 90, lip: 120, face: 400 }, foreheadL: 70, scleraLab: null, faceShape: { label: "oval" as const, confidence: 1, method: "rule" as const, version: "t" }, bareImage: bare, w: 600, h: 600 };
    return resultScreen<null>({
      getPart: () => "liner", getBaseline: () => baseline, getCapture: () => bundle, guide: () => guide,
      getStatus: () => "in_progress", apply: () => {}, skip: () => {}, nextPart: () => "shadow",
      toRgba: async (src) => (src === bare ? BARE_IMAGE : made),
    });
  },
  "6 리뷰": async () => reviewScreen<null>({
    getParts: () => [
      part("brow", { score: 87, diagnosis: "오른쪽 눈썹 꼬리가 덜 그려졌어요" }), part("liner", { score: 78, diagnosis: "오른쪽 선 중간이 끊겼어요" }),
      part("shadow", { score: 86 }), part("lip", { score: 87, diagnosis: "잘 됐어요" }), part("cheek", { score: 88 }),
      part("contour", { status: "check_only", score: null, checkReason: "contour" }),
    ],
    getLookName: () => "스모키", lightingNote: () => null,
    store: { clearAll: async () => ({ remaining: 0 }), loadImage: async () => null },
    makeCard: async () => null, shareEnv: { download: () => {} },
  }),
  끝: async () => doneScreen<null>({ restart: () => {}, remaining: () => 0 }),
};

async function show(name: string): Promise<void> {
  if (typeof cleanup === "function") cleanup();
  root.innerHTML = "";
  for (const b of document.querySelectorAll<HTMLButtonElement>("#pick button")) b.classList.toggle("on", b.textContent === name);
  const s = await SCREENS[name]!();
  cleanup = s.mount(ctx(name));
  history.replaceState(null, "", `#${encodeURIComponent(name)}`);
}

const pick = document.getElementById("pick")!;
for (const name of Object.keys(SCREENS)) {
  const b = document.createElement("button");
  b.textContent = name;
  b.onclick = () => void show(name);
  pick.append(b);
}
void show(decodeURIComponent(location.hash.slice(1)) || "2 룩");
