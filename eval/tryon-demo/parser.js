// 학습한 얼굴 부위 분할 모델을 브라우저에서 돌린다 (SNOW 방식 ② 단계).
//
// 얼굴 점으로 만든 다각형은 사람마다 다른 입술 모양을 따라가지 못해 색이 밖으로 샌다.
// 이 모델은 픽셀마다 "배경·피부·눈썹·눈·입술" 중 무엇인지 판단한다. 그 결과를 마스크로 써서
// 화장을 칠하면 경계가 실제 얼굴을 따라간다.
//
// 모델은 train/face_parsing/ 에서 학습해 ONNX 로 내보낸 것을 쓴다.
// 없으면 이 파일은 조용히 꺼지고, paint.js 는 기존 다각형 방식으로 돈다.

const MODEL_URL = "./data/face_parser.onnx";
const SIZE = 256; // 학습할 때와 같은 입력 크기
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
// 모델이 내놓는 번호 — train/face_parsing/prep_data.py 의 CLASSES 와 같은 순서
export const LABEL = { BG: 0, SKIN: 1, BROW: 2, EYE: 3, LIP: 4 };

let session = null;
let ort = null;
const work = document.createElement("canvas");
work.width = work.height = SIZE;
const wctx = work.getContext("2d", { willReadFrequently: true });

/** 모델을 불러온다. 파일이 없으면 null 을 돌려주고 호출한 쪽은 기존 방식으로 돈다. */
export async function loadParser() {
  if (session) return session;
  try {
    const head = await fetch(MODEL_URL, { method: "HEAD" });
    if (!head.ok) return null;
    // .mjs 가 ES 모듈 판이다 (.js 는 UMD 라 import 하면 빈 껍데기가 온다)
    const mod = await import("https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/ort.webgpu.min.mjs");
    ort = mod.default ?? mod;
    ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/";
    // webgpu 가 되면 그쪽이 훨씬 빠르고, 안 되면 wasm 으로 내려간다
    const providers = navigator.gpu ? ["webgpu", "wasm"] : ["wasm"];
    session = await ort.InferenceSession.create(MODEL_URL, { executionProviders: providers });
    return session;
  } catch (e) {
    console.warn("분할 모델을 못 불러왔습니다. 얼굴 점 방식으로 돕니다.", e);
    return null;
  }
}

/**
 * 얼굴 점으로 얼굴 부분만 잘라 모델에 넣고, 부위 번호가 담긴 판을 돌려준다.
 * 학습할 때도 얼굴만 잘라 넣었으므로(prep_data.py 의 face_box) 같은 방식으로 맞춘다.
 * @returns {{data: Uint8Array, size: number, box: number[]}|null}
 *   data = SIZE*SIZE 칸마다 부위 번호, box = 원본에서 잘라낸 자리 [x0,y0,x1,y1]
 */
export async function parseFace(source, lm, w, h) {
  if (!session) return null;
  const xs = [], ys = [];
  for (let i = 0; i < 468; i++) { xs.push(lm[i].x * w); ys.push(lm[i].y * h); }
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const half = (Math.max(x1 - x0, y1 - y0) * 1.35) / 2;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const box = [cx - half, cy - half, cx + half, cy + half];

  wctx.clearRect(0, 0, SIZE, SIZE);
  wctx.drawImage(source, box[0], box[1], half * 2, half * 2, 0, 0, SIZE, SIZE);
  const px = wctx.getImageData(0, 0, SIZE, SIZE).data;

  // 학습할 때와 같은 방식으로 숫자를 맞춘다 (0~1 로 줄이고 평균·표준편차로 정규화)
  const input = new Float32Array(3 * SIZE * SIZE);
  const plane = SIZE * SIZE;
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) input[c * plane + i] = (px[i * 4 + c] / 255 - MEAN[c]) / STD[c];
  }
  const out = await session.run({ image: new ort.Tensor("float32", input, [1, 3, SIZE, SIZE]) });
  const logits = out[session.outputNames[0]].data;

  // 픽셀마다 점수가 가장 높은 부위를 고른다
  const nc = logits.length / plane;
  const mask = new Uint8Array(plane);
  for (let i = 0; i < plane; i++) {
    let best = 0, bv = logits[i];
    for (let c = 1; c < nc; c++) {
      const v = logits[c * plane + i];
      if (v > bv) { bv = v; best = c; }
    }
    mask[i] = best;
  }
  return { data: mask, size: SIZE, box, srcW: w, srcH: h };
}

/**
 * 부위 번호 판에서 한 부위만 꺼내 원본 크기의 흑백 그림으로 만든다.
 * paint.js 가 이 그림을 "칠할 자리"로 쓴다.
 */
export function maskToCanvas(parsed, label, w, h) {
  const { data, size, box, srcW } = parsed;
  // 원본보다 작은 판에 그릴 때는 잘라낸 자리도 같은 비율로 줄여야 한다
  const k = srcW ? w / srcW : 1;
  const small = document.createElement("canvas");
  small.width = small.height = size;
  const img = small.getContext("2d").createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const on = data[i] === label ? 255 : 0;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = on;
    img.data[i * 4 + 3] = on;
  }
  small.getContext("2d").putImageData(img, 0, 0);

  const full = document.createElement("canvas");
  full.width = w; full.height = h;
  const c = full.getContext("2d");
  c.imageSmoothingEnabled = true; // 256px 을 키우므로 계단이 지지 않게
  c.drawImage(small, box[0] * k, box[1] * k, (box[2] - box[0]) * k, (box[3] - box[1]) * k);
  return full;
}
